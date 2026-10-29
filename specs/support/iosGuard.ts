/// <reference types="@wdio/globals/types" />
// iOS foreground/banner guard (incidents 2026-10-29 09:54 Slack and 10:01 File Manager: a top-left tap landed on
// a notification banner and opened another app). Every iOS click/tap/back goes through guardedClick/guardedTapAt/
// edgeSwipeBack. Rules: never interact with another app; if one is in front, do ONE `mobile: activateApp` for the
// app under test and fail with INFRA naming that app. Before a tap in the top band (y < 140 pt), wait for any
// SpringBoard notification banner to clear (max 8 s) or refuse to tap. On Android these helpers just click.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { springboardBanner } from '../../src/model/SpringboardBanner.js';

export const APP_BUNDLE = process.env['APP_BUNDLE_ID'] ?? 'com.economist.lamarr';
export const TOP_BAND_PT = 140;
const BANNER_WAIT_MS = Number(process.env['BANNER_WAIT_MS'] ?? 8000);
const FRONT_AFTER_MS = Number(process.env['FRONT_AFTER_MS'] ?? 1500);
// Banner detection: SpringBoard page source parsed by springboardBanner() (wider than a single predicate). Read-only; never tapped.
const TOP_SETTLE_MS = Number(process.env['TOP_SETTLE_MS'] ?? 1500);

export async function frontBundle(b: WebdriverIO.Browser = browser): Promise<string | undefined> {
  const r = (await b.execute('mobile: activeAppInfo').catch(() => ({}))) as { bundleId?: string };
  return r.bundleId;
}

/** INFRA failure when another app is in front: one activateApp of the app under test, nothing else. */
async function recoverAndFail(b: WebdriverIO.Browser, other: string, where: string, phase: string): Promise<never> {
  const back = await b
    .execute('mobile: activateApp', { bundleId: APP_BUNDLE })
    .then(() => 'activateApp done')
    .catch((e: Error) => `activateApp failed: ${e.message.split('\n')[0]}`);
  throw new Error(`INFRA: ${other} came to the front ${phase} ${where}; no interaction with it; ${back}. Silence notifications for ${other} (Focus) and rerun.`);
}

export async function assertFront(where: string, b: WebdriverIO.Browser = browser, phase = 'before', allow: readonly string[] = []): Promise<void> {
  if (!b.isIOS) return;
  const f = await frontBundle(b);
  if (f && f !== APP_BUNDLE && !allow.includes(f)) await recoverAndFail(b, f, where, phase);
}

/** After a tap, watch briefly: a banner tap hands off to its app within ~0.5–2 s. */
async function assertStillFront(where: string, b: WebdriverIO.Browser, allow: readonly string[] = []): Promise<void> {
  if (!b.isIOS) return;
  let other: string | undefined;
  await b
    .waitUntil(
      async () => {
        const f = await frontBundle(b);
        if (f && f !== APP_BUNDLE && !allow.includes(f)) other = f;
        return other !== undefined;
      },
      { timeout: FRONT_AFTER_MS, interval: 300 },
    )
    .catch(() => undefined);
  if (other) await recoverAndFail(b, other, where, 'after');
}

let dumped = false;
/** Reads the SpringBoard tree (read-only) and reports a banner via springboardBanner(). The first call per process,
 *  and every call that finds a banner, saves the dump to reports/evidence-ios/springboard-*.xml for inspection. */
async function bannerShown(b: WebdriverIO.Browser, where: string): Promise<boolean> {
  let src = '';
  try {
    await b.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
    src = await b.getPageSource().catch(() => '');
  } finally {
    await b.updateSettings({ defaultActiveApplication: 'auto' }).catch(() => undefined);
  }
  const hit = src ? springboardBanner(src) : undefined;
  if (!dumped || hit) {
    dumped = true;
    const dir = path.join(process.env['EVIDENCE_DIR'] ?? 'reports/evidence-ios', 'springboard');
    mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `springboard-${Date.now()}-${hit ? 'BANNER' : 'clear'}.xml`);
    writeFileSync(f, src);
    console.log(`banner guard: springboard dump (${src.length} bytes, banner=${hit ?? 'none'}) at ${where} -> ${f}`);
  }
  return hit !== undefined;
}

/** Before a top-band tap: wait for any notification banner to clear; refuse to tap if it does not. */
export async function waitNoBanner(where: string, y: number, b: WebdriverIO.Browser = browser, allow: readonly string[] = []): Promise<void> {
  if (!b.isIOS || y >= TOP_BAND_PT) return;
  // Settle first (condition wait, ~1.5 s): watch the front app while a banner that is just sliding in settles,
  // so the banner check below sees it instead of the tap hitting it. Another app in front → INFRA (one activateApp).
  await b
    .waitUntil(async () => {
      const f = await frontBundle(b);
      return !!f && f !== APP_BUNDLE && !allow.includes(f);
    }, { timeout: TOP_SETTLE_MS, interval: 300 })
    .catch(() => undefined);
  await assertFront(where, b, 'before', allow);
  if (!(await bannerShown(b, where))) return;
  console.log(`banner guard: notification banner over the top band at ${where}; waiting up to ${BANNER_WAIT_MS} ms`);
  const cleared = await b.waitUntil(async () => !(await bannerShown(b, where)), { timeout: BANNER_WAIT_MS, interval: 500 }).catch(() => false);
  if (!cleared) throw new Error(`INFRA: notification banner still covering the top band at ${where}; refusing to tap (turn on a stricter Focus)`);
}

/** The ONE way to click an element on iOS (front check → banner check for top band → click → front check).
 *  `allow`: extra bundles tolerated as "front" — only popups.ts passes SpringBoard, for system permission alerts. */
export async function guardedClick(el: ReturnType<WebdriverIO.Browser['$']>, where: string, b: WebdriverIO.Browser = browser, allow: readonly string[] = []): Promise<void> {
  if (!b.isIOS) {
    await el.click();
    return;
  }
  await assertFront(where, b, 'before', allow);
  const r = (await el.getLocation().catch(() => ({ x: 0, y: 0 }))) as { x: number; y: number };
  await waitNoBanner(where, r.y, b, allow);
  await el.click();
  await assertStillFront(where, b, allow);
}

/** Coordinate tap (e.g. tap-outside to dismiss a menu), same guards. */
export async function guardedTapAt(x: number, y: number, where: string, b: WebdriverIO.Browser = browser): Promise<void> {
  await assertFront(where, b);
  await waitNoBanner(where, y, b);
  await b.action('pointer', { parameters: { pointerType: 'touch' } }).move({ x, y }).down().up().perform();
  await assertStillFront(where, b);
}

/** Guarded gesture wrapper for swipes/drags (front check before and after). */
export async function guardedGesture(where: string, fn: () => Promise<unknown>, b: WebdriverIO.Browser = browser): Promise<void> {
  await assertFront(where, b);
  await fn();
  await assertStillFront(where, b);
}

/** iOS back: left-edge swipe at mid-screen (stays out of the banner band). */
export async function edgeSwipeBack(where: string, b: WebdriverIO.Browser = browser): Promise<void> {
  const { width, height } = await b.getWindowSize();
  const y = Math.round(height / 2);
  await guardedGesture(
    where,
    () =>
      b
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x: 2, y })
        .down()
        .move({ x: Math.round(width * 0.75), y, duration: 350 })
        .up()
        .perform(),
    b,
  );
}
