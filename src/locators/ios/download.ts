// iOS ids from ios/TheEconomistMobile/Resources/AccessibilityIds.swift (struct EditionDownload) — plan §4.5.
// '~id' = accessibility id. Every '~' id here is contract-checked (tests/contract/locators.contract.spec.ts).
export const iosDownload = {
  downloadEditionButton: '~download-edition-button',
  cancelEditionDownload: '~cancel-edition-download-button',
  deleteEditionButton: '~delete-edition-button',
  editionFailedRetry: '~edition-download-failed-label-with-retry-button',
  optionArticlesAudio: '~edition-download-option-articles-and-audio',
  optionPrint: '~edition-download-option-pdf',
  manageButton: '~edition-download-manage-button',
  manageDownloadPdf: '~edition-download-manage-option-download-pdf',
  manageDownloadAA: '~edition-download-manage-option-download-articles-and-audio',
  manageDelete: '~edition-download-manage-option-delete',
  deleteAllButton: '~edition-download-delete-all-button',
  downloadedLabel: '~edition-downloaded-label',
  viewPrintEdition: '~read-pdf-button', // iOS "View print edition" = read-pdf-button
  pdfDownload: '~download-pdf-button',
  pdfCancel: '~cancel-pdf-download-button',
  pdfFailedRetry: '~pdf-download-failed-label-with-retry-button',
  alertDeleteButton: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Delete"',
  alertCancelButton: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Cancel"',
} as const;

export const iosSettings = {
  logInOutButton: '~log-in-out-button',
  // A10 `~settings-account-row` is NOT in AccessibilityIds.swift (Phase 1 finding) — not shipped until a real id is chosen.
} as const;
