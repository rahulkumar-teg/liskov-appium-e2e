// `make contract-mutations`: proves the L0 contracts are not false-green. Copies ONLY the files in LISKOV_FILES from
// LISKOV_REPO (read-only) into a temp dir, applies one known-breaking mutation at a time, and expects ≥ 1 failure.
// A no-op control must stay green. Never writes to LISKOV_REPO.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LISKOV_FILES, type LiskovFile } from '../src/contract/LiskovRepo.js';

const src = (process.env['LISKOV_REPO'] ?? '').replace(/^~(?=\/|$)/, os.homedir());
if (!src) {
  console.error('INFRA:CONTRACT set LISKOV_REPO');
  process.exit(2);
}

type M = { name: string; file: LiskovFile; from: string; to: string; expectFail: boolean };
const muts: M[] = [
  { name: 'strings: PRINT_DONE text', file: 'stringsXml', from: 'Print edition downloaded.', to: 'Print edition saved.', expectFail: true },
  { name: 'strings: delete-dialog Cancel', file: 'stringsXml', from: '<string name="weekly_download_delete_confirm_action_cancel">Cancel</string>', to: '<string name="weekly_download_delete_confirm_action_cancel">Keep</string>', expectFail: true },
  { name: 'strings: no-internet title', file: 'stringsXml', from: 'There is no internet connection', to: 'No internet connection', expectFail: true },
  { name: 'labelWithAction 1 space', file: 'weeklyEditionCovers', from: 'append("  ")', to: 'append(" ")', expectFail: true },
  { name: 'XML default epaper flag', file: 'remoteConfigDefaults', from: '<key>epaper_pdf_download_enabled</key>\n        <value>true</value>', to: '<key>epaper_pdf_download_enabled</key>\n        <value>false</value>', expectFail: true },
  { name: 'Swift default epaper flag', file: 'iosInterfacesFeatureFlags', from: 'case .epaperPdfDownloadEnabled:\n            true', to: 'case .epaperPdfDownloadEnabled:\n            false', expectFail: true },
  { name: 'iOS defaultRegion', file: 'iosPdfUrlConstructor', from: 'static let defaultRegion = "NA"', to: 'static let defaultRegion = "EU"', expectFail: true },
  { name: 'iOS region blank-trim', file: 'iosPdfUrlConstructor', from: '$0.isEmpty ? nil', to: '$0.trimmingCharacters(in: .whitespaces).isEmpty ? nil', expectFail: true },
  { name: 'Android DEFAULT_PDF_REGION', file: 'weeklyViewModel', from: 'DEFAULT_PDF_REGION = "NA"', to: 'DEFAULT_PDF_REGION = "UK"', expectFail: true },
  { name: 'Android tag rename', file: 'androidTestTags', from: '"download-pdf-button"', to: '"view-pdf-button"', expectFail: true },
  { name: 'iOS a11y id rename', file: 'iosAccessibilityIds', from: '"edition-downloaded-label"', to: '"edition-downloaded-text"', expectFail: true },
  { name: 'control (no change)', file: 'stringsXml', from: 'Print edition downloaded.', to: 'Print edition downloaded.', expectFail: false },
];

let bad = 0;
for (const m of muts) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'liskov-mut-'));
  try {
    for (const rel of Object.values(LISKOV_FILES)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      cpSync(path.join(src, rel), path.join(dir, rel));
    }
    const f = path.join(dir, LISKOV_FILES[m.file]);
    const text = readFileSync(f, 'utf8');
    if (!text.includes(m.from)) {
      console.log(`SKIP  ${m.name}: pattern not found (source changed — update this mutation)`);
      bad++;
      continue;
    }
    writeFileSync(f, text.replace(m.from, m.to));
    const r = spawnSync('npx', ['mocha', '--config', '.mocharc.contract.cjs', '--reporter', 'dot'], { env: { ...process.env, LISKOV_REPO: dir }, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    const failing = Number(/(\d+) failing/.exec(out)?.[1] ?? 0);
    const ok = m.expectFail ? failing > 0 : failing === 0 && r.status === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'OK   ' : 'BAD  '} ${m.name.padEnd(30)} failing=${failing}${m.expectFail ? ' (expected ≥1)' : ' (expected 0)'}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(bad ? `contract-mutations: ${bad} problem(s)` : `contract-mutations: all ${muts.length} behaved as expected`);
process.exit(bad ? 1 : 0);
