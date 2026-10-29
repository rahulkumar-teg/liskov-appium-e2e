// SQLite run history (plan §4.26): ~/.liskov-appium/history.db. Written in onComplete (Phase 2 wiring).
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Lease, LeaseEvents, LeaseOwner } from '../accounts/AccountCoordinator.js';

export const SCHEMA_VERSION = 1;
const schemaSql = () => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

export type CaseStatus = 'passed' | 'failed' | 'skipped' | 'broken' | 'infra';

export class RunHistory {
  readonly db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(schemaSql());
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  static at(stateDir: string): RunHistory {
    return new RunHistory(path.join(stateDir, 'history.db'));
  }

  startRun(r: { runId: string; startedAt: number; target?: string; appCommit?: string; build?: string; installMode?: 'none' | 'auto'; flagsSource?: string }): void {
    this.db
      .prepare(`INSERT INTO runs(run_id, started_at, target, app_commit, build, install_mode, flags_source, result) VALUES (?,?,?,?,?,?,?,'running')`)
      .run(r.runId, r.startedAt, r.target ?? null, r.appCommit ?? null, r.build ?? null, r.installMode ?? null, r.flagsSource ?? null);
  }

  finishRun(runId: string, result: 'pass' | 'fail' | 'infra' | 'aborted'): void {
    this.db.prepare(`UPDATE runs SET result = ? WHERE run_id = ?`).run(result, runId);
  }

  recordCase(c: { runId: string; caseId: string; deviceId: string; startedAt: number; status: CaseStatus; durationMs?: number; infraCode?: string; retried?: boolean; skipReason?: string }): void {
    this.db
      .prepare(`INSERT INTO cases(run_id, case_id, device_id, started_at, status, duration_ms, infra_code, retried, skip_reason) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(c.runId, c.caseId, c.deviceId, c.startedAt, c.status, c.durationMs ?? null, c.infraCode ?? null, c.retried ? 1 : 0, c.skipReason ?? null);
  }

  /** LeaseEvents adapter for FileLeaseStore: every take/release lands here; A4 takeover ⇒ serial_takeover = 1. */
  leaseEvents(): LeaseEvents {
    return {
      onTaken: (l: Lease, o: LeaseOwner) => {
        this.db
          .prepare(`INSERT INTO leases(run_id, role, account_ref, device_id, taken_at, serial_takeover) VALUES (?,?,?,?,?,?)`)
          .run(o.runId, l.role, l.accountRef, o.deviceId, l.acquiredAt, l.mustCleanBeforeUse ? 1 : 0);
      },
      onReleased: (l: Lease, o: LeaseOwner | null) => {
        if (!o) return;
        this.db
          .prepare(`UPDATE leases SET released_at = ? WHERE run_id = ? AND account_ref = ? AND device_id = ? AND released_at IS NULL`)
          .run(Date.now(), o.runId, l.accountRef, o.deviceId);
      },
    };
  }

  /** Flake report core (§4.26): cases that flipped status ≥ minFlips times in the last `lastRuns` runs for a commit. */
  flaky(appCommit: string, lastRuns = 10, minFlips = 2): Array<{ case_id: string; flips: number }> {
    const rows = this.db
      .prepare(
        `SELECT c.case_id, c.status FROM cases c JOIN runs r ON r.run_id = c.run_id
         WHERE r.app_commit = ? AND c.run_id IN (SELECT run_id FROM runs WHERE app_commit = ? ORDER BY started_at DESC LIMIT ?)
           AND c.status IN ('passed','failed')
         ORDER BY c.case_id, c.started_at`,
      )
      .all(appCommit, appCommit, lastRuns) as Array<{ case_id: string; status: string }>;
    const out = new Map<string, { last?: string; flips: number }>();
    for (const r of rows) {
      const s = out.get(r.case_id) ?? { flips: 0 };
      if (s.last !== undefined && s.last !== r.status) s.flips++;
      s.last = r.status;
      out.set(r.case_id, s);
    }
    return [...out].filter(([, v]) => v.flips >= minFlips).map(([case_id, v]) => ({ case_id, flips: v.flips }));
  }

  close(): void {
    this.db.close();
  }
}
