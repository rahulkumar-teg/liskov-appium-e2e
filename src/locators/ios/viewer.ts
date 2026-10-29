// iOS PDF viewer + Weekly/Settings/Paywall ids (AccessibilityIds.swift structs EditionPdfViewer, Weekly, BrowseEditions,
// Settings, Paywall, Tabs) — plan §4.7. Every '~' id is contract-checked (tests/contract/locators.contract.spec.ts).
export const iosViewer = {
  back: '~pdf-viewer-back-button',
  close: '~pdf-viewer-close-button',
  indicator: '~pdf-viewer-page-indicator', // "%d of %d"
  progress: '~pdf-viewer-progress-bar',
  loader: '~pdf-viewer-loader',
  retry: '~pdf-viewer-error-retry-button',
  waitWifi: '~pdf-viewer-waiting-for-wifi',
  menuToggle: '~pdf-viewer-menu-toggle-button',
  menu: '~pdf-viewer-menu',
} as const;
export const iosViewerThumbPrefix = 'pdf-viewer-menu-page-thumbnail-'; // + 1-based page

export const iosWeekly = {
  tab: '-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Weekly" OR label == "Weekly")',
  todayTab: '-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Today" OR label == "Today")',
  browseEditions: '~browse-editions-button',
  cover: '~edition-cover-image',
  publishedDate: '~edition-published-date',
  title: '~edition-title',
  browseHeader: '~editions-screen-header',
  browseBack: '~back-to-weekly-button',
  browseDismiss: '~browse-editions-dismiss-button',
} as const;
export const iosBrowsePublishedDatePrefix = 'published-date-for-edition-'; // + 0-based index

export const iosAccount = {
  settingsButton: '~settings-button', // 4.112+: inside Today ▸ Menu (was in the Today header)
  menuButton: '~menu-button', // Today header ▸ Menu (4.112+)
  backButton: '~BackButton', // UIKit navigation back (Settings → Menu → Today)
  settingsScreen: '~settings-screen',
  logInOutButton: '~log-in-out-button', // read the label only — NEVER tapped by the framework on a personal device
} as const;

export const iosPaywall = {
  screen: '~paywall-screen',
  close: '~paywall-close-button',
} as const;
