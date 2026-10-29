// Flake detection (plan §4.26): a case is flaky when its status flipped ≥ minFlips times in its last
// `window` runs at the same app commit. Humans decide @quarantine (§7.7); nothing is quarantined automatically.
export interface CaseRow {
  case_id: string;
  app_commit: string | null;
  started_at: number;
  status: string;
}
export interface Flake {
  caseId: string;
  appCommit: string | null;
  flips: number;
  statuses: string[];
}
export function flakyCases(rows: CaseRow[], window = 10, minFlips = 2): Flake[] {
  const groups = new Map<string, CaseRow[]>();
  for (const r of rows) {
    if (r.status === 'skipped') continue; // skips are not signal
    const k = `${r.case_id}\0${r.app_commit ?? ''}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out: Flake[] = [];
  for (const g of groups.values()) {
    const last = g.sort((a, b) => b.started_at - a.started_at).slice(0, window).reverse();
    let flips = 0;
    for (let i = 1; i < last.length; i++) if (last[i]!.status !== last[i - 1]!.status) flips++;
    if (flips >= minFlips) out.push({ caseId: last[0]!.case_id, appCommit: last[0]!.app_commit, flips, statuses: last.map((r) => r.status) });
  }
  return out.sort((a, b) => b.flips - a.flips || a.caseId.localeCompare(b.caseId));
}
