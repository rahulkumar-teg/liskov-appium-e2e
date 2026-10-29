/// <reference types="@wdio/globals/types" />
// Central interstitial / popup handler (Android + iOS; the table is picked by platform). One table row per popup: adding a popup is a one-line change.
// Safety: we only ever tap a DISMISS / NEGATIVE control. Every `tap` is checked against SAFE_TAP at load time and
// against UNSAFE before each click; anything that could log out, buy, sign up, subscribe, enable, allow or change a
// setting/flag is refused. Every dismissal is logged as `popup dismissed: <name>`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { guardedClick } from './iosGuard.js';

const ui = (s: string) => `android=new UiSelector().${s}`;
const txt = (t: string) => ui(`text(${JSON.stringify(t)})`);
const has = (t: string) => ui(`textContains(${JSON.stringify(t)})`);
const rid = (r: string) => ui(`resourceId(${JSON.stringify(r)})`);
const desc = (d: string) => ui(`description(${JSON.stringify(d)})`);

// iOS: system alerts and app sheets. Buttons are matched by exact label; the curly apostrophe is iOS's own spelling.
const iosBtn = (l: string) => `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(l)}`;
const iosAlert = (contains: string) => `-ios predicate string:type == "XCUIElementTypeAlert" AND label CONTAINS[c] ${JSON.stringify(contains)}`;
const iosText = (contains: string) => `-ios predicate string:label CONTAINS[c] ${JSON.stringify(contains)}`;
const DONT_ALLOW = ['Don\u2019t Allow', "Don't Allow"];
const IOS_NEWSLETTERS = '-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "Newsletters"';

export interface Popup {
  name: string;
  marker: string; // shown ⇒ this popup is up
  tap: string[]; // first displayed one is tapped (all must be dismiss/negative controls)
}

// prettier-ignore
export const POPUPS: Popup[] = [
  // Post-login "Newsletters" page (Rahul 15:42): detected by the exact heading; the ONLY tap is the pinned bottom "Continue"
  // (only present together with the heading). Never the "Signed up" / ⊖ remove buttons, toggles or the "Jump to" dropdown.
  { name: 'newsletters-onboarding', marker: txt('Newsletters'), tap: [ui('resourceId("liskov-text").text("Continue")'), ui('className("android.widget.Button").text("Continue")'), txt('Continue'), desc('Continue')] },
  { name: 'auto-download-prompt', marker: txt('Automatically download new editions?'), tap: [rid('cancel-btn'), txt('Not now')] },
  { name: 'notification-permission', marker: rid('com.android.permissioncontroller:id/permission_message'), tap: [rid('com.android.permissioncontroller:id/permission_deny_button'), txt("Don't allow"), txt('Not now')] },
  { name: 'app-not-responding', marker: has("isn't responding"), tap: [rid('android:id/aerr_wait'), txt('Wait')] },
  { name: 'in-app-review', marker: has('Enjoying'), tap: [txt('Not now'), txt('No thanks'), txt('Later'), txt('Maybe later')] },
  { name: 'play-review-sheet', marker: rid('com.android.vending:id/review_card'), tap: [txt('Not now')] },
  { name: 'rate-the-app', marker: has('Rate '), tap: [txt('Not now'), txt('No thanks'), txt('Later'), txt('Maybe later')] },
  { name: 'whats-new', marker: has("What's new"), tap: [txt('Close'), desc('Close'), txt('Got it'), txt('Not now')] },
  { name: 'tooltip-coachmark', marker: txt('Got it'), tap: [txt('Got it')] },
  { name: 'cookie-consent', marker: has('cookies'), tap: [txt('Reject all'), txt('Reject All'), txt('Necessary only'), txt('Only necessary')] },
  { name: 'upsell-paywall', marker: rid('paywall-screen'), tap: [rid('paywall-close-button'), desc('Close')] },
  { name: 'notifications-onboarding', marker: txt('Never miss a story'), tap: [txt('Maybe later')] }, // never "Turn on notifications"
  { name: 'navigation-coachmark', marker: has('Read the latest weekly edition'), tap: [desc('Close')] },
  { name: 'onboarding-paywall', marker: txt('Subscribe now'), tap: [desc('Go back')] }, // fresh-install / logged-out launch paywall: the top-left X ("Go back"); never "Log in" / "Subscribe now"
  { name: 'upsell-sheet', marker: has('Subscribe'), tap: [rid('paywall-close-button'), desc('Close'), txt('No thanks')] }, // never 'Close sheet': the download sheet has it too
];

// prettier-ignore
export const IOS_POPUPS: Popup[] = [
  { name: 'ios-notification-permission', marker: iosAlert('Send You Notifications'), tap: DONT_ALLOW.map(iosBtn) },
  { name: 'ios-tracking-permission', marker: iosAlert('track your activity'), tap: [iosBtn('Ask App Not to Track')] },
  { name: 'ios-local-network', marker: iosAlert('local network'), tap: DONT_ALLOW.map(iosBtn) },
  { name: 'ios-auto-download-prompt', marker: iosText('Automatically download new editions'), tap: [iosBtn('Not now'), iosBtn('Not Now')] },
  { name: 'ios-in-app-review', marker: iosText('Enjoying'), tap: [iosBtn('Not Now'), iosBtn('Not now')] },
  { name: 'ios-whats-new', marker: iosText("What\u2019s new"), tap: [iosBtn('Close'), iosBtn('Got it'), iosBtn('Not now')] },
  { name: 'ios-paywall', marker: '~paywall-screen', tap: ['~paywall-close-button'] },
  { name: 'ios-newsletters-onboarding', marker: IOS_NEWSLETTERS, tap: [iosBtn('Continue')] }, // heading + Continue only; never Signed up / remove
];
// iOS fast path: one query; only when something alert/sheet-like is up do we walk the table (keeps taps cheap).
const IOS_ANY = `-ios predicate string:type == "XCUIElementTypeAlert" OR name == "paywall-screen" OR label CONTAINS[c] "Automatically download new editions" OR label CONTAINS[c] "Enjoying" OR label CONTAINS[c] "What\u2019s new" OR (type == "XCUIElementTypeStaticText" AND label == "Newsletters")`;

