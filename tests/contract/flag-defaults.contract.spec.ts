// L0: config/flags.defaults.ts ↔ Android remote_config_defaults.xml and iOS Swift defaults (plan §4.11, §4.23).
import assert from 'node:assert/strict';
import { repoDefaults } from '../../config/flags.defaults.js';
import { parseRemoteConfigDefaults } from '../../src/contract/androidResources.js';
import { liskov } from './_support.js';

/** Value of `case .<name>:` in the Interfaces FeatureFlags defaults switch (next non-empty line). */
function swiftSwitchDefault(src: string, caseName: string): string | undefined {
  const m = new RegExp(`case \\.${caseName}:\\s*\\n\\s*([^\\n]+)`).exec(src);
  return m?.[1]?.trim();
}

/** `static let <name> = ModuleConfiguration<...>(... defaultValue: "<v>")`, possibly multi-line. */
function swiftModuleDefault(src: string, name: string): string | undefined {
  const m = new RegExp(`static let ${name}\\s*=\\s*ModuleConfiguration<[^>]+>\\(([\\s\\S]*?)\\)\\s*\\n`).exec(src);
  return m ? /defaultValue:\s*"([^"]*)"/.exec(m[1] ?? '')?.[1] : undefined;
}

function swiftInitArg(src: string, label: string): number | undefined {
  const block = /static let defaultValue = DownloadConfiguration\(([\s\S]*?)\)/.exec(src)?.[1];
  const v = block ? new RegExp(`${label}:\\s*(\\d+)`).exec(block)?.[1] : undefined;
  return v === undefined ? undefined : Number(v);
}

describe('L0 flag-defaults.contract (flags.defaults.ts ↔ repo defaults)', () => {
  describe('Android remote_config_defaults.xml', () => {
    let xml: Map<string, string>;
    before(() => {
      xml = parseRemoteConfigDefaults(liskov().read('remoteConfigDefaults'));
      assert.ok(xml.size > 10, `only ${xml.size} entries parsed`);
    });

    it('epaper_pdf_download_enabled', () => assert.equal(xml.get('epaper_pdf_download_enabled'), String(repoDefaults.common.epaper_pdf_download_enabled)));
    it('epaper_pdf_download_min_date', () => assert.equal(xml.get('epaper_pdf_download_min_date'), repoDefaults.common.epaper_pdf_download_min_date));
    it('epaper_pdf_download_excluded_dates', () => assert.equal(xml.get('epaper_pdf_download_excluded_dates'), repoDefaults.common.epaper_pdf_download_excluded_dates));
    it('epaper_pdf_screenshot_disabled', () => assert.equal(xml.get('epaper_pdf_screenshot_disabled'), String(repoDefaults.common.epaper_pdf_screenshot_disabled)));

    it('download_config JSON contains the framework keys with equal values', () => {
      const raw = xml.get('download_config');
      assert.ok(raw, 'download_config missing');
      const dc = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(repoDefaults.android.download_config)) assert.equal(dc[k], v, `download_config.${k}`);
    });

    it('puwilo_epaper_read_sync_enabled is an AMPLITUDE key with no Firebase default ("all start OFF") → framework default false', () => {
      const kt = liskov().read('remoteConfigKey');
      assert.match(kt, /PUWILO_EPAPER_READ_SYNC_ENABLED\("puwilo_epaper_read_sync_enabled",\s*RemoteConfigSource\.AMPLITUDE\)/);
      assert.match(kt, /all start OFF/);
      assert.equal(xml.has('puwilo_epaper_read_sync_enabled'), false, 'a Firebase default now exists; re-check flags.defaults.ts');
      assert.equal(repoDefaults.common.puwilo_epaper_read_sync_enabled, false);
    });

    it('epaper keys are FIREBASE-sourced (so the RC REST reader is the right API)', () => {
      const kt = liskov().read('remoteConfigKey');
      for (const k of ['epaper_pdf_download_enabled', 'epaper_pdf_download_min_date', 'epaper_pdf_download_excluded_dates', 'epaper_pdf_screenshot_disabled']) {
        assert.match(kt, new RegExp(`\\("${k}",\\s*RemoteConfigSource\\.FIREBASE\\)`), k);
      }
    });
  });

  describe('iOS Swift defaults', () => {
    it('Interfaces FeatureFlags: epaper_pdf_download_enabled key + default true', () => {
      const s = liskov().read('iosInterfacesFeatureFlags');
      assert.match(s, /case epaperPdfDownloadEnabled = "epaper_pdf_download_enabled"/);
      assert.equal(swiftSwitchDefault(s, 'epaperPdfDownloadEnabled'), String(repoDefaults.common.epaper_pdf_download_enabled));
    });
    it('Interfaces FeatureFlags: epaper_pdf_screenshot_disabled key + default false', () => {
      const s = liskov().read('iosInterfacesFeatureFlags');
      assert.match(s, /case epaperPdfScreenshotDisabled = "epaper_pdf_screenshot_disabled"/);
      assert.equal(swiftSwitchDefault(s, 'epaperPdfScreenshotDisabled'), String(repoDefaults.common.epaper_pdf_screenshot_disabled));
    });
    it('ModuleConfigurations: epaper_pdf_download_min_date', () => {
      assert.equal(swiftModuleDefault(liskov().read('iosModuleConfigurations'), 'epaperPdfDownloadMinDate'), repoDefaults.common.epaper_pdf_download_min_date);
    });
    it('ModuleConfigurations: epaper_pdf_download_excluded_dates', () => {
      assert.equal(swiftModuleDefault(liskov().read('iosModuleConfigurations'), 'epaperPdfDownloadExcludedDates'), repoDefaults.common.epaper_pdf_download_excluded_dates);
    });
    it('DownloadConfiguration.defaultValue: pdfDownloadLimit / concurrentPdfDownloads', () => {
      const s = liskov().read('iosDownloadConfiguration');
      assert.equal(swiftInitArg(s, 'pdfDownloadLimit'), repoDefaults.ios.download_config.pdf_download_limit);
      assert.equal(swiftInitArg(s, 'concurrentPdfDownloads'), repoDefaults.ios.download_config.concurrent_pdf_downloads);
    });
    it('documented gap: iOS has no puwilo_epaper_read_sync_enabled key (flips when iOS adds it)', () => {
      assert.equal(/puwilo_epaper_read_sync_enabled/.test(liskov().read('iosInterfacesFeatureFlags')), false);
    });
  });
});
