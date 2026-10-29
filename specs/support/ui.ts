/// <reference types="@wdio/globals/types" />
// Platform UI layer for ePaper specs (plan §4.7 screen objects, condensed). Condition waits only (I7), no pause().
// Never taps Log in/out (only specs/support/flows.ts loginViaSettings, used by scripts/login.ts, may), Debug, flags, purchase/subscribe. Deletes only through cleanupOwn() (what the spec created).
import { iosDownload } from '../../src/locators/ios/download.js';
import { iosAccount, iosPaywall, iosViewer, iosViewerThumbPrefix, iosWeekly } from '../../src/locators/ios/viewer.js';
import { androidDownload } from '../../src/locators/android/download.js';
import { androidPaywall, androidViewer } from '../../src/locators/android/viewer.js';
import { androidAccount } from '../../src/locators/android/account.js';
import { iosManageState, parseAndroidRowOrPartial, parseIOSLabel, type HeaderState } from '../../src/model/HeaderState.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dismissOne, dismissPopups, withPopupRetry } from './popups.js';
import { edgeSwipeBack, guardedClick, guardedGesture, guardedTapAt } from './iosGuard.js';
import { join } from 'node:path';

export const UI_MS = Number(process.env['UI_TIMEOUT_MS'] ?? 20_000);
export const DOWNLOAD_TIMEOUT_MS = Number(process.env['DOWNLOAD_TIMEOUT_MS'] ?? 180_000);
export const EVIDENCE_DIR = process.env['EVIDENCE_DIR'] ?? 'reports/evidence';
const isIOS = () => browser.isIOS;

export async function shown(sel: string, ms = 0): Promise<boolean> {
  const el = $(sel);
  if (ms === 0) return el.isDisplayed().catch(() => false);
  const ok = () =>
    el.waitForDisplayed({ timeout: ms }).then(
      () => true,
      () => false,
    );
  if (await ok()) return true;
  if ((await dismissPopups()).length === 0) return false;
  return ok(); // a popup was covering it: retry once
}
/** Weekly header control on screen? iOS reveals it first (it can sit below the fold, visible=false), then checks. */
export async function present(sel: string, ms = 0): Promise<boolean> {
  await revealIOS(sel);
  return shown(sel, ms);
}
/** iOS: Weekly is a scroll view; a control can exist in the tree but sit below the fold (visible=false). Reveal it
 *  with plain upward drags (WDA `mobile: scroll` gives "max scroll count reached" here), checking after each, max 8. */
const REVEAL_SWIPES = 8;
async function revealIOS(sel: string): Promise<void> {
  if (!isIOS()) return;
  const el = $(sel);
  if ((await el.isDisplayed().catch(() => false)) || !(await el.isExisting().catch(() => false))) return;
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width / 2);
  for (let i = 0; i < REVEAL_SWIPES; i++) {
    await guardedGesture(`reveal ${sel}`, () =>
      browser
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x, y: Math.round(height * 0.7) })
        .down()
        .move({ x, y: Math.round(height * 0.35), duration: 500 })
        .up()
        .perform(),
    );
    if (await el.isDisplayed().catch(() => false)) return;
  }
}
/** The one tap for specs/support (iOS: front-app check before AND after, banner wait for the top band — iosGuard.ts). */
export async function tap(sel: string, ms = UI_MS): Promise<void> {
  const el = $(sel);
  await revealIOS(sel);
  await withPopupRetry(`tap ${sel}`, () => el.waitForDisplayed({ timeout: ms }));
  await guardedClick(el, `tap ${sel}`);
  await dismissPopups(); // after every navigation (both platforms; iOS uses a one-query fast path)
}
async function label(sel: string): Promise<string> {
  const el = $(sel);
  if (!(await el.isExisting().catch(() => false))) return '';
  return isIOS() ? ((await el.getAttribute('label')) ?? '') : (await el.getAttribute('content-desc')) || (await el.getText()) || '';
}

