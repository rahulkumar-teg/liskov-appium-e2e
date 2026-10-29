// Header state model (plan §4.6). Android parses the MANUAL_DOWNLOAD_ROW content-desc; iOS (Phase 2) derives from ids.
import { androidHeaderMap, type HeaderMapEntry } from '../../config/header-state.map.js';

export type HeaderState =
  | 'NOTHING'
  | 'DOWNLOADING_AA'
  | 'DOWNLOADING_PRINT'
  | 'WAITING_WIFI'
  | 'FAILED'
  | 'AA_DONE'
  | 'PRINT_DONE'
  | 'BOTH_DONE'
  | 'PARTIAL_DONE' // only "Manage" visible, format not readable: something IS downloaded (Rahul 10:24) — never NOTHING
  | 'LEGACY_DOWNLOAD'
  | 'LEGACY_DONE'
  | 'UNKNOWN';

/** Collapse whitespace, trim, normalise typographic apostrophes and HTML ampersand/ellipsis entities. */
export function normalise(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#8230;|\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function entryMatches(row: HeaderMapEntry, desc: string): boolean {
  const d = normalise(desc);
  const head = normalise(row.text);
  if (row.match === 'exact') return d === head;
  if (!d.startsWith(head)) return false;
  if (!row.action) return true;
  return d.slice(head.length).replace(/^[.\s]+/, '').startsWith(row.action);
}

/** First matching entry in map order wins; anything else is UNKNOWN (an AssertionError at the call site, never a pass). */
export function parseAndroidRow(desc: string, map: readonly HeaderMapEntry[] = androidHeaderMap): HeaderState {
  for (const row of map) if (entryMatches(row, desc)) return row.state;
  return 'UNKNOWN';
}

/** All entries that match, ignoring order — the contract requires exactly one per rendered string. */
export function allMatches(desc: string, map: readonly HeaderMapEntry[] = androidHeaderMap): HeaderState[] {
  return map.filter((r) => entryMatches(r, desc)).map((r) => r.state);
}

/** Android row: like parseAndroidRow, but an unparsed row that offers "Manage" means part of the edition is downloaded. */
export function parseAndroidRowOrPartial(desc: string, map: readonly HeaderMapEntry[] = androidHeaderMap): HeaderState {
  const st = parseAndroidRow(desc, map);
  if (st === 'UNKNOWN' && /\bManage\b/i.test(normalise(desc))) return 'PARTIAL_DONE';
  return st;
}

/** iOS labels carry the status text only (e.g. "Print edition downloaded."); the action is a separate button. */
export function parseIOSLabel(label: string, map: readonly HeaderMapEntry[] = androidHeaderMap): HeaderState {
  return parseAndroidRow(label, map.map((r) => ({ ...r, action: null })));
}

/** iOS: Manage button is visible. Use the downloaded-label text if it names a format; otherwise PARTIAL_DONE. */
export function iosManageState(labels: readonly string[]): HeaderState {
  for (const l of labels) {
    const st = parseIOSLabel(l);
    if (st === 'AA_DONE' || st === 'PRINT_DONE' || st === 'BOTH_DONE') return st;
  }
  return 'PARTIAL_DONE';
}
