import assert from 'node:assert/strict';
import path from 'node:path';
import { FileLeaseStore } from '../../src/accounts/FileLeaseStore.js';
import { RunHistory } from '../../src/history/RunHistory.js';
import { fakeEnv, tmpDir } from './_support.js';

describe('unit: RunHistory (SQLite, §4.26, A8)', () => {
  it('A8 indexes exist and the flake query uses cases_case_time', () => {
    const h = new RunHistory(':memory:');
    const idx = h.db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => (r as { name: string }).name);
    for (const n of ['cases_case_time', 'cases_run', 'leases_run']) assert.ok(idx.includes(n), `missing index ${n}`);
    const plan = h.db.prepare(`EXPLAIN QUERY PLAN SELECT status FROM cases WHERE case_id = ? ORDER BY started_at DESC LIMIT 10`).all('EP-01').map((r) => (r as { detail: string }).detail).join(' | ');
    assert.match(plan, /cases_case_time/);
    const plan2 = h.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM cases WHERE run_id = ?`).all('r').map((r) => (r as { detail: string }).detail).join(' | ');
    assert.match(plan2, /cases_run/);
    h.close();
  });

  it('records runs/cases and finds flaky cases', () => {
    const h = new RunHistory(':memory:');
    const st = ['passed', 'failed', 'passed', 'failed'] as const;
    st.forEach((s, i) => {
      h.startRun({ runId: `r${i}`, startedAt: i, appCommit: 'abc1234', target: 'ios-real' });
      h.recordCase({ runId: `r${i}`, caseId: 'EP-01', deviceId: 'd', startedAt: i, status: s });
      h.recordCase({ runId: `r${i}`, caseId: 'EP-02', deviceId: 'd', startedAt: i, status: 'passed' });
      h.finishRun(`r${i}`, s === 'passed' ? 'pass' : 'fail');
    });
    const f = h.flaky('abc1234');
    assert.equal(f.length, 1);
    assert.equal(f[0]?.case_id, 'EP-01');
    assert.ok((f[0]?.flips ?? 0) >= 2);
    h.close();
  });

  it('A4: lease events land in leases with serial_takeover', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const h = RunHistory.at(dir);
      h.startRun({ runId: 'crashed', startedAt: 0 });
      h.startRun({ runId: 'r2', startedAt: 1 });
      const env = fakeEnv({ pid: 1, alive: new Set([1]) });
      const pool = { core_digital: [{ ref: 'op://V/s/username', passwordRef: 'op://V/s/password', serial: true }] };
      const s = new FileLeaseStore({ stateDir: dir, ttlMs: 1_000, waitMs: 100, pollMs: 10, pool, env, events: h.leaseEvents() });
      await s.lease('core_digital', { runId: 'crashed', deviceId: 'd1' });
      env.t += 10_000;
      const l = await s.lease('core_digital', { runId: 'r2', deviceId: 'd2' });
      await s.release(l);
      const rows = h.db.prepare(`SELECT run_id, serial_takeover, released_at IS NOT NULL AS rel FROM leases ORDER BY taken_at`).all() as Array<{ run_id: string; serial_takeover: number; rel: number }>;
      assert.deepEqual(rows.map((r) => [r.run_id, r.serial_takeover, r.rel]), [['crashed', 0, 0], ['r2', 1, 1]]);
      assert.equal(path.basename(h.db.name), 'history.db');
      h.close();
    } finally {
      await cleanup();
    }
  });

  it('account_ref column holds references, schema rejects a non-0/1 flag', () => {
    const h = new RunHistory(':memory:');
    h.startRun({ runId: 'r', startedAt: 0 });
    assert.throws(() => h.db.prepare(`INSERT INTO leases(run_id, role, account_ref, device_id, taken_at, serial_takeover) VALUES ('r','b2b','op://x/y/z','d',0,2)`).run());
    h.close();
  });
});
