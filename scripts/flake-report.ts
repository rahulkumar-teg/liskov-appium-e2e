// scripts/flake-report.ts [--window 10] [--min-flips 2] [--db ~/.liskov-appium/history.db] — read-only.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { flakyCases, type CaseRow } from '../src/history/flakes.js';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1]! : d;
};
const db = arg('--db', join(process.env['HOME'] ?? '.', '.liskov-appium', 'history.db'));
if (!existsSync(db)) {
  console.log(`no run history at ${db} — nothing to report`);
  process.exit(0);
}
const rows = new Database(db, { readonly: true, fileMustExist: true })
  .prepare(`SELECT c.case_id, r.app_commit, c.started_at, c.status FROM cases c JOIN runs r USING(run_id)`)
  .all() as CaseRow[];
const flakes = flakyCases(rows, Number(arg('--window', '10')), Number(arg('--min-flips', '2')));
console.log(`${rows.length} case rows; ${flakes.length} flaky`);
for (const f of flakes) console.log(`${f.caseId}\t${f.appCommit ?? '-'}\tflips=${f.flips}\t${f.statuses.join(',')}`);
