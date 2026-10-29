// Shared WDIO settings for every per-target config (wdio.android-real / android-emu / ios-real .conf.ts).
// noReset attach to the already-installed app (D1: INSTALL_MODE=none): no install, no pm clear, no reset.
// Appium is started separately (scripts/appium-dev.sh, framework-local APPIUM_HOME). Secrets never enter capabilities.
// L0 contracts never run under WDIO: they have their own Mocha runner (.mocharc.contract.cjs).
import './src/core/loadSettings.js';
import type { Capabilities, Options } from '@wdio/types';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dismissOne, dismissPopups } from './specs/support/popups.js';
import type { Target } from './specs/support/gate.js';

export type Config = Options.Testrunner & { capabilities: Capabilities.TestrunnerCapabilities };

/** The config file decides the target; specs/support/gate.ts reads it from TARGET (set before any spec loads). */
export function setTarget(t: Target): void {
  process.env['TARGET'] = t;
}

/** APPIUM_PORT (default 4725), refusing the ports reserved for other tools. */
export function appiumPort(): number {
  const port = Number(process.env['APPIUM_PORT'] ?? 4725);
  if ([4000, 4003, 4005, 9090].includes(port)) throw new Error(`INFRA:CONFIG APPIUM_PORT ${port} is reserved`);
  return port;
}

/** Comma-separated spec list from ANDROID_SPECS / IOS_SPECS (default: the EP-03 smoke). */
export function specList(envKey: 'ANDROID_SPECS' | 'IOS_SPECS'): string[] {
  return (process.env[envKey] ?? './specs/epaper/ep03-*.spec.ts').split(',');
}

/** Failure evidence (screenshot + page source) under EVIDENCE_DIR/<EP-nn>/; never asserted on. */
async function failEvidence(suite: string, title: string): Promise<void> {
  const ep = /EP-\d+/.exec(suite)?.[0] ?? 'misc';
  const dir = join(process.env['EVIDENCE_DIR'] ?? 'reports/evidence', ep);
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `FAIL-${Date.now()}-${title.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}`);
  await browser.saveScreenshot(`${base}.png`).catch(() => undefined);
  writeFileSync(`${base}.xml`, await browser.getPageSource().catch(() => ''));
  console.log(`failure evidence: ${base}.{png,xml}`);
}

/** Wait until the main tab bar is up (`home` visible), dismissing any known popup on the way; then clear the rest. */
export async function settleHome(home: () => Promise<boolean>, interval = 500): Promise<void> {
  // Condition wait, not a fixed window (a fixed 15 s window kept polling past a spec's gate skip and raced the teardown).
  await browser.waitUntil(async () => (await dismissOne(browser)) !== null || (await home().catch(() => false)), { timeout: 30_000, interval }).catch(() => undefined);
  await dismissPopups(browser, 0);
}

/** Everything except specs, capabilities and before(). */
export function baseConfig(port: number): Omit<Config, 'capabilities'> {
  return {
    runner: 'local',
    hostname: '127.0.0.1',
    port,
    path: '/',
    exclude: ['./specs/support/**'],
    maxInstances: 1,
    connectionRetryCount: 0,
    logLevel: 'warn', // typeSecret() also silences command logging while typing (§4.25)
    async afterTest(test, _ctx, { passed, error }) {
      // A mid-test skipCase (this.skip) arrives as passed=false with a Pending "sync skip" error; that is not a failure.
      const skipped = !error || (error as Error).name === 'Pending' || /^sync skip/i.test((error as Error).message ?? '');
      if (!passed && !skipped) await failEvidence(test.parent, test.title);
    },
    async afterHook(test, _ctx, { error }) {
      if (error) await failEvidence(test.parent, test.title ?? 'hook');
    },
    framework: 'mocha',
    mochaOpts: { ui: 'bdd', timeout: 15 * 60_000, retries: 0 },
    reporters: ['dot', ['allure', { outputDir: process.env['ALLURE_DIR'] ?? 'allure-results', disableWebdriverStepsReporting: true, disableWebdriverScreenshotsReporting: false }]],
  };
}

const APP_PACKAGE = process.env['APP_PACKAGE'] ?? 'com.economist.lamarr';

/**
 * Android (UiAutomator2) attach: one pinned serial, app already installed for `--user 0` (or APP_USER_ID).
 * Server APKs + io.appium.settings are pre-installed with `adb install --user 0` (skipServerInstallation): a plain
 * install would leak into other Android users (work profile / private space).
 */
export function androidConfig(udid: string, specs: string[]): Config {
  // Typed loosely: some UiAutomator2 caps (disableIdLocatorAutocompletion, skipServerInstallation) are not in @wdio/types.
  const caps: Record<string, unknown> = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': udid,
    'appium:appPackage': APP_PACKAGE,
    'appium:appActivity': process.env['APP_ACTIVITY'] ?? 'com.economist.liskov.feature.main.MainActivity',
    'appium:noReset': true,
    'appium:fullReset': false,
    'appium:autoLaunch': true,
    'appium:dontStopAppOnReset': true,
    'appium:autoGrantPermissions': false,
    'appium:disableWindowAnimation': false,
    'appium:newCommandTimeout': 300,
    'appium:uiautomator2ServerLaunchTimeout': 120_000,
    'appium:uiautomator2ServerInstallTimeout': 120_000,
    'appium:adbExecTimeout': 60_000,
    'appium:systemPort': Number(process.env['UIA2_SYSTEM_PORT'] ?? 8213),
    'appium:skipServerInstallation': true,
    // Compose testTags are bare resource-ids (no 'pkg:id/'); stop UiAutomator2 prefixing the package onto id= selectors.
    'appium:disableIdLocatorAutocompletion': true,
    'appium:skipDeviceInitialization': true,
  };
  if (process.env['APP_USER_ID']) caps['appium:userProfile'] = Number(process.env['APP_USER_ID']);
  return {
    ...baseConfig(appiumPort()),
    specs,
    capabilities: [caps as WebdriverIO.Capabilities],
    // noReset + an already-running app: Appium attaches but leaves it in the background. Bring it to the front
    // (activateApp = am start of the launcher activity; no force-stop, so the session is kept).
    async before() {
      await browser.activateApp(APP_PACKAGE);
      // scripts/login.ts only: an interrupted login may have left the app's login Custom Tab on top; the login flow resumes there.
      if (process.env['LOGIN_FLOW'] === '1' && (await browser.getCurrentPackage()) === 'com.android.chrome') return;
      await browser.waitUntil(async () => (await browser.getCurrentPackage()) === APP_PACKAGE, { timeout: 30_000, timeoutMsg: `${APP_PACKAGE} never came to the foreground` });
      await settleHome(() => browser.$('android=new UiSelector().resourceId("liskov-text").text("Weekly")').isDisplayed());
    },
  };
}
