// Android PDF viewer / Weekly / paywall tags (TestTagConstants.kt) — plan §4.7. Every 'id=' is contract-checked.
export const androidViewer = {
  back: 'id=pdf-viewer-back-button',
  indicator: 'id=pdf-viewer-page-indicator', // Compose container with no text; its liskov-text child carries "n of N" (read via ui.pageIndicator, verified 29 Oct)
  progress: 'id=pdf-viewer-progress-bar',
  loader: 'id=pdf-viewer-download-progress', // inline download progress (TestTagConstants PdfViewer.DOWNLOAD_PROGRESS)
  cover: 'id=pdf-viewer-download-cover', // cover shown while the PDF downloads inline
  // NB: 'progress' (pdf-viewer-progress-bar) is the page-reading progress (text = page/N fraction), NOT download progress.
  menuToggle: 'id=pdf-viewer-menu-toggle-button',
  menu: 'id=pdf-viewer-menu',
  pager: 'id=pdf-viewer-pager',
} as const;

export const androidPaywall = {
  screen: 'id=paywall-screen',
  close: 'id=paywall-close-button',
} as const;
