// scripts/login-page-guard.ts [--env stage|prod] [--update] — plan §4.27. GET only, never submits.
// Exit 0 = matches snapshot; exit 3 = INFRA:LOGIN_FORM_CHANGED (diff printed); --update rewrites the snapshot (human decision).
// Note: the page may be client-rendered; then the snapshot is of the server HTML (a Playwright variant is a later option).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { endpoints, type Env } from '../config/environments.js';
import { diffForm, snapshotForm, type FormField } from '../src/services/loginForm.js';

const env = (process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : 'stage') as Env;
const file = `config/login-page.snapshot.${env}.json`;
const r = await fetch(endpoints[env].loginPage, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'liskov-appium-e2e login-page-guard' } });
if (r.status !== 200) {
  console.error(`INFRA:LOGIN_FORM_CHANGED login page HTTP ${r.status}`);
  process.exit(3);
}
const fields = snapshotForm(await r.text());
if (process.argv.includes('--update') || !existsSync(file)) {
  writeFileSync(file, JSON.stringify({ url: endpoints[env].loginPage, takenAt: new Date().toISOString(), fields }, null, 2) + '\n');
  console.log(`snapshot written: ${file} (${fields.length} fields)`);
  process.exit(0);
}
const exp = (JSON.parse(readFileSync(file, 'utf8')) as { fields: FormField[] }).fields;
const d = diffForm(exp, fields);
if (d.length) {
  console.error(`INFRA:LOGIN_FORM_CHANGED ${d.length} difference(s):\n${d.join('\n')}`);
  process.exit(3);
}
console.log(`login form unchanged (${fields.length} fields)`);
