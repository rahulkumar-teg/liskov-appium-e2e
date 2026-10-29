// Precondition gate for device specs: decides, per target, which catalog needs can be met WITHOUT a forbidden device
// change, and SKIPs (SkipError taxonomy, plan §4.16) with a recorded reason otherwise. Never converts a skip into a pass.
import { addDescription, addLabel } from '@wdio/allure-reporter';
import { existsSync, readFileSync } from 'node:fs';
import { SkipError, type SkipReason } from '../../src/core/errors.js';
import { CATALOG, type EpCase, type Need } from './catalog.js';
import { parked } from './parked.js';

export type Target = 'ios-real' | 'ios-sim' | 'android-emu' | 'android-real';
const TARGETS: readonly Target[] = ['ios-real', 'ios-sim', 'android-emu', 'android-real'];
/** Set by the wdio.<target>.conf.ts in use (wdio.base.ts setTarget); a spec never guesses its platform. */
export const target = process.env['TARGET'] as Target;
if (!TARGETS.includes(target)) throw new Error(`INFRA:CONFIG TARGET=${target ?? '(unset)'}; run specs through a wdio.<target>.conf.ts`);
const on = (k: string) => process.env[k] === '1';

/** Device ownership on this run. dev-only personal devices never get logged out, throttled, taken offline or relocalised. */
export const dedicated = on('DEVICE_DEDICATED');

function flagOffDeclared(): boolean {
  const f = new URL('../../config/flags.override.json', import.meta.url);
  if (!existsSync(f)) return false;
  const j = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
  const env = (process.env['ENV'] ?? 'stage') as string;
  const block = (j[env] ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const plat = target.startsWith('ios') ? 'ios' : 'android';
  return [block['common'], block[plat]].some((b) => b?.['epaper_pdf_download_enabled'] === false);
}

/** null = need can be met; otherwise [taxonomy reason, human detail]. */
export function unmet(n: Need): [SkipReason, string] | null {
  const ios = target.startsWith('ios');
  switch (n) {
    case 'login':
      return null; // checked at runtime by whoAmI (read-only); a logged-out device SKIPs there
    case 'logout':
      // would-logout: reaching a logged-out state means signing the owner out; never done (owner session is kept).
      return ['WOULD_LOGOUT', 'would-logout: needs a logged-out device; the framework never logs out, signs out or switches accounts'];
    case 'flagOff':
      return flagOffDeclared() ? null : ['FLAG_OFF', 'needs epaper_pdf_download_enabled=false declared in config/flags.override.json (framework never toggles flags)'];
    case 'offline':
      if (target === 'ios-sim') return ['NOT_ON_PLATFORM', 'ios-sim has no real offline path (§2.3)'];
      return dedicated || on('ALLOW_OFFLINE') ? null : ['PRECONDITION', 'offline step (setConnectivity) awaiting Rahul’s OK; not run on the owner device (ALLOW_OFFLINE=1 to opt in)'];
    case 'throttle':
      return on('ALLOW_THROTTLE') ? null : ['PRECONDITION', 'needs network throttling (NLC / emulator speed); not available on this target'];
    case 'cellular':
      return on('HAS_SIM_ONLY_NETWORK') ? null : ['PRECONDITION', 'needs a cellular-only network (SIM)'];
    case 'ipad':
      return on('IS_IPAD') ? null : ['NOT_ON_PLATFORM', 'iPad-only case; target is an iPhone'];
    case 'tablet':
      return on('IS_TABLET') ? null : ['NOT_ON_PLATFORM', 'tablet-only case'];
    case 'manual':
      return ['PRECONDITION', 'manual (assisted capture) — human verdict, not automated (D13)'];
    case 'multiRegion':
      return (process.env['REGIONS'] ?? 'DK').split(',').length >= 2 ? null : ['GATED_BY_OPEN_QUESTION', 'separate regional PDFs need ≥2 REGIONS (default DK only, D3)'];
    case 'locale':
      return dedicated ? null : ['PRECONDITION', 'needs per-launch locale change; not done on a dev-only personal device'];
    case 'heavy':
      return on('ALLOW_HEAVY') ? null : ['PRECONDITION', 'heavy multi-PDF download case (nightly, serial account); not run on a dev-only personal device'];
    case 'contractPdf':
      return process.env['PDF_STAGING_CONTENT_IDS'] || process.env['PDF_STAGING_FILES'] ? null : ['GATED_BY_OPEN_QUESTION', 'needs a real staging PDF for the contract layer (PDF_STAGING_CONTENT_IDS / PDF_STAGING_FILES)'];
    case 'excludedEdition':
    case 'preMinDateEdition':
      return ios || target.startsWith('android') ? null : null; // resolved at runtime from Browse editions
  }
}

export function skipCase(ctx: Mocha.Context, reason: SkipReason, detail: string): never {
  const e = new SkipError(reason, detail);
  addLabel('skipReason', reason);
  void addDescription(e.message, 'text');
  console.log(`${ctx.currentTest?.parent?.title ?? ''} ${e.message}`);
  ctx.skip();
  throw e; // unreachable: ctx.skip() throws Mocha's Pending
}

/** Call in before(): platform + all static needs. */
export function gate(ctx: Mocha.Context, id: string): EpCase {
  const c = CATALOG[id];
  if (!c) throw new Error(`unknown case ${id}`);
  addLabel('epCase', id);
  addLabel('severity', c.prio === 'P0' ? 'critical' : 'normal');
  const ios = target.startsWith('ios');
  if (c.platforms === 'iOS' && !ios) skipCase(ctx, 'NOT_ON_PLATFORM', `${id} is iOS-only`);
  if (c.platforms === 'Android' && ios) skipCase(ctx, 'NOT_ON_PLATFORM', `${id} is Android-only`);
  const p = parked(id, ios ? 'ios' : 'android');
  if (p) {
    addLabel('tag', 'parked');
    skipCase(ctx, p.reason, `${id}: parked — ${p.detail} (RUN_PARKED=1 to run)`);
  }
  for (const n of c.needs) {
    const u = unmet(n);
    if (u) skipCase(ctx, u[0], `${id}: ${u[1]}`);
  }
  return c;
}
