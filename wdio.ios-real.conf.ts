// ios-real: one pinned, REGISTERED iPhone (IOS_UDID, config/devices.yaml). Shared settings: wdio.base.ts.
// Attaches to the installed app (noReset): no install, no reset, no keychain. Appium: `APPIUM_PORT=4726 scripts/appium-dev.sh start`.
// WDA signing comes from git-ignored config/wda.local.json (values never printed).
import { existsSync, readFileSync } from 'node:fs';
import { iosWeekly } from './src/locators/ios/viewer.js';
import { appiumPort, baseConfig, setTarget, settleHome, specList, type Config } from './wdio.base.js';

setTarget('ios-real');
type WdaLocal = { xcodeOrgId?: string; xcodeSigningId?: string; updatedWDABundleId?: string; derivedDataPath?: string };
const wdaFile = new URL('./config/wda.local.json', import.meta.url);
const wda: WdaLocal = existsSync(wdaFile) ? (JSON.parse(readFileSync(wdaFile, 'utf8')) as WdaLocal) : {};
const wdaCaps: Record<string, unknown> = {};
if (wda.xcodeOrgId) wdaCaps['appium:xcodeOrgId'] = wda.xcodeOrgId;
if (wda.xcodeSigningId) wdaCaps['appium:xcodeSigningId'] = wda.xcodeSigningId;
if (wda.updatedWDABundleId) wdaCaps['appium:updatedWDABundleId'] = wda.updatedWDABundleId;
if (wda.derivedDataPath) {
  wdaCaps['appium:derivedDataPath'] = wda.derivedDataPath;
  wdaCaps['appium:usePrebuiltWDA'] = process.env['WDA_REBUILD'] !== '1';
}

const udid = process.env['IOS_UDID'];
if (!udid) throw new Error('INFRA:CONFIG IOS_UDID is required (pin the run to one registered device)');
const bundleId = process.env['APP_BUNDLE_ID'] ?? 'com.economist.lamarr';

export const config: Config = {
  ...baseConfig(appiumPort()),
  specs: specList('IOS_SPECS'),
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': udid,
      'appium:bundleId': bundleId,
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:autoAcceptAlerts': false,
      'appium:newCommandTimeout': 300,
      'appium:wdaLocalPort': Number(process.env['WDA_LOCAL_PORT'] ?? 8111),
      'appium:showXcodeLog': false,
      'appium:wdaLaunchTimeout': 120_000,
      'appium:wdaConnectionTimeout': 120_000,
      ...wdaCaps,
    },
  ],
  // Bring the installed app to the front (activateApp; no terminate, so the session is kept), then wait for the
  // Weekly tab, dismissing known popups (system alerts: safe choice only) on the way.
  async before() {
    await browser.execute('mobile: activateApp', { bundleId });
    await settleHome(() => browser.$(iosWeekly.tab).isDisplayed(), 1000);
  },
};