const SAFE_TAP =
  /^(Continue|Go back|Not now|Not Now|No thanks|Later|Maybe later|Don't allow|Don't Allow|Don\u2019t Allow|Ask App Not to Track|Wait|Close|Close sheet|Got it|Reject all|Reject All|Necessary only|Only necessary)$|^(cancel-btn|paywall-close-button|~paywall-close-button|android:id\/aerr_wait|com\.android\.permissioncontroller:id\/permission_deny_button)$/;
const UNSAFE = /log ?(in|out)|sign ?(in|out|up)|signed up|jump to|choose section|subscri|buy|purchase|trial|turn on|enable|allow$|^allow|accept|settings|flag|debug|passcode|unsubscribe|delete|remove|upgrade/i;
/** Exported for unit tests only (the matcher contract). */
export const __test = { SAFE_TAP: () => SAFE_TAP, UNSAFE: () => UNSAFE };
const target = (sel: string) => /\("([^"]*)"\)$/.exec(sel)?.[1] ?? /label == "([^"]*)"$/.exec(sel)?.[1] ?? sel;
for (const p of [...POPUPS, ...IOS_POPUPS]) for (const t of p.tap) if (!SAFE_TAP.test(target(t))) throw new Error(`popups.ts: unsafe tap "${t}" in ${p.name}`);

const visible = (b: WebdriverIO.Browser, sel: string) =>
  b
    .$(sel)
    .isDisplayed()
    .catch(() => false);

/** Single pass, no waiting: dismisses at most one popup; returns its name or null. */
export async function dismissOne(b: WebdriverIO.Browser = browser): Promise<string | null> {
  if (b.isIOS && !(await visible(b, IOS_ANY))) return null;
  for (const p of b.isIOS ? IOS_POPUPS : POPUPS) {
    if (!(await visible(b, p.marker))) continue;
    for (const t of p.tap) {
      if (!(await visible(b, t))) continue;
      const el = b.$(t);
      const label = (b.isIOS ? ((await el.getAttribute('label').catch(() => '')) ?? '') : `${(await el.getText().catch(() => '')) ?? ''} ${(await el.getAttribute('content-desc').catch(() => '')) ?? ''}`).trim();
      if (label && UNSAFE.test(label) && !/^(Don['\u2019]t allow|Close sheet)$/i.test(label)) {
        console.log(`popup ${p.name}: refused to tap "${label}"`);
        continue;
      }
      await guardedClick(el, `popup ${p.name}`, b, ['com.apple.springboard']);
      await b
        .waitUntil(async () => !(await visible(b, p.marker)), {
          timeout: 15_000,
          interval: 300,
        })
        .catch(() => undefined);
      console.log(`popup dismissed: ${p.name}`);
      return p.name;
    }
  }
  return null;
}

/** Dismisses everything known that is up now (or appears within appearMs). Returns names handled. */
export async function dismissPopups(b: WebdriverIO.Browser = browser, appearMs = 0, max = 4): Promise<string[]> {
  const out: string[] = [];
  const deadline = Date.now() + appearMs;
  for (let i = 0; i < max; i++) {
    let n = await dismissOne(b);
    if (!n && Date.now() < deadline) {
      await b
        .waitUntil(async () => (n = await dismissOne(b)) !== null, {
          timeout: Math.max(1, deadline - Date.now()),
          interval: 500,
        })
        .catch(() => undefined);
    }
    if (!n) break;
    out.push(n);
  }
  return out;
}

/** Unknown blocker evidence: dumps screen + source when something non-app or dialog-like is on top. */
export async function dumpBlocker(b: WebdriverIO.Browser, where: string): Promise<void> {
  // iOS has no getCurrentPackage: ask WDA for the foreground bundle (mobile: activeAppInfo) and look for alerts/sheets.
  const pkg = b.isIOS
    ? await b
        .execute('mobile: activeAppInfo')
        .then((r) => String((r as { bundleId?: string }).bundleId ?? '?'))
        .catch(() => '?')
    : await b.getCurrentPackage().catch(() => '?');
  const src = await b.getPageSource().catch(() => '');
  const dialogish = pkg !== 'com.economist.lamarr' || (b.isIOS ? /XCUIElementTypeAlert|XCUIElementTypeSheet/.test(src) : /android:id\/(alertTitle|message)|Close sheet|dialog/i.test(src));
  if (!dialogish) return;
  const dir = join(process.env['EVIDENCE_DIR'] ?? 'reports/evidence', 'popups');
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `UNKNOWN-${Date.now()}-${where.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}`);
  await b.saveScreenshot(`${base}.png`).catch(() => undefined);
  writeFileSync(`${base}.xml`, src);
  console.log(`popup UNKNOWN blocker (pkg ${pkg}) at ${where}: ${base}.{png,xml}`);
}

/** Runs a wait; on timeout dismisses popups and retries ONCE; if nothing was dismissed, dumps the blocker and rethrows. */
export async function withPopupRetry<T>(where: string, fn: () => Promise<T>): Promise<T> {
  await dismissPopups();
  try {
    return await fn();
  } catch (e) {
    const handled = await dismissPopups(browser, 2000);
    if (handled.length === 0) {
      await dumpBlocker(browser, where);
      throw e;
    }
    console.log(`popup retry: ${where} after ${handled.join(',')}`);
    return fn();
  }
}