/** Evidence: screenshot + page source under EVIDENCE_DIR/<case>/<name>.* (never asserted on, D13). */
export async function evidence(caseId: string, name: string): Promise<string> {
  const dir = join(EVIDENCE_DIR, caseId);
  mkdirSync(dir, { recursive: true });
  await browser.saveScreenshot(join(dir, `${name}.png`));
  writeFileSync(join(dir, `${name}.xml`), await browser.getPageSource());
  return join(dir, name);
}

// ---------- navigation ----------
/** iOS back-out: left-edge swipe at mid-screen (out of the notification-banner band), max 3, until done() holds.
 *  Logs and stops if a swipe does not change the screen (never falls back to the top-left button). */
async function backOutIOS(where: string, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 3 && !(await done()); i++) {
    if (!(await shown(iosAccount.backButton))) break;
    const before = await label(iosAccount.backButton);
    const moved = () => browser.waitUntil(async () => !(await shown(iosAccount.backButton)) || (await label(iosAccount.backButton)) !== before, { timeout: 3000, interval: 300 }).then(() => true, () => false);
    await edgeSwipeBack(`${where} back ${i + 1}`);
    if (await moved()) continue;
    // Swipe-back not honoured on this screen: the app's back button, ONLY via the guarded tap (banner wait for the
    // top band + front-app check before and after) — approved fallback (10:19).
    console.log(`${where}: edge swipe back did not change the screen (back label "${before}"); using guarded back button`);
    await tap(iosAccount.backButton, 3000);
    await moved();
  }
}
export async function openWeekly(): Promise<void> {
  if (isIOS()) {
    // A pushed screen (e.g. Settings) hides the tab bar: back out with left-edge swipes (max 3), never the top-left button.
    await backOutIOS('openWeekly', () => shown(iosWeekly.tab, 1500));
    await tap(iosWeekly.tab);
    await browser.waitUntil(async () => (await headerState()) !== 'UNKNOWN', {
      timeout: UI_MS,
      timeoutMsg: 'Weekly download header not visible',
    });
  } else {
    await normaliseAndroid();
    await tap('android=new UiSelector().resourceId("liskov-text").text("Weekly")');
    await $('id=weekly-edition-lazy-column').waitForDisplayed({
      timeout: UI_MS,
    });
    // Weekly restores its last scroll position (e.g. after background/relaunch): if the row is not on screen, scroll the lazy column back to the top first.
    if (!(await shown(androidDownload.manualDownloadRow))) {
      const col = await $('id=weekly-edition-lazy-column');
      for (let i = 0; i < 10; i++) {
        const more = await browser.execute('mobile: scrollGesture', { elementId: await col.elementId, direction: 'up', percent: 1.0 }).catch(() => false);
        if (!more || (await shown(androidDownload.manualDownloadRow))) break;
      }
    }
    // The download rows sit under the cover: swipe the lazy column up (small steps) until the row is on screen.
    for (let i = 0; i < 4 && !(await shown(androidDownload.manualDownloadRow)); i++) await swipeUp(0.45);
    await $(androidDownload.manualDownloadRow).waitForDisplayed({
      timeout: UI_MS,
    });
  }
}

async function swipeUp(frac: number): Promise<void> {
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width / 2);
  const y1 = Math.round(height * 0.7);
  const y2 = Math.round(height * (0.7 - frac));
  await guardedGesture('swipeUp', () =>
    browser
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x, y: y1 })
      .down()
      .move({ x, y: y2, duration: 500 })
      .up()
      .perform(),
  );
  // settle: wait until two consecutive page sources match (condition wait, no pause)
  let prev = '';
  await browser
    .waitUntil(
      async () => {
        const x2 = await browser.getPageSource();
        const same = x2 === prev;
        prev = x2;
        return same;
      },
      { timeout: 5000, interval: 400 },
    )
    .catch(() => undefined);
}

