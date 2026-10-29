/// <reference types="@wdio/globals/types" />
// Shared spec flows: start-state guard, entitlement check, owned-download tracking, network control.
import assert from 'node:assert/strict';
import { InfraError } from '../../src/core/errors.js';
import { accountByKey } from '../../config/accounts.js';
import { androidAccount, androidLoginPage } from '../../src/locators/android/account.js';
import { iosAccount, iosWeekly } from '../../src/locators/ios/viewer.js';
import { SecretsBroker } from '../../src/secrets/SecretsBroker.js';
import type { SecretString } from '../../src/secrets/SecretString.js';
import { typeSecret, type CommandLogControl } from '../../src/secrets/typeSecret.js';
import * as wdioLoggerNs from '@wdio/logger';
import { dismissOne, dumpBlocker } from './popups.js';
import { guardedClick } from './iosGuard.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { skipCase, target } from './gate.js';
import * as ui from './ui.js';

/** Owned-state tracker: specs set created=true the moment they start a download; after() cleans only then. */
export class Owned {
  created = false;
  async cleanup(): Promise<void> {
    if (this.created) await ui.cleanupOwn();
  }
}

const DOWNLOADED = ['AA_DONE', 'PRINT_DONE', 'BOTH_DONE', 'PARTIAL_DONE']; // PARTIAL_DONE = Manage-only (part downloaded)
/** How long we watch for the app re-downloading the edition by itself after our delete (auto-download setting). */
const REDOWNLOAD_WATCH_MS = Number(process.env['REDOWNLOAD_WATCH_MS'] ?? 10_000);

/**
 * Weekly + latest edition must start in NOTHING.
 * Owner-approved (Rahul, t755u: "if already installed, delete the edition"): when the edition is already downloaded
 * (Articles & audio and/or Print), it is deleted through the app's OWN Weekly Delete flow and NOTHING is verified,
 * then watched for an automatic re-download. Any other start state, a missing delete control, an unverified delete or
 * a re-download ⇒ SKIP PRECONDITION (no false greens). PRESERVE_OWNER_DOWNLOADS=1 restores the old never-delete rule.
 */
export async function startFromNothing(ctx: Mocha.Context, id: string): Promise<void> {
  await ui.openWeekly();
  let s = await ui.headerState();
  if (DOWNLOADED.includes(s) && process.env['PRESERVE_OWNER_DOWNLOADS'] !== '1') {
    const was = s;
    console.log(`${id} PRECONDITION-DELETE start: latest edition already downloaded (${was}); deleting via the app's Delete flow`);
    try {
      await ui.deleteExistingEdition(was);
    } catch (e) {
      if ((e as Error).message.startsWith('INFRA')) throw e; // another app / banner: fail loudly, never mask as a skip
      skipCase(ctx, 'PRECONDITION', `${id}: edition already downloaded (${was}) and the app's delete control could not be used (${(e as Error).message.split('\n')[0]?.slice(0, 120)})`);
    }
    s = await ui.waitState('NOTHING', 30_000).catch(() => ui.headerState());
    if (s !== 'NOTHING') skipCase(ctx, 'PRECONDITION', `${id}: deleted the already-downloaded edition (${was}) but the header did not verify NOTHING (now ${s})`);
    const back = await browser
      .waitUntil(async () => (await ui.headerState()) !== 'NOTHING', { timeout: REDOWNLOAD_WATCH_MS, interval: 1000 })
      .then(
        () => true,
        () => false,
      );
    if (back) {
      const now = await ui.headerState();
      console.log(`${id} PRECONDITION-DELETE re-download: edition went back to ${now} by itself after delete`);
      skipCase(ctx, 'PRECONDITION', `${id}: edition re-downloaded by itself after delete (now ${now}); the app's auto-download is likely on (not toggled by the framework)`);
    }
    console.log(`${id} PRECONDITION-DELETE verified: ${was} → NOTHING`);
  }
  if (s !== 'NOTHING') skipCase(ctx, 'PRECONDITION', `${id}: latest edition starts in ${s}, not NOTHING`);
}

