// Mobile-assets request signing (edition PDFs / zips), mirroring the app exactly (read-only source, 2026-10-28):
//   android core/data/.../RemoteMobileAssetRepository.kt generateRequestSignature + EncryptionUtil.encodeMessage
//   ios TheEconomistMobile/Services/Downloads/FileDownloader/FileDownloaderRequestBuilderUseCase.swift buildRequest
// message = URL path (no query) + unix time in SECONDS; mac = Base64(HMAC-SHA256(key UTF-8, message UTF-8)),
// standard alphabet with padding, NOT URL-encoded (encodeWithUrlEncoder = false). Headers: `mac`, `timestamp`.
// Android only signs when RemoteConfig DOWNLOADS_HMAC_ENABLED; iOS signs whenever the secret is non-empty.
// No expiry parameter is sent: freshness is enforced server-side from `timestamp` (window not visible in app code).
// The key is a SecretString; it is revealed only inside sign() and never logged.
import { createHmac } from 'node:crypto';
import type { SecretString } from './SecretString.js';

export interface AssetHeaders {
  mac: string;
  timestamp: string;
}

export function signAssetRequest(url: string, key: SecretString, nowMs: number = Date.now()): AssetHeaders {
  const seconds = Math.floor(nowMs / 1000).toString();
  const path = new URL(url).pathname;
  const mac = createHmac('sha256', Buffer.from(key.reveal(), 'utf8')).update(path + seconds, 'utf8').digest('base64');
  return { mac, timestamp: seconds };
}

/** contentId `YYYY_MM_DD_<REGION>` → edition PDF URL (RemoteMobileAssetRepository.getEditionPdfAssetUrl). */
export function editionPdfUrl(mobileAssetsBase: string, contentId: string): string {
  if (!/^\d{4}_\d{2}_\d{2}_[A-Z]{2,3}$/.test(contentId)) throw new Error(`contentId must be YYYY_MM_DD_REGION, got ${contentId}`);
  return `${mobileAssetsBase.replace(/\/$/, '')}/epaper/${contentId}.pdf`;
}