/** Known-safe start state: close a left-open download sheet, paywall or PDF viewer (back / close only; never a choice). */
export async function normaliseAndroid(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (await dismissOne()) continue;
    if (await shown(androidDownload.optionsSheet)) {
      await browser.back();
      await $(androidDownload.optionsSheet).waitForDisplayed({
        timeout: UI_MS,
        reverse: true,
      });
    } else if (await shown(androidPaywall.close)) {
      await guardedClick($(androidPaywall.close), 'android paywall close');
      await $(androidPaywall.screen).waitForDisplayed({
        timeout: UI_MS,
        reverse: true,
      });
    } else if (await shown(androidViewer.back)) {
      await guardedClick($(androidViewer.back), 'android viewer back');
      await $(androidViewer.back).waitForDisplayed({
        timeout: UI_MS,
        reverse: true,
      });
    } else return;
  }
}

// ---------- header state ----------
const IOS_ORDER: [string, HeaderState | 'LABEL'][] = [
  [iosDownload.deleteAllButton, 'BOTH_DONE'],
  [iosDownload.editionFailedRetry, 'FAILED'],
  [iosDownload.pdfFailedRetry, 'FAILED'],
  [iosDownload.cancelEditionDownload, 'LABEL'],
  [iosDownload.pdfCancel, 'LABEL'],
  [iosDownload.manageButton, 'LABEL'],
  [iosDownload.downloadedLabel, 'LABEL'],
  [iosDownload.downloadEditionButton, 'NOTHING'],
];
export async function headerState(): Promise<HeaderState> {
  if (!isIOS()) {
    // Fast path first (transient DOWNLOADING_* states last only seconds on Wi-Fi); popups only when the row is unreadable.
    const st = parseAndroidRowOrPartial(await label(androidDownload.manualDownloadRow));
    if (st !== 'UNKNOWN') return st;
    if (await dismissOne()) return parseAndroidRowOrPartial(await label(androidDownload.manualDownloadRow));
    return st;
  }
  for (const [sel, st] of IOS_ORDER) {
    if (
      !(await $(sel)
        .isExisting()
        .catch(() => false))
    )
      continue;
    if (st !== 'LABEL') return st;
    if (sel === iosDownload.manageButton) {
      // Manage visible ⇒ something is downloaded. Name the format from the downloaded label if possible, else
      // PARTIAL_DONE (Manage-only, Rahul 10:24) — never fall through to NOTHING.
      const any = $(`-ios predicate string:label BEGINSWITH "Print edition downloaded" OR label BEGINSWITH "Articles & audio downloaded" OR label BEGINSWITH "Edition downloaded"`);
      const extra = (await any.isExisting().catch(() => false)) ? ((await any.getAttribute('label').catch(() => '')) ?? '') : '';
      return iosManageState([await label(iosDownload.downloadedLabel), extra]);
    }
    const parsed = parseIOSLabel(await label(sel)); // iOS: status text only; action is a separate button
    if (parsed !== 'UNKNOWN' && parsed !== 'NOTHING') return parsed;
    if (sel === iosDownload.cancelEditionDownload || sel === iosDownload.pdfCancel) {
      const l = await label(sel);
      if (/wi-?fi/i.test(l)) return 'WAITING_WIFI';
      return /print/i.test(l) ? 'DOWNLOADING_PRINT' : 'DOWNLOADING_AA';
    }
  }
  return 'UNKNOWN';
}
/** Fast poll (default 150 ms) for short-lived states such as DOWNLOADING_*; popup retry as in waitState. */
export async function waitStateFast(want: HeaderState | HeaderState[], ms: number, intervalMs = 150): Promise<HeaderState> {
  if (isIOS()) return waitStateOnce(want, ms, intervalMs);
  return withPopupRetry(`waitStateFast ${String(want)}`, () => waitStateOnce(want, ms, intervalMs));
}
export async function waitState(want: HeaderState | HeaderState[], ms = DOWNLOAD_TIMEOUT_MS): Promise<HeaderState> {
  if (isIOS()) return waitStateOnce(want, ms);
  return withPopupRetry(`waitState ${String(want)}`, () => waitStateOnce(want, ms));
}
async function waitStateOnce(want: HeaderState | HeaderState[], ms: number, intervalMs?: number): Promise<HeaderState> {
  const wants = Array.isArray(want) ? want : [want];
  let last: HeaderState = 'UNKNOWN';
  await browser.waitUntil(
    async () => {
      return wants.includes((last = await headerState()));
    },
    {
      timeout: ms,
      interval: intervalMs ?? (isIOS() ? 1000 : 250),
      timeoutMsg: `header never reached ${wants.join('|')} (last ${last})`,
    },
  );
  return last;
}