/** Opens the Download menu; paywall ⇒ account not entitled ⇒ SKIP; no menu ⇒ AssertionError. */
export async function openMenuEntitled(ctx: Mocha.Context, id: string): Promise<void> {
  const r = await ui.openDownloadMenu();
  if (r === 'paywall') {
    await ui.closePaywall();
    skipCase(ctx, 'PRECONDITION', `${id}: paywall shown — signed-in account is not entitled (needs core_digital)`);
  }
  assert.equal(r, 'menu', 'Download menu did not open');
}

/** Download `kind` from NOTHING to its DONE state; records whether the in-progress state was observed. */
export async function downloadTo(ctx: Mocha.Context, id: string, kind: ui.Kind, owned: Owned): Promise<{ sawProgress: boolean }> {
  await openMenuEntitled(ctx, id);
  await ui.choose(kind);
  owned.created = true;
  const prog = kind === 'print' ? 'DOWNLOADING_PRINT' : 'DOWNLOADING_AA';
  const done = kind === 'print' ? 'PRINT_DONE' : 'AA_DONE';
  const sawProgress = await ui.waitState([prog, done], 15_000).then(
    (s) => s === prog,
    () => false,
  );
  console.log(`${id} in-progress ${prog} observed: ${sawProgress}`);
  const s = await ui.waitState([done, 'FAILED']);
  assert.equal(s, done, `${id}: download ended in ${s}`);
  return { sawProgress };
}

/** Real network path change (§4.13). iOS real: Airplane Mode via Control Center is not automated → InfraError. */
export async function setOnline(on: boolean): Promise<void> {
  if (target.startsWith('android')) {
    await browser.execute('mobile: setConnectivity', { wifi: on, data: on, airplaneMode: !on });
    return;
  }
  throw new InfraError('NETWORK_RESTORE', `offline control not automated on ${target} (Airplane Mode via Control Center is Phase 3)`);
}

// ---------- login via Settings (t791u / t792u: user1 on the allow-listed emulator only) ----------

/** WDIO command logging off while a secret is typed (Appium side is masked by config/appium-log-filters.json). */
type GetLogger = (name: string) => { setLevel(level: string): void };
const ns = wdioLoggerNs as unknown as { default?: GetLogger | { default?: GetLogger } };
const getLogger: GetLogger | undefined = typeof ns.default === 'function' ? ns.default : ns.default?.default;
const wdioLogSilencer: CommandLogControl = {
  async withLoggingSilenced<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof getLogger !== 'function') throw new InfraError('CONFIG', '@wdio/logger unavailable — refusing to type a secret with logging on');
    // getLogger(name) creates the logger if missing (getLogger.setLevel throws for names not created yet).
    const names = ['webdriver', 'webdriverio', '@wdio/utils', '@wdio/runner', '@wdio/local-runner'];
    for (const n of names) getLogger(n).setLevel('silent');
    try {
      return await fn();
    } finally {
      for (const n of names) getLogger(n).setLevel(process.env['WDIO_LOG_LEVEL'] ?? 'warn');
    }
  },
};

/**
 * Process stop + relaunch (terminateApp / activateApp — never pm clear, uninstall or clear data: the session survives),
 * then the central popup loop until Home is verified and quiet. A login Custom Tab left from an earlier attempt that is
 * still on top after the relaunch is closed with one back press (the app's own login flow only), then the app is activated.
 */
