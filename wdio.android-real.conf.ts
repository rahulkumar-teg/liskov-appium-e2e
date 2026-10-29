// android-real: one pinned, unlocked real device (ANDROID_SERIAL; emulators refused). Shared settings: wdio.base.ts.
// Appium: `APPIUM_PORT=4725 scripts/appium-dev.sh start`. Work-profile apps: APP_USER_ID (e.g. 10) → appium:userProfile.
import { androidConfig, setTarget, specList, type Config } from './wdio.base.js';

setTarget('android-real');
const udid = process.env['ANDROID_SERIAL'];
if (!udid) throw new Error('INFRA:CONFIG ANDROID_SERIAL is required (pin the run to one device)');
if (/^emulator-/.test(udid)) throw new Error(`INFRA:CONFIG ${udid} is an emulator; use wdio.android-emu.conf.ts`);

export const config: Config = androidConfig(udid, specList('ANDROID_SPECS'));