// ---------- download menu ----------
export type Kind = 'aa' | 'print';
export async function openDownloadMenu(): Promise<'menu' | 'paywall' | 'none'> {
  if (isIOS()) {
    await tap(iosDownload.downloadEditionButton);
    const r = await browser
      .waitUntil(async () => (await shown(iosDownload.optionPrint)) || (await shown(iosDownload.optionArticlesAudio)) || (await shown(iosPaywall.screen)), { timeout: UI_MS })
      .then(
        () => true,
        () => false,
      );
    if (!r) return 'none';
    return (await shown(iosPaywall.screen)) ? 'paywall' : 'menu';
  }
  await tap(androidDownload.manualDownloadRow);
  return (await shown(androidDownload.optionsSheet, UI_MS)) ? 'menu' : 'none';
}
export async function menuOptions(): Promise<{ aa: boolean; print: boolean }> {
  const L = isIOS() ? iosDownload : androidDownload;
  return {
    aa: await shown(L.optionArticlesAudio),
    print: await shown(L.optionPrint),
  };
}
export async function dismissMenu(): Promise<void> {
  if (isIOS()) {
    // SwiftUI Menu: tap outside (top-left of the window) dismisses without choosing.
    const { width } = await browser.getWindowSize();
    await guardedTapAt(Math.round(width / 2), 60, 'dismissMenu tap-outside');
    await $(iosDownload.optionPrint).waitForDisplayed({
      timeout: UI_MS,
      reverse: true,
    });
  } else {
    await browser.back();
    await $(androidDownload.optionsSheet).waitForDisplayed({
      timeout: UI_MS,
      reverse: true,
    });
  }
}
export async function choose(kind: Kind): Promise<void> {
  const L = isIOS() ? iosDownload : androidDownload;
  await tap(kind === 'print' ? L.optionPrint : L.optionArticlesAudio);
}
export async function closePaywall(): Promise<void> {
  const P = isIOS() ? iosPaywall : androidPaywall;
  if (await shown(P.screen))
    await guardedClick($(P.close), 'closePaywall').catch((e: Error) => {
      if (e.message.startsWith('INFRA')) throw e;
    });
}

// ---------- manage / delete ----------
export async function manageDownloadOther(kind: Kind): Promise<void> {
  if (isIOS()) {
    await tap(iosDownload.manageButton);
    await tap(kind === 'print' ? iosDownload.manageDownloadPdf : iosDownload.manageDownloadAA);
  } else {
    await tap(androidDownload.manualDownloadRow);
    await tap(kind === 'print' ? androidDownload.optionPrint : androidDownload.optionArticlesAudio);
  }
}
/** Manage ▸ Delete (single format) or Delete (both); then the alert choice. */
export async function deleteVia(path: 'manage' | 'all', confirm: boolean): Promise<void> {
  if (isIOS()) {
    if (path === 'manage') {
      await tap(iosDownload.manageButton);
      await tap(iosDownload.manageDelete);
    } else await tap(iosDownload.deleteAllButton);
    await tap(confirm ? iosDownload.alertDeleteButton : iosDownload.alertCancelButton);
  } else {
    await tap(androidDownload.manualDownloadRow);
    if (path === 'manage') await tap(androidDownload.optionDelete);
    if (path === 'manage' && confirm) {
      // Partial content: the confirm can be the edition, PDF or both dialog depending on what is downloaded.
      const candidates = [androidDownload.deleteAlertConfirm, androidDownload.deletePdfAlertBtn, androidDownload.deleteBothConfirm];
      let hit: string | undefined;
      await browser
        .waitUntil(
          async () => {
            for (const c of candidates) if (await shown(c)) return (hit = c) !== undefined;
            return false;
          },
          { timeout: UI_MS, interval: 300 },
        )
        .catch(() => undefined);
      if (!hit) throw new Error('deleteVia manage: no delete confirm dialog appeared');
      await tap(hit);
      return;
    }
    const btn = path === 'all' ? (confirm ? androidDownload.deleteBothConfirm : androidDownload.deleteBothCancel) : confirm ? androidDownload.deleteAlertConfirm : androidDownload.deleteAlertCancel;
    await tap(btn);
  }
}
/** Owner-approved precondition (Rahul, t755u): an edition that is ALREADY downloaded is deleted through the app's own
 *  Weekly download controls (Delete / Manage ▸ Delete ▸ confirm). Nothing else: no pm clear, no file deletion, no
 *  reinstall, no logout, no settings/flag changes. Returns the state after the delete; the caller verifies NOTHING. */