export async function freshLaunchToHome(secrets: SecretString[] = [], settleMs = 2500): Promise<string[]> {
  await browser.terminateApp(ui.BUNDLE);
  await browser.activateApp(ui.BUNDLE);
  if (!browser.isIOS) {
    for (let i = 0; i < 2; i++) {
      const front = await browser.waitUntil(async () => (await browser.getCurrentPackage().catch(() => '')) || false, { timeout: 15_000 }).catch(() => '');
      if (front === ui.BUNDLE) break;
      if (front === androidLoginPage.pkg && (await ui.shown(androidLoginPage.heading, 3000))) {
        console.log('FRESH LAUNCH: an old login page (Custom Tab) is on top — back to the app');
        await browser.back();
        await browser.activateApp(ui.BUNDLE);
        continue;
      }
      throw new InfraError('SESSION', `after relaunch the front package is ${front || '?'}, not the app (guard: no interaction)`);
    }
    if ((await browser.getCurrentPackage()) !== ui.BUNDLE) throw new InfraError('SESSION', 'app did not come to the front after relaunch');
  }
  const seen = await settleHomeAfterLogin(secrets, settleMs, 90_000);
  console.log(`FRESH LAUNCH: Home verified; popups: ${seen.join(', ') || 'none'}`);
  return seen;
}

/** Challenge on the hosted login page ⇒ stop (a human must step in). The static "Log in with a one-time code" link is not one. */
const CHALLENGE = /captcha|not a robot|verify (that )?you('| a)re (a )?human|enter (the|your) (\d+-digit )?(verification |security |one-time )?code|we('ve| have)? (just )?sent (you )?(a|an) (code|email|link)|check your (email|inbox)|two-step|2-step|two-factor|verification code|security check/i;
const LOGIN_ERROR = /incorrect|invalid (email|password)|doesn'?t match|wrong password|account (is )?locked|too many attempts/i;
/** Chrome first-run / save-password prompts inside the Custom Tab: negative choices only. */
const CHROME_SAFE = ['Use without an account', 'No thanks', 'No, thanks', 'Not now', 'Never'];

/** Visible texts of the current screen with anything that looks like an email or matches a secret masked. */
async function screenTexts(secrets: SecretString[]): Promise<string[]> {
  const src = await browser.getPageSource().catch(() => '');
  const out = new Set<string>();
  for (const m of src.matchAll(/\b(?:text|content-desc)="([^"]{1,80})"/g)) {
    const t = m[1]!.trim();
    if (!t) continue;
    out.add(/@/.test(t) || secrets.some((x) => x.occursIn(t)) ? '[masked]' : t);
  }
  return [...out].slice(0, 25);
}

async function pageText(): Promise<string> {
  return browser.getPageSource().catch(() => '');
}

async function onLoginPageAndroid(): Promise<boolean> {
  return (await browser.getCurrentPackage().catch(() => '')) !== ui.BUNDLE;
}

/**
 * After the login returns to the app: run the central popup handler until Home (Today) is verified AND no popup has
 * shown for SETTLE_MS of watching (condition waits, no fixed sleep). Every popup seen is logged (name, visible texts).
 */
export async function settleHomeAfterLogin(secrets: SecretString[], settleMs = Number(process.env['LOGIN_SETTLE_MS'] ?? 6000), totalMs = 120_000): Promise<string[]> {
  const seen: string[] = [];
  const deadline = Date.now() + totalMs;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    if (!browser.isIOS && (await onLoginPageAndroid())) {
      const pkg = await browser.getCurrentPackage().catch(() => '?');
      throw new InfraError('SESSION', `after login the front package is ${pkg}, not the app (guard: no interaction)`);
    }
    const before = await screenTexts(secrets);
    const n = await dismissOne();
    if (n) {
      console.log(`LOGIN POPUP ${seen.length + 1}: ${n} — tapped its safe choice; screen texts: ${JSON.stringify(before)}`);
      seen.push(n);
      quietSince = Date.now();
      continue;
    }
    const home = browser.isIOS ? await ui.shown(iosWeekly.todayTab, 500) : (await ui.shown(androidAccount.menuButton, 500)) && (await ui.shown(androidAccount.todayTab, 300));
    if (!home) {
      // Not home and no known popup: maybe a pushed screen (Settings/Menu) — back out; record unknown blockers.
      if (!browser.isIOS && ((await ui.shown(androidAccount.settingsScreen, 300)) || (await ui.shown(androidAccount.menuScreen, 300)))) await ui.backToHomeAndroid();
      else if (Date.now() - quietSince > settleMs) {
        console.log(`LOGIN UNKNOWN SCREEN: ${JSON.stringify(before)}`);
        await dumpBlocker(browser, 'login-settle');
        quietSince = Date.now();
      }
      continue;
    }
    if (Date.now() - quietSince >= settleMs) {
      console.log(`LOGIN SETTLED: Home verified, no popup for ${settleMs} ms; popups after login: ${seen.length ? seen.join(', ') : 'none'}`);
      return seen;
    }
  }
  throw new InfraError('SESSION', `Home not stable within ${totalMs} ms after login (popups: ${seen.join(', ') || 'none'})`);
}

