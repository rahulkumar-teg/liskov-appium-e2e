// Print-edition PDF URL model (plan §4.10). Mirrors, and is contract-tested against:
//  iOS  ios/TheEconomistMobile/Services/Downloads/Edition/EditionPdfURLConstructor.swift
//  Android feature/weekly/WeeklyViewModel.kt (region fallback) + core/data/.../RemoteMobileAssetRepository.kt (URL)
// NOTE: the asset host requires HMAC headers (`mac`, `timestamp`) when DOWNLOADS_HMAC_ENABLED is on (Android
// buildHmacHeaders); an unsigned HEAD may 404/403. The staging PDF probe therefore needs the signing key (Phase 2).
export type Platform = 'ios' | 'android';
export const DEFAULT_PDF_REGION = 'NA';

/** Platform difference (finding): iOS falls back only for nil/"" ; Android also for whitespace-only (isNotBlank). */
export function resolveRegion(region: string | null | undefined, platform: Platform): string {
  if (region === null || region === undefined) return DEFAULT_PDF_REGION;
  if (platform === 'ios') return region === '' ? DEFAULT_PDF_REGION : region;
  return region.trim() === '' ? DEFAULT_PDF_REGION : region;
}

/** `YYYY_MM_DD_<region>` from an ISO date string (first 10 chars, as iOS makePdfContentId(issueDate:)). */
export function pdfContentId(issueDate: string, region: string | null | undefined, platform: Platform): string {
  return `${issueDate.slice(0, 10).replace(/-/g, '_')}_${resolveRegion(region, platform)}`;
}

/** mobileAssets already ends in /mobile-assets (config/environments.ts). */
export function pdfUrl(mobileAssets: string, contentId: string): string {
  return `${mobileAssets.replace(/\/+$/, '')}/epaper/${contentId}.pdf`;
}

export function parseExcludedDates(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Strictly before min date (yyyy-MM-dd lexical compare, as iOS). Empty min ⇒ false. */
export function isBeforeMinDate(issueDate: string, minDate: string): boolean {
  return minDate !== '' && issueDate.slice(0, 10) < minDate;
}

export function isExcludedDate(issueDate: string, excluded: string): boolean {
  return parseExcludedDates(excluded).includes(issueDate.slice(0, 10));
}