export async function deleteExistingEdition(s: HeaderState): Promise<void> {
  if (s === 'BOTH_DONE') await deleteVia('all', true);
  else if (s === 'AA_DONE' || s === 'PRINT_DONE' || s === 'PARTIAL_DONE') await deleteVia('manage', true);
  else throw new Error(`deleteExistingEdition: ${s} is not a downloaded state`);
}
/** Return the edition to NOTHING — only ever called when the spec itself created the download. */
export async function cleanupOwn(): Promise<void> {
  await openWeekly().catch((e: Error) => {
    if (e.message.startsWith('INFRA')) throw e;
  });
  for (let i = 0; i < 3; i++) {
    const s = await headerState();
    if (s === 'NOTHING') return;
    if (s === 'BOTH_DONE') await deleteVia('all', true);
    else if (s === 'AA_DONE' || s === 'PRINT_DONE' || s === 'PARTIAL_DONE') await deleteVia('manage', true);
    else if (s === 'DOWNLOADING_AA' || s === 'DOWNLOADING_PRINT' || s === 'WAITING_WIFI') await cancelDownload();
    else if (s === 'FAILED' || s === 'UNKNOWN') break;
    await browser.waitUntil(async () => (await headerState()) !== s, { timeout: UI_MS }).catch(() => undefined);
  }
  if ((await headerState()) !== 'NOTHING') console.log(`CLEANUP WARNING: edition not back to NOTHING (${await headerState()})`);
}
export async function cancelDownload(): Promise<void> {
  if (isIOS()) {
    if (await present(iosDownload.pdfCancel)) await tap(iosDownload.pdfCancel);
    else await tap(iosDownload.cancelEditionDownload);
    if (await shown(iosDownload.alertDeleteButton.replace('"Delete"', '"Cancel download"'), 3000)) await tap(iosDownload.alertDeleteButton.replace('"Delete"', '"Cancel download"'));
  } else {
    // Android: tapping the row while Downloading cancels directly, no confirm (WeeklyViewModel.handleManualDownloadRowClicked → component handler).
    await guardedClick($(androidDownload.manualDownloadRow), 'android cancel row');
  }
}

// ---------- viewer ----------
export async function viewPrintVisible(): Promise<boolean> {
  return present(isIOS() ? iosDownload.viewPrintEdition : androidDownload.viewPrintEdition);
}
export async function openViewer(): Promise<void> {
  await tap(isIOS() ? iosDownload.viewPrintEdition : androidDownload.viewPrintEdition);
}
const V = () => (isIOS() ? iosViewer : androidViewer);
/** Was inline download progress visible right after opening the viewer? Android: download-progress/cover (the
 *  pdf-viewer-progress-bar is the reading-position bar and is always present). Fast 150 ms poll; downloads are quick on Wi-Fi. */
