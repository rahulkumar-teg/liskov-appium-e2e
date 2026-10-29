// `npm run login -- [--relogin|--no-relogin] [--target android-emu|android-real|ios-real] [--serial <adb serial>|--udid <udid>] [--account user1] [--port 4727]`
// (or env TARGET / ANDROID_SERIAL / IOS_UDID / LOGIN_ACCOUNT / APPIUM_PORT / LOGIN_RELOGIN). `make login` wraps it.
// Logs in through the app UI (specs/maintenance/login.spec.ts → flows.loginViaSettings).
//   relogin off: already logged in as the account ⇒ exit 0; logged in as anyone else ⇒ exit 2 (WRONG_ACCOUNT), never logs out.
//   relogin on:  already logged in ⇒ log out via Settings, then log in again (default on android-emu, off on real devices).
// Captcha / 2FA / emailed code ⇒ exit 3 (LOGIN_CHALLENGE, stop). Secret value in the logs ⇒ exit 5. Bad arguments ⇒ exit 64.
// Credentials come from the framework .env via SecretsBroker (env:USER1_EMAIL / env:USER1_PASSWORD); never printed.
// Afterwards the run log, this port's Appium log and the evidence dir are leak-scanned (scripts/secret-leak-scan.ts).
// ios-sim is not supported yet (no wdio.ios-sim.conf.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountByKey } from '../config/accounts.js';

const args = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = arg('target') ?? process.env['TARGET'] ?? 'android-emu';
const account = arg('account') ?? process.env['LOGIN_ACCOUNT'] ?? 'user1';
// Relogin (t798u/t799u): default ON for the emulator, OFF for real devices (the owner's own account lives there)
// unless --relogin / LOGIN_RELOGIN=1 is given explicitly.
const reloginFlag = args.includes('--relogin') ? '1' : args.includes('--no-relogin') ? '0' : process.env['LOGIN_RELOGIN'];
const relogin = reloginFlag ?? (target === 'android-emu' ? '1' : '0');
const port = arg('port') ?? process.env['APPIUM_PORT'] ?? '4727';
if (!accountByKey(account)) {
  console.error(`login: unknown account key ${account} (config/accounts.ts)`);
  process.exit(64);
}

const env: NodeJS.ProcessEnv = { ...process.env, APPIUM_PORT: port, LOGIN_ACCOUNT: account, LOGIN_FLOW: '1', LOGIN_RELOGIN: relogin };
let conf: string;
if (target === 'android-emu' || target === 'android-real') {
  const serial = arg('serial') ?? process.env['ANDROID_SERIAL'];
  if (!serial) {
    console.error('login: --serial / ANDROID_SERIAL required');
    process.exit(64);
  }
  conf = target === 'android-emu' ? 'wdio.android-emu.conf.ts' : 'wdio.android-real.conf.ts';
  Object.assign(env, { TARGET: target, ANDROID_SERIAL: serial, UIA2_SYSTEM_PORT: process.env['UIA2_SYSTEM_PORT'] ?? '8213', ANDROID_SPECS: './specs/maintenance/login.spec.ts' });
} else if (target === 'ios-real') {
  const udid = arg('udid') ?? process.env['IOS_UDID'];
  if (!udid) {
    console.error('login: --udid / IOS_UDID required');
    process.exit(64);
  }
  conf = 'wdio.ios-real.conf.ts';
  Object.assign(env, { TARGET: 'ios-real', IOS_UDID: udid, IOS_SPECS: './specs/maintenance/login.spec.ts' });
} else {
  console.error(`login: unsupported target ${target}`);
  process.exit(64);
}

// Appium: reuse ours on this port if up, else start it (with the typed-value log filters).
const st = spawnSync('bash', ['scripts/appium-dev.sh', 'status'], { env, encoding: 'utf8' });
if (st.status !== 0) {
  const s = spawnSync('bash', ['scripts/appium-dev.sh', 'start'], { env, stdio: 'inherit' });
  if (s.status !== 0) process.exit(s.status ?? 1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = process.env['LOGIN_LOG_DIR'] ?? 'reports/login';
mkdirSync(dir, { recursive: true });
const log = path.join(dir, `login-${target}-${account}-${ts}.log`);
const fd = openSync(log, 'w');
console.log(`login: target=${target} account=${account} relogin=${relogin === '1' ? 'on' : 'off'} appium=${port} log=${log}`);
const r = spawnSync('npx', ['--no-install', 'wdio', 'run', conf], { env, stdio: ['ignore', fd, fd] });
closeSync(fd);
const out = readFileSync(log, 'utf8');
for (const l of out.split('\n')) if (/LOGIN |INFRA:|AssertionError|passing|failing|Error:/.test(l)) console.log(`  ${l.trim().slice(0, 240)}`);

const scan = spawnSync('npx', ['tsx', 'scripts/secret-leak-scan.ts', log, path.join(os.homedir(), '.liskov-appium', `appium-${port}.log`), process.env['EVIDENCE_DIR'] ?? 'reports/evidence'], { encoding: 'utf8' });
console.log(scan.stdout.trim().replace(/^/gm, '  leak-scan: '));
if (scan.status !== 0) {
  console.error('login: SECRET VALUE FOUND in logs — treat as an incident');
  process.exit(5);
}
if (r.status === 0) process.exit(0);
if (/INFRA:WRONG_ACCOUNT/.test(out)) process.exit(2);
if (/INFRA:LOGIN_CHALLENGE/.test(out)) process.exit(3);
process.exit(r.status ?? 1);
