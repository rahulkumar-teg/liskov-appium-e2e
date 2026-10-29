// Repo defaults with source citations (plan §4.11). Contract-tested against LISKOV_REPO by
// tests/contract/flag-defaults.contract.spec.ts — if this drifts from the app, L0 fails (INFRA:CONTRACT).
export const repoDefaults = {
  common: {
    // android core/config/src/main/res/xml/remote_config_defaults.xml l.154-155;
    // iOS ios/Packages/Interfaces/Sources/Interfaces/Configuration/FeatureFlags.swift l.84 (key) + l.269-270 (default true).
    // Phase 1 finding: the iOS default IS in the repo (plan v3.1 §9.2 m assumed true; now confirmed).
    epaper_pdf_download_enabled: true,
    // xml l.158-159; iOS Services/RemoteConfig/ModuleConfigurations.swift l.47
    epaper_pdf_download_min_date: '2025-08-09',
    // xml l.162-163; ModuleConfigurations.swift l.43-46
    epaper_pdf_download_excluded_dates: '2025-08-02,2026-08-01',
    // xml l.166-167; iOS Interfaces FeatureFlags.swift l.86 (key) + l.271-272 (default false)
    epaper_pdf_screenshot_disabled: false,
    // Amplitude flag: android RemoteConfigKey.kt l.458 (source AMPLITUDE, comment l.456 "all start OFF"); not in
    // remote_config_defaults.xml; no iOS key in the repo.
    puwilo_epaper_read_sync_enabled: false,
  },
  android: {
    // xml l.144-147 (JSON value); only the keys the ePaper cases use
    download_config: {
      pdf_download_limit: 8,
      concurrent_pdf_downloads: 2,
      to_queue_max_retry_attempts: 5,
      to_queue_retry_base_delay_secs: 30,
      to_queue_retry_max_delay_secs: 1800,
    },
  },
  ios: {
    // ios/TheEconomistMobile/Services/RemoteConfig/Configurations/DownloadConfiguration.swift l.25-28 (no to_queue_* on iOS)
    download_config: { pdf_download_limit: 8, concurrent_pdf_downloads: 2 },
  },
} as const;

export type Platform = 'ios' | 'android';