export async function inlineProgressSeen(ms = 5000): Promise<boolean> {
  const sels = isIOS() ? ['~pdf-viewer-progress-bar', '~pdf-viewer-loader'] : [androidViewer.loader, androidViewer.cover];
  return browser
    .waitUntil(
      async () => {
        for (const s of sels)
          if (
            await $(s)
              .isExisting()
              .catch(() => false)
          )
            return true;
        return false;
      },
      { timeout: ms, interval: 150 },
    )
    .then(
      () => true,
      () => false,
    );
}
export async function viewerOpen(ms = UI_MS): Promise<boolean> {
  return shown(V().back, ms);
}
/** Android: the indicator container has no text; the "n of N" lives on its liskov-text child. */
async function indicatorText(): Promise<string> {
  const own = await label(V().indicator);
  // UiAutomator2 returns the string "null" for a missing content-desc, so test for the pattern, not truthiness.
  if (/\d+\s+of\s+\d+/.test(own) || isIOS()) return own;
  const child = $(V().indicator).$('id=liskov-text');
  return (await child.isExisting().catch(() => false)) ? ((await child.getText().catch(() => '')) ?? '') : '';
}
export async function pageIndicator(ms = DOWNLOAD_TIMEOUT_MS): Promise<{ page: number; of: number }> {
  let txt = '';
  await browser.waitUntil(async () => /(\d+)\s+of\s+(\d+)/.test((txt = await indicatorText())), {
    timeout: ms,
    interval: 1000,
    timeoutMsg: 'page indicator "n of N" never appeared',
  });
  const m = /(\d+)\s+of\s+(\d+)/.exec(txt)!;
  return { page: Number(m[1]), of: Number(m[2]) };
}
export async function swipePage(dir: 'next' | 'prev'): Promise<void> {
  const { width, height } = await browser.getWindowSize();
  const y = Math.round(height / 2);
  const [x1, x2] = dir === 'next' ? [Math.round(width * 0.85), Math.round(width * 0.15)] : [Math.round(width * 0.15), Math.round(width * 0.85)];
  await guardedGesture(`swipePage ${dir}`, () =>
    browser
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: x1, y })
      .down()
      .move({ x: x2, y, duration: 250 })
      .up()
      .perform(),
  );
}
/** Android pinch on the viewer pager (UiAutomator2 gestures); zoom state is not in the a11y tree, so callers treat it as Partial. */
export async function pinchViewer(kind: 'open' | 'close', percent = 0.6): Promise<void> {
  const el = await $(androidViewer.pager);
  await browser
    .execute(kind === 'open' ? 'mobile: pinchOpenGesture' : 'mobile: pinchCloseGesture', { elementId: await el.elementId, percent })
    .catch((e: Error) => console.log(`pinch ${kind} not applied: ${e.message}`));
}
export async function waitPage(n: number, ms = UI_MS): Promise<void> {
  await browser.waitUntil(async () => (await pageIndicator(ms)).page === n, {
    timeout: ms,
    interval: 500,
    timeoutMsg: `page indicator never showed ${n}`,
  });
}
/** iOS viewer menu toggle sits top-right (y 66–102 pt, inside the banner band). Tap it LOW inside the button
 *  (80% of its height) via the guarded coordinate tap (settle + SpringBoard banner check + front checks). */
