// `npm run register-device -- <id> [--env-set-by <name>] [--dry-run]` — CONFIG ONLY (plan §4.21).
// Creates config/devices.yaml from config/devices.example.yaml if absent, then marks <id> registered.
// Never touches a device (no devicectl / adb / simctl / Appium). A real device becomes `registered` only with
// --env-set-by: the human who confirmed Debug ▸ Environment = Staging on it (§4.12). Without it the entry stays
// `pending` (identity fields kept) and the missing confirmation is printed.
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import YAML from 'yaml';
import { DevicesFile } from '../src/core/DeviceRegistry.js';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const envSetBy = flag('--env-set-by');
const dry = args.includes('--dry-run');
const file = 'config/devices.yaml';
if (!id) {
  console.error('usage: register-device <id> [--env-set-by <name>] [--dry-run]');
  process.exit(2);
}
if (!existsSync(file)) {
  if (dry) console.log(`would create ${file} from config/devices.example.yaml`);
  else await copyFile('config/devices.example.yaml', file);
}
const doc = YAML.parseDocument(await readFile(existsSync(file) ? file : 'config/devices.example.yaml', 'utf8'));
const list = doc.get('devices') as YAML.YAMLSeq<YAML.YAMLMap>;
const entry = list.items.find((m) => m.get('id') === id);
if (!entry) {
  console.error(`${id} not in ${file}; add it from config/devices.example.yaml first`);
  process.exit(2);
}
const now = new Date();
const off = -now.getTimezoneOffset();
const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
const isoLocal = new Date(now.getTime() + off * 60_000).toISOString().replace(/\.\d{3}Z$/, '') + `${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
const real = String(entry.get('target')).endsWith('-real');
const udid = String(entry.get('udid') ?? '');
if (!udid || udid.startsWith('<')) {
  console.error(`${id}: needs a real udid before registering`);
  process.exit(2);
}
if (real && !envSetBy) {
  entry.set('status', 'pending');
  console.log(`${id}: kept PENDING — real devices need --env-set-by <human who confirmed Debug ▸ Environment = Staging> (§4.12)`);
} else {
  entry.set('status', 'registered');
  entry.set('registeredAt', isoLocal);
  if (envSetBy) {
    entry.set('envSetBy', envSetBy);
    entry.set('envSetAt', isoLocal);
  }
  console.log(`${id}: registered (${entry.get('gate')}) at ${isoLocal}`);
}
const r = DevicesFile.safeParse(doc.toJS());
if (!r.success) {
  console.error(r.error.issues.map((i) => i.message).join('; '));
  process.exit(1);
}
if (dry) console.log(doc.toString());
else await writeFile(file, doc.toString());