async function failIfChallenge(where: string): Promise<void> {
  const src = await pageText();
  const plain = src.replace(/Log in with a one-time code/gi, '');
  if (CHALLENGE.test(plain)) {
    await ui.evidence('LOGIN', `challenge-${where}`).catch(() => undefined);
    throw new InfraError('LOGIN_CHALLENGE', `login page shows a captcha / 2FA / emailed-code step (${where}); stopped — needs Rahul`);
  }
  if (LOGIN_ERROR.test(src)) throw new InfraError('LOGIN_FORM_CHANGED', `login page reports an error after submit (${where}); credentials rejected or form changed — stopped, no retry`);
}

async function chromeSafeDismiss(): Promise<string | null> {
  for (const t of CHROME_SAFE) {
    const el = $(`android=new UiSelector().text("${t}").clickable(true)`);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return t;
    }
  }
  return null;
}

async function loginAndroid(email: SecretString, password: SecretString): Promise<void> {
  await ui.tap(androidAccount.loginButton);
  // Expected, allowed context for this flow only: the app's own Custom Tab (Chrome) on myaccount.economist.com.
  await browser.waitUntil(
    async () => {
      if (await ui.shown(androidLoginPage.heading, 300)) return true;
      const d = await chromeSafeDismiss();
      if (d) console.log(`LOGIN CHROME PROMPT: tapped "${d}"`);
      return false;
    },
    { timeout: 60_000, interval: 700, timeoutMsg: 'hosted login page ("Log into your account") did not appear' },
  );
  const pkg = await browser.getCurrentPackage();
  console.log(`LOGIN PAGE: front package ${pkg}`);
  await failIfChallenge('before-submit');
  const emailEl = $(androidLoginPage.email);
  const passEl = $(androidLoginPage.password);
  if (!(await emailEl.isDisplayed().catch(() => false)) || !(await passEl.isDisplayed().catch(() => false))) {
    throw new InfraError('LOGIN_FORM_CHANGED', 'email/password fields not found on the hosted login page');
  }
  await emailEl.click();
  await typeSecret(emailEl, email, wdioLogSilencer);
  await passEl.click();
  await typeSecret(passEl, password, wdioLogSilencer);
  await browser.hideKeyboard().catch(() => undefined);
  const submit = $(androidLoginPage.submit);
  await submit.waitForDisplayed({ timeout: 10_000 });
  await submit.click();
  console.log('LOGIN SUBMITTED (values not logged)');
  // Wait for the app to take focus back; watch for challenges / errors / Chrome save-password prompts meanwhile.
  await browser.waitUntil(
    async () => {
      if ((await browser.getCurrentPackage().catch(() => '')) === ui.BUNDLE) return true;
      await failIfChallenge('after-submit');
      const d = await chromeSafeDismiss();
      if (d) console.log(`LOGIN CHROME PROMPT: tapped "${d}"`);
      return false;
    },
    { timeout: 90_000, interval: 1000, timeoutMsg: 'app did not take focus back after login submit' },
  );
  console.log(`LOGIN RETURNED: front package ${ui.BUNDLE}`);
}