export async function openViewerMenuIOS(): Promise<void> {
  const btn = $(`-ios predicate string:name == "pdf-viewer-menu-toggle-button" AND type == "XCUIElementTypeButton"`);
  await btn.waitForDisplayed({ timeout: UI_MS });
  const r = (await btn.getLocation()) as { x: number; y: number };
  const sz = (await btn.getSize()) as { width: number; height: number };
  await guardedTapAt(Math.round(r.x + sz.width / 2), Math.round(r.y + sz.height * 0.8), 'viewer menu toggle (low)');
  await $(iosViewer.menu).waitForDisplayed({ timeout: UI_MS });
}
export async function gotoPage(n: number): Promise<void> {
  if (isIOS()) {
    if (!(await shown(iosViewer.menu))) await openViewerMenuIOS();
    const thumb = $(`~${iosViewerThumbPrefix}${n}`);
    // The thumbnail strip is a horizontal lazy list (only a few thumbs exist in the tree): swipe toward the target,
    // reading the visible thumb numbers after each swipe; flick (fast) when far, slow drag when near. Max 60 swipes.
    const { width } = await browser.getWindowSize();
    const visibleThumbs = async (): Promise<{ nums: number[]; y: number }> => {
      const els = await $$(`-ios predicate string:name BEGINSWITH "${iosViewerThumbPrefix}" AND visible == 1`);
      const nums: number[] = [];
      let y = 0;
      for (const el of els) {
        const nm = String((await el.getAttribute('name').catch(() => '')) ?? '');
        const k = Number(nm.slice(iosViewerThumbPrefix.length));
        if (Number.isFinite(k) && k > 0) nums.push(k);
        if (!y) {
          const r = (await el.getLocation().catch(() => ({ x: 0, y: 0 }))) as { x: number; y: number };
          const sz = (await el.getSize().catch(() => ({ width: 0, height: 0 }))) as { width: number; height: number };
          y = Math.round(r.y + sz.height / 2);
        }
      }
      return { nums, y };
    };
    for (let i = 0; i < 60 && !(await thumb.isDisplayed().catch(() => false)); i++) {
      const { nums, y } = await visibleThumbs();
      if (!nums.length || !y) break;
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      const forward = n > hi;
      if (!forward && n >= lo) break; // in range but not displayed: let the wait below decide
      const far = Math.abs(forward ? n - hi : lo - n) > 6;
      const [x1, x2] = forward ? [Math.round(width * 0.85), Math.round(width * 0.15)] : [Math.round(width * 0.15), Math.round(width * 0.85)];
      await guardedGesture(`thumb strip ${forward ? 'next' : 'prev'} ${i + 1}`, () =>
        browser
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ x: x1, y })
          .down()
          .move({ x: x2, y, duration: far ? 120 : 450 })
          .up()
          .perform(),
      );
    }
    await thumb.waitForDisplayed({ timeout: UI_MS });
    await guardedClick(thumb, `viewer thumb ${n}`);
  } else {
    let cur = (await pageIndicator()).page;
    while (cur !== n) {
      await swipePage(cur < n ? 'next' : 'prev');
      const want = cur < n ? cur + 1 : cur - 1;
      await waitPage(want);
      cur = want;
    }
  }
  await waitPage(n);
}
export async function closeViewer(): Promise<void> {
  await tap(V().back);
  await $(V().back).waitForDisplayed({ timeout: UI_MS, reverse: true });
}

/** Android tablet = smallest width >= 600dp (the app's own isTablet threshold for sw600dp resources). */
export async function isAndroidTablet(): Promise<boolean> {
  const { width, height } = await browser.getWindowSize();
  const dpi = Number(await browser.execute('mobile: getDisplayDensity').catch(() => 160)) || 160;
  return (Math.min(width, height) * 160) / dpi >= 600;
}

// ---------- app lifecycle ----------
export const BUNDLE = process.env['APP_BUNDLE_ID'] ?? 'com.economist.lamarr'; // same id on iOS and Android
export async function relaunch(): Promise<void> {
  await browser.terminateApp(BUNDLE);
  await browser.activateApp(BUNDLE);
}

// ---------- whoAmI (read-only, A10) ----------
export interface WhoAmI {
  loggedIn: boolean | null;
  email?: string;
  source: string;
}
/** Android: Home (Today) ▸ ≡ Menu ▸ Settings. Popups go through the central handler; never taps anything else. */
export async function openSettingsAndroid(): Promise<void> {
  if (await shown(androidAccount.settingsScreen, 500)) return;
  if (!(await shown(androidAccount.settingsButton, 1000))) {
    if (!(await shown(androidAccount.menuButton, 1000))) {
      await normaliseAndroid();
      await tap(androidAccount.todayTab);
    }
    await tap(androidAccount.menuButton);
    await $(androidAccount.menuScreen).waitForDisplayed({ timeout: UI_MS });
  }
  await tap(androidAccount.settingsButton);
  await $(androidAccount.settingsScreen).waitForDisplayed({ timeout: UI_MS });
}

