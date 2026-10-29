// android-emu (t783u/t785u/t789u): ONLY emulator-5554, and only while it is the Pixel_10_Pro AVD (checked with
// `adb emu avd name` before every run). Every other serial is refused. Shared settings: wdio.base.ts.
// Appium: `APPIUM_PORT=4727 scripts/appium-dev.sh start`, UIA2 systemPort 8213. The app runs in user 0; the AVD's
// private space (user 10) is never targeted.
import { spawnSync } from 'node:child_process';
import { androidConfig, setTarget, specList, type Config } from './wdio.base.js';

setTarget('android-emu');
const EMU = 'emulator-5554', EMU_AVD = 'Pixel_10_Pro';
const udid = process.env['ANDROID_SERIAL'];
if (!udid) throw new Error('INFRA:CONFIG ANDROID_SERIAL is required (pin the run to one device)');
if (udid !== EMU) throw new Error(`INFRA:CONFIG ${udid} is not the allow-listed emulator ${EMU}`);
{
  const adb = process.env['ADB'] ?? `${process.env['HOME']}/Library/Android/sdk/platform-tools/adb`;
  const r = spawnSync(adb, ['-s', EMU, 'emu', 'avd', 'name'], { encoding: 'utf8', timeout: 20_000 });
  const avd = (r.stdout ?? '').split(/\r?\n/)[0]?.trim();
  if (avd !== EMU_AVD) throw new Error(`INFRA:CONFIG ${EMU} is AVD '${avd}', expected ${EMU_AVD}`);
}

export const config: Config = androidConfig(udid, specList('ANDROID_SPECS'));