/** iOS path (written, NOT run — app not installed on the iPhone): Settings ▸ Log in ▸ ASWebAuthenticationSession sheet. */
async function loginIOS(email: SecretString, password: SecretString): Promise<void> {
  const allow = ['com.apple.springboard', 'com.apple.SafariViewService'];
  await guardedClick($(iosAccount.logInOutButton), 'login:log-in-button');
  const cont = $('-ios predicate string:type == "XCUIElementTypeButton" AND label == "Continue"');
  if (await cont.waitForDisplayed({ timeout: 10_000 }).then(() => true).catch(() => false)) await guardedClick(cont, 'login:auth-session-continue', browser, allow);
  await $('-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS "Log into your account"').waitForDisplayed({ timeout: 60_000 });
  await failIfChallenge('before-submit');
  const emailEl = $('-ios class chain:**/XCUIElementTypeTextField');
  const passEl = $('-ios class chain:**/XCUIElementTypeSecureTextField');
  await guardedClick(emailEl, 'login:email', browser, allow);
  await typeSecret(emailEl, email, wdioLogSilencer);
  await guardedClick(passEl, 'login:password', browser, allow);
  await typeSecret(passEl, password, wdioLogSilencer);
  await guardedClick($('-ios predicate string:type == "XCUIElementTypeButton" AND label == "Log in"'), 'login:submit', browser, allow);
  await browser.waitUntil(async () => (await ui.shown(iosAccount.settingsScreen, 500)) || (await ui.shown(iosWeekly.todayTab, 500)), { timeout: 90_000, timeoutMsg: 'app did not come back after login' });
  await failIfChallenge('after-submit');
}

async function settingsLoginState(): Promise<{ loggedIn: boolean | null; email?: string }> {
  if (!browser.isIOS) {
    await ui.openSettingsAndroid();
    return ui.androidSettingsLoginState();
  }
  await ui.whoAmI(); // read-only probe navigates and backs out; re-open Settings for the tap
  await ui.tap(iosWeekly.todayTab);
  if (!(await ui.shown(iosAccount.settingsButton, 3000))) await ui.tap(iosAccount.menuButton);
  await ui.tap(iosAccount.settingsButton);
  const l = (await $(iosAccount.logInOutButton).getAttribute('label').catch(() => '')) ?? '';
  return { loggedIn: /log ?out|sign ?out/i.test(l) ? true : /log ?in|sign ?in/i.test(l) ? false : null };
}

export type LoginResult = { result: 'already' | 'logged-in' | 'relogged-in'; entitled: boolean; popupsAfterLogin: string[]; screenshot: string };

/**
 * Idempotent login: Home (popups cleared) ▸ Menu ▸ Settings ▸ Log in ▸ hosted page ▸ back to app ▸ settle popups ▸ whoAmI.
 * Already logged in as this account ⇒ 'already'. Logged in as someone else (or unknown) ⇒ INFRA WRONG_ACCOUNT, never logs out.
 */