/** Android Settings header: "Log in" (logged out) / "Log out" (logged in) at the top-right. Read-only. */
export async function androidSettingsLoginState(): Promise<{ loggedIn: boolean | null; label: string; email?: string }> {
  if (await shown(androidAccount.loginButton, 1500)) return { loggedIn: false, label: 'Log in' };
  const out = $('android=new UiSelector().textMatches("(?i)^(log|sign) ?out$")');
  const outById = $('id=logout-button');
  const isOut = (await out.isDisplayed().catch(() => false)) || (await outById.isDisplayed().catch(() => false));
  const emailEl = $('android=new UiSelector().textContains("@")');
  const email = (await emailEl.isDisplayed().catch(() => false)) ? ((await emailEl.getText().catch(() => '')) || undefined) : undefined;
  return { loggedIn: isOut ? true : null, label: isOut ? 'Log out' : '', ...(email ? { email } : {}) };
}

/** Android: back out of Settings / Menu to Home (Today). App's own back only (system back while the app is in front). */
export async function backToHomeAndroid(): Promise<void> {
  for (let i = 0; i < 3 && ((await shown(androidAccount.settingsScreen, 300)) || (await shown(androidAccount.menuScreen, 300))); i++) {
    if ((await browser.getCurrentPackage()) !== BUNDLE) break;
    await browser.back();
  }
}

export async function whoAmI(): Promise<WhoAmI> {
  if (!isIOS()) {
    // Read-only: Today ▸ ≡ Menu ▸ Settings, read the top-right Log in / Log out label, back out.
    try {
      await openSettingsAndroid();
      const st = await androidSettingsLoginState();
      await backToHomeAndroid();
      return { loggedIn: st.loggedIn, ...(st.email ? { email: st.email } : {}), source: `android settings header "${st.label}"` };
    } catch (e) {
      if ((e as Error).message.startsWith('INFRA')) throw e;
      console.log(`whoAmI: android settings path not usable (${(e as Error).message.split('\n')[0]?.slice(0, 120)}); falling back to login-button probe`);
      const out = await shown(androidAccount.loginButton, 2000);
      return { loggedIn: out ? false : null, source: 'android login-button probe' };
    }
  }
  // 4.112+: Settings moved from the Today header into Today ▸ Menu. Read-only: we only read the log-in-out label.
  // No safe path ⇒ loggedIn null ("unknown"), never a failure.
  let l = '';
  let email: string | undefined;
  try {
    await tap(iosWeekly.todayTab);
    if (!(await shown(iosAccount.settingsButton, 3000))) await tap(iosAccount.menuButton);
    await tap(iosAccount.settingsButton);
    await $(iosAccount.settingsScreen).waitForDisplayed({ timeout: UI_MS });
    const btn = $(iosAccount.logInOutButton);
    if (!(await btn.isExisting())) await revealIOS(iosAccount.logInOutButton);
    l = (await btn.isExisting()) ? ((await btn.getAttribute('label')) ?? '') : '';
    const emailEl = $('-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS "@"');
    email = (await emailEl.isExisting().catch(() => false)) ? ((await emailEl.getAttribute('label')) ?? undefined) : undefined;
  } catch (e) {
    if ((e as Error).message.startsWith('INFRA')) throw e;
    console.log(`whoAmI: settings path not usable (${(e as Error).message.split('\n')[0]?.slice(0, 120)}); login state unknown`);
  }
  // Back out (Settings ▸ Menu ▸ Today); the caller re-opens Weekly.
  await backOutIOS('whoAmI', async () => !(await shown(iosAccount.backButton)));
  return {
    loggedIn: /log ?out|sign ?out/i.test(l) ? true : /log ?in|sign ?in/i.test(l) ? false : null,
    ...(email ? { email } : {}),
    source: `settings log-in-out-button label "${l}"`,
  };
}
