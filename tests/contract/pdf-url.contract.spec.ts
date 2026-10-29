// L0: src/model/PdfUrl.ts ↔ iOS EditionPdfURLConstructor.swift and Android WeeklyViewModel / RemoteMobileAssetRepository.
import assert from 'node:assert/strict';
import { endpoints } from '../../config/environments.js';
import { DEFAULT_PDF_REGION, isBeforeMinDate, isExcludedDate, pdfContentId, pdfUrl, resolveRegion } from '../../src/model/PdfUrl.js';
import { liskov } from './_support.js';

describe('L0 pdf-url.contract (PDF URL / region fallback)', () => {
  it('iOS defaultRegion equals framework DEFAULT_PDF_REGION', () => {
    const m = /static let defaultRegion = "([A-Z]+)"/.exec(liskov().read('iosPdfUrlConstructor'));
    assert.equal(m?.[1], DEFAULT_PDF_REGION);
  });
  it('Android DEFAULT_PDF_REGION equals framework DEFAULT_PDF_REGION', () => {
    const m = /DEFAULT_PDF_REGION = "([A-Z]+)"/.exec(liskov().read('weeklyViewModel'));
    assert.equal(m?.[1], DEFAULT_PDF_REGION);
  });
  it('iOS region fallback is nil/"" only (whitespace is kept)', () => {
    assert.match(liskov().read('iosPdfUrlConstructor'), /region\.flatMap \{ \$0\.isEmpty \? nil : \$0 \} \?\? defaultRegion/);
    assert.equal(resolveRegion(' ', 'ios'), ' ');
    assert.equal(resolveRegion('', 'ios'), 'NA');
  });
  it('Android region fallback is null/blank (isNotBlank)', () => {
    assert.match(liskov().read('weeklyViewModel'), /edition\.region\?\.takeIf \{ it\.isNotBlank\(\) \} \?: DEFAULT_PDF_REGION/);
    assert.equal(resolveRegion(' ', 'android'), 'NA');
  });
  it('iOS URL = baseURL/epaper/<contentId>.pdf; content id = YYYY_MM_DD_<region>', () => {
    const s = liskov().read('iosPdfUrlConstructor');
    assert.match(s, /appendingPathComponent\("epaper"\)\s*\n\s*\.appendingPathComponent\("\\\(contentId\)\.pdf"\)/);
    assert.match(s, /replacingOccurrences\(of: "-", with: "_"\)/);
    assert.equal(pdfContentId('2026-10-24T00:00:00Z', 'EU', 'ios'), '2026_10_24_EU');
  });
  it('Android URL = <base>/mobile-assets/epaper/<contentId>.pdf (framework mobileAssets already ends in /mobile-assets)', () => {
    const kt = liskov().read('remoteMobileAssetRepository');
    assert.match(kt, /"\$mobileAssetBaseUrl\/\$REMOTE_ASSET_SEGMENT\/\$EPAPER_SEGMENT\/\$contentId\$PDF_EXTENSION"/);
    assert.match(kt, /REMOTE_ASSET_SEGMENT = "mobile-assets"/);
    assert.match(kt, /EPAPER_SEGMENT = "epaper"/);
    assert.match(kt, /PDF_EXTENSION = "\.pdf"/);
    assert.ok(endpoints.stage.mobileAssets.endsWith('/mobile-assets'));
    assert.equal(pdfUrl(endpoints.stage.mobileAssets, '2026_10_24_EU'), 'https://stage-mobileapp.economist.com/mobile-assets/epaper/2026_10_24_EU.pdf');
  });
  it('asset requests are HMAC-signed when DOWNLOADS_HMAC_ENABLED (headers mac + timestamp) — staging probe needs signing', () => {
    const kt = liskov().read('remoteMobileAssetRepository');
    assert.match(kt, /HEADER_KEY_MAC = "mac"/);
    assert.match(kt, /HEADER_KEY_TIMESTAMP = "timestamp"/);
    assert.match(kt, /DOWNLOADS_HMAC_ENABLED/);
  });
  it('min-date is strictly-before and excluded-dates are trimmed (iOS semantics)', () => {
    const s = liskov().read('iosPdfUrlConstructor');
    assert.match(s, /return editionDate < minDate/);
    assert.match(s, /trimmingCharacters\(in: \.whitespacesAndNewlines\)/);
    assert.equal(isBeforeMinDate('2025-08-09', '2025-08-09'), false);
    assert.equal(isBeforeMinDate('2025-08-08', '2025-08-09'), true);
    assert.equal(isExcludedDate('2026-08-01', ' 2025-08-02 , 2026-08-01 '), true);
  });
});