export async function loginViaSettings(accountKey = 'user1'): Promise<LoginResult> {
  const found = accountByKey(accountKey);
  if (!found) throw new InfraError('NO_ACCOUNT', `no account with key ${accountKey} in config/accounts.ts`);
  const broker = new SecretsBroker();
  const email = await broker.read(found.account.ref);
  const password = await broker.read(found.account.passwordRef);
  const secrets = [email, password];

  // t792u/15:37: always start from a fresh app process (whatever screen it was on, incl. an old login Custom Tab).
  await freshLaunchToHome(secrets);
  const st = await settingsLoginState();
  console.log(`LOGIN START: settings says loggedIn=${String(st.loggedIn)}`);
  let result: LoginResult['result'];
  const relogin = process.env['LOGIN_RELOGIN'] === '1';
  if (st.loggedIn === true && relogin) {
    // t798u/t799u (Rahul): login script only — already logged in ⇒ log out through the app's own Settings, then log in.
    console.log('LOGIN BRANCH: logout-then-login (LOGIN_RELOGIN=1)');
    await logoutViaSettingsForRelogin(secrets);
    if (browser.isIOS) await loginIOS(email, password);
    else await loginAndroid(email, password);
    return finishLogin(accountKey, email, secrets, 'relogged-in');
  }
  if (st.loggedIn === true) {
    console.log('LOGIN BRANCH: already-logged-in (relogin off)');
    // Settings shows no email on Android 4.108 ("Log out" only): the account can be told apart only when an email is shown.
    if (st.email && !email.occursIn(st.email)) throw new InfraError('WRONG_ACCOUNT', `logged in as a different account than ${accountKey}; stopped — never logs out or switches`);
    console.log(`LOGIN: already logged in (Settings shows Log out${st.email ? `, account matches ${accountKey}` : '; no email shown, account not distinguishable'}) — nothing to do`);
    result = 'already';
    if (!browser.isIOS) await ui.backToHomeAndroid();
    return finishLogin(accountKey, email, secrets, result);
  } else if (st.loggedIn === false) {
    console.log('LOGIN BRANCH: login (Settings shows Log in)');
    if (browser.isIOS) await loginIOS(email, password);
    else await loginAndroid(email, password);
    result = 'logged-in';
  } else {
    throw new InfraError('SESSION', 'Settings header shows neither Log in nor Log out; login state unknown — stopped');
  }
  return finishLogin(accountKey, email, secrets, result);
}

/**
 * LOGIN SCRIPT ONLY (t798u/t799u, gated by LOGIN_RELOGIN=1; specs never call this — they keep the never-logout rule).
 * Settings ▸ top-right "Log out" ▸ the app's own confirmation (if any) ▸ Settings shows "Log in".
 */
async function logoutViaSettingsForRelogin(secrets: SecretString[]): Promise<void> {
  if (process.env['LOGIN_RELOGIN'] !== '1') throw new InfraError('CONFIG', 'logout outside the relogin-gated login script is not allowed');
  if (browser.isIOS) {
    await guardedClick($(iosAccount.logInOutButton), 'relogin:log-out');
    const c = $('-ios predicate string:type == "XCUIElementTypeButton" AND (label == "Log out" OR label == "Log Out" OR label == "Yes")');
    if (await c.waitForDisplayed({ timeout: 5000 }).then(() => true).catch(() => false)) await guardedClick(c, 'relogin:confirm');
    await browser.waitUntil(async () => /log ?in/i.test((await $(iosAccount.logInOutButton).getAttribute('label').catch(() => '')) ?? ''), { timeout: 20_000, timeoutMsg: 'Settings did not show Log in after logout' });
    return;
  }
  await ui.openSettingsAndroid();
  const header = $('android=new UiSelector().textMatches("(?i)^(log|sign) ?out$")');
  const hy = (await header.getLocation()).y;
  await header.click();
  console.log('LOGOUT: tapped Settings top-right "Log out"');
  const done = await browser
    .waitUntil(
      async () => {
        if (await ui.shown(androidAccount.loginButton, 300)) return true;
        if ((await browser.getCurrentPackage().catch(() => '')) !== ui.BUNDLE) throw new InfraError('SESSION', 'another app came to the front during logout (guard: no interaction)');
        // The app's own confirmation: a second "Log out"/"Yes"/"OK"/"Confirm" button below the header.
        const btns = await $$('android=new UiSelector().textMatches("(?i)^(log ?out|sign ?out|yes|ok|confirm)$")');
        for (const b of btns) {
          const y = (await b.getLocation().catch(() => ({ y: -1 }))).y;
          if (y > hy + 40 && (await b.isDisplayed().catch(() => false))) {
            const before = await screenTexts(secrets);
            const t = await b.getText().catch(() => '?');
            await b.click();
            console.log(`LOGOUT POPUP: app confirmation, tapped "${t}"; screen texts: ${JSON.stringify(before)}`);
            return false;
          }
        }
        return false;
      },
      { timeout: 30_000, interval: 700 },
    )
    .catch(async (e: Error) => {
      if (e.message.startsWith('INFRA')) throw e;
      return false;
    });
  if (!done) {
    const shot = await loginEvidence('FAIL-logout', secrets);
    throw new InfraError('SESSION', `Settings did not show "Log in" after logout; screenshot ${shot}`);
  }
  const shot = await loginEvidence('after-logout-settings-log-in', secrets);
  console.log(`LOGOUT: Settings shows "Log in" (screenshot ${shot})`);
}

