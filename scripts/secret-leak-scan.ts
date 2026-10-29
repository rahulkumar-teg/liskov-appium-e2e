// `npx tsx scripts/secret-leak-scan.ts [paths…]` — prints ONLY booleans / file names, never a value.
// Takes every non-settings value from .env (length ≥ 8) and checks whether it appears in the given files/dirs
// (default: reports/, allure-results/, allure-report/, config/, docs/, src/, specs/, tests/, scripts/, ~/.liskov-appium/ and the
// top-level README, .env.example, Makefile, package.json and wdio configs).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SETTINGS_KEYS, readDotenv } from '../src/core/dotenv.js';

// Test-account credentials (USERn_EMAIL / USERn_PASSWORD, t791u) are always checked, whatever their length, and the
// email also in lower case (pages and logs may lowercase it).
const ACCOUNT_KEY = /^USER\d+_(EMAIL|PASSWORD)$/;
const values = Object.entries(readDotenv())
  // USERn_ROLE is a label (e.g. the role name), not a secret.
  .filter(([k, v]) => !SETTINGS_KEYS.has(k) && !/^USER\d+_ROLE$/.test(k) && (v.length >= 8 || (ACCOUNT_KEY.test(k) && v.length >= 3)))
  .flatMap(([k, v]) => (/_EMAIL$/.test(k) && v.toLowerCase() !== v ? [v, v.toLowerCase()] : [v]))
  .map((v) => Buffer.from(v, 'utf8'));
const roots = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['reports', ...readdirSync('.').filter((d) => /^allure-/.test(d)), 'config', 'docs', 'src', 'specs', 'tests', 'scripts', path.join(os.homedir(), '.liskov-appium'), 'README.md', '.env.example', 'Makefile', 'package.json', 'wdio.base.ts', 'wdio.android-real.conf.ts', 'wdio.android-emu.conf.ts', 'wdio.ios-real.conf.ts'];
const files: string[] = [];
const walk = (p: string) => {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) {
    // Skip installed tools, app build output (the app itself embeds its own .env keys) and local backups of .env.
    if (/node_modules|appium-home|main-build|android-build|wda-derived|backups/.test(path.basename(p))) return;
    for (const e of readdirSync(p)) walk(path.join(p, e));
  } else if (st.isFile() && st.size < 200 * 1024 * 1024) files.push(p);
};
roots.forEach(walk);
const hits = files.filter((f) => {
  const b = readFileSync(f);
  return values.some((v) => b.includes(v));
});
console.log(`secret values checked: ${values.length}; files scanned: ${files.length}`);
console.log(`any secret value found: ${hits.length > 0}`);
for (const h of hits) console.log(`  found in: ${h}`);
process.exit(hits.length ? 1 : 0);
