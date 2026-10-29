// Android tags from android/core/common/.../constant/TestTagConstants.kt (object WeeklyScreen) — plan §4.5.
// 'id=' = resource-id (Compose testTag under testTagsAsResourceId). Every 'id=' here is contract-checked.
export const androidDownload = {
  manualDownloadRow: 'id=manual-download-row', // ONE tag for all states; read content-desc (HeaderState)
  viewPrintEdition: 'id=download-pdf-button', // Android "View print edition" row = download-pdf-button
  optionsSheet: 'id=download-options-sheet',
  optionArticlesAudio: 'id=download-option-articles-audio',
  optionPrint: 'id=download-option-pdf',
  optionDelete: 'id=download-option-delete',
  deleteAlertConfirm: 'id=delete-edition-alert-delete-button',
  deleteAlertCancel: 'id=delete-edition-alert-cancel-button',
  deleteBothConfirm: 'id=delete-edition-and-pdf-alert-delete-button',
  deleteBothCancel: 'id=delete-edition-and-pdf-alert-cancel-button',
  deletePdfAlertBtn: 'id=delete-pdf-alert-button',
  dialogCancelText: 'android=new UiSelector().text("Cancel")',
  noInternetTitle: 'android=new UiSelector().text("There is no internet connection")', // strings.xml error_dialog_title_no_internet
  legacyDownload: 'id=download-edition-button',
  legacyCancel: 'id=cancel-edition-download-button',
  legacyDelete: 'id=delete-edition-button',
  legacyRetry: 'id=retry-edition-download-button',
} as const;

/** Text-matched locators → the strings.xml resource(s) whose value they must equal (contract-checked, value equality). */
export const androidTextResources: Readonly<Partial<Record<keyof typeof androidDownload, readonly string[]>>> = {
  dialogCancelText: ['weekly_download_delete_confirm_action_cancel'], // delete-confirm dialogs, WeeklyViewModel.kt ~l.1001/1083/1130
  noInternetTitle: ['error_dialog_title_no_internet'], // strings.xml l.307, prepareDownloadErrorDialog(NETWORK_OFFLINE)
};

export const androidSettings = {
  loginButton: 'id=login-button',
  // A10 `id=settings-account-row` is NOT in TestTagConstants.kt (Phase 1 finding) — not shipped until a real id is chosen.
} as const;