/** Screenshot + page source (emails / secrets masked) under EVIDENCE_DIR/LOGIN/<name>.*; returns the png path. */
async function loginEvidence(name: string, secrets: SecretString[]): Promise<string> {
  const dir = join(ui.EVIDENCE_DIR, 'LOGIN');
  mkdirSync(dir, { recursive: true });
  const png = join(dir, `${name}.png`);
  await browser.saveScreenshot(png);
  const src = (await browser.getPageSource().catch(() => '')).replace(/(text|content-desc|label|value|name)="([^"]*)"/g, (m, k: string, v: string) => (/@/.test(v) || secrets.some((x) => x.occursIn(v)) ? `${k}="[masked]"` : m));
  writeFileSync(join(dir, `${name}.xml`), src);
  return png;
}

/**
 * Success criterion (Rahul 15:40): Home stable ▸ Menu ▸ Settings ▸ the top-right link reads "Log out" and "Log in" is
 * absent, within a bounded wait. Read only — "Log out" is NEVER tapped. Screenshot of the final state either way.
 */
export async function assertLoggedInViaSettings(secrets: SecretString[], ms = 20_000): Promise<string> {
  if (browser.isIOS) {
    const who = await ui.whoAmI();
    if (who.loggedIn !== true) throw new InfraError('SESSION', `iOS Settings does not show Log out (${who.source})`);
    return '';
  }
  await ui.openSettingsAndroid();
  let st: Awaited<ReturnType<typeof ui.androidSettingsLoginState>> = { loggedIn: null, label: '' };
  const ok = await browser
    .waitUntil(async () => (st = await ui.androidSettingsLoginState()).loggedIn === true && !(await ui.shown(androidAccount.loginButton, 200)), { timeout: ms, interval: 1000 })
    .catch(() => false);
  const shot = await loginEvidence(ok ? 'final-settings-log-out' : 'FAIL-settings-not-logged-in', secrets);
  console.log(`LOGIN CHECK Settings top-right "${st.label || '?'}" (Log in absent: ${String(ok)}) screenshot=${shot}`);
  if (!ok) throw new InfraError('SESSION', `Settings does not show "Log out" (shows "${st.label || 'neither'}") within ${ms} ms — not logged in; screenshot ${shot}`);
  await ui.backToHomeAndroid();
  return shot;
}

async function finishLogin(accountKey: string, email: SecretString, secrets: SecretString[], result: LoginResult['result']): Promise<LoginResult> {
  const popups = result === 'already' ? [] : await settleHomeAfterLogin(secrets);
  const shot = await assertLoggedInViaSettings(secrets);
  const who = await ui.whoAmI();
  console.log(`LOGIN whoAmI loggedIn=${String(who.loggedIn)} email=${who.email ? (email.occursIn(who.email) ? 'matches ' + accountKey : 'DIFFERENT') : 'n/a'} (${who.source})`);
  assert.equal(who.loggedIn, true, 'whoAmI does not report logged in after login');
  if (who.email) assert.ok(email.occursIn(who.email), `signed-in account is not ${accountKey}`);
  // Entitlement (as the subscriber specs check it, no account items tapped): the Weekly download control opens the
  // download menu (not the paywall); the menu is closed again without choosing anything.
  await ui.openWeekly();
  const m = await ui.openDownloadMenu();
  if (m === 'menu') await ui.dismissMenu();
  else if (m === 'paywall') await ui.closePaywall();
  console.log(`LOGIN entitlement: Weekly download control opens ${m}`);
  return { result, entitled: m === 'menu', popupsAfterLogin: popups, screenshot: shot };
}
