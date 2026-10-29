// Parked specs (Rahul, 2026-10-29 16:38 IST: "whatever is not running currently mark them as skipped").
// Every EP outside the currently passing set SKIPs up front in gate() with the reason below. That is an explicit
// Mocha skip, so it shows as "skipped" in Allure, never as passed. The spec bodies are unchanged.
// Reversible: delete an entry to un-park one case, or set RUN_PARKED=1 to let every parked case run through its
// normal precondition gate (which may still skip it).
// Passing set at parking time: Android EP-01–05, 11, 12, 14, 16, 18, 20, 21, 22, 26, 28; iOS the same minus EP-16.
import type { SkipReason } from '../../src/core/errors.js';

export type Platform = 'ios' | 'android';
export interface Parked {
  reason: SkipReason;
  detail: string;
  /** Platforms the case is parked on (default: both). */
  on?: Platform[];
}

const OFFLINE = 'offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device';

export const PARKED: Readonly<Record<string, Parked>> = {
  'EP-06': { reason: 'PRECONDITION', detail: OFFLINE },
  'EP-07': { reason: 'FLAG_OFF', detail: 'needs epaper_pdf_download_enabled=false declared in config/flags.override.json (the framework never toggles flags)' },
  'EP-08': { reason: 'WOULD_LOGOUT', detail: 'needs a logged-out app state; specs never log out' },
  'EP-09': { reason: 'GATED_BY_OPEN_QUESTION', detail: 'needs an edition before epaper_pdf_download_min_date in Browse editions' },
  'EP-10': { reason: 'NOT_ON_PLATFORM', detail: 'iPad-only case; the test devices are phones' },
  'EP-13': { reason: 'PRECONDITION', detail: OFFLINE },
  'EP-15': { reason: 'PRECONDITION', detail: OFFLINE },
  'EP-16': { reason: 'PRECONDITION', detail: 'no network throttling on iOS: the download finishes before it can be cancelled', on: ['ios'] },
  'EP-17': { reason: 'PRECONDITION', detail: 'needs network throttling and a serial account for ≥3 concurrent PDF downloads (heavy)' },
  'EP-19': { reason: 'GATED_BY_OPEN_QUESTION', detail: 'needs ≥2 REGIONS with a locale change per launch and a staging PDF contentId' },
  'EP-23': { reason: 'NOT_ON_PLATFORM', detail: 'phones are portrait-locked; needs a device that rotates (tablet)' },
  'EP-24': { reason: 'GATED_BY_OPEN_QUESTION', detail: 'needs a known excluded-date edition' },
  'EP-25': { reason: 'PRECONDITION', detail: 'heavy multi-PDF eviction case (serial account, nightly); not run on a personal device' },
  'EP-27': { reason: 'GATED_BY_OPEN_QUESTION', detail: 'needs a real staging PDF (PDF_STAGING_CONTENT_IDS / PDF_STAGING_FILES)' },
  'EP-29': { reason: 'NOT_ON_PLATFORM', detail: 'Android tablet-only, manual verdict' },
  'EP-30': { reason: 'GATED_BY_OPEN_QUESTION', detail: 'needs ≥2 REGIONS with a locale change per launch and a staging PDF contentId' },
  'EP-31': { reason: 'PRECONDITION', detail: `${OFFLINE}; also needs network throttling` },
  'EP-32': { reason: 'PRECONDITION', detail: `${OFFLINE}; also needs network throttling` },
  'EP-33': { reason: 'PRECONDITION', detail: 'needs a cellular-only (SIM) network' },
  'EP-34': { reason: 'PRECONDITION', detail: 'manual assisted capture: human verdict, not automated (D13)' },
};

/** The parking entry for this case on this platform, or null when it runs normally (or RUN_PARKED=1). */
export function parked(id: string, platform: Platform, env: NodeJS.ProcessEnv = process.env): Parked | null {
  if (env['RUN_PARKED'] === '1') return null;
  const p = PARKED[id];
  return p && (!p.on || p.on.includes(platform)) ? p : null;
}
