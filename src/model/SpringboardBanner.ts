// Pure parser for a SpringBoard page-source dump (iOS 26 probe 2026-10-29 11:10: the SpringBoard tree IS readable
// via defaultActiveApplication=com.apple.springboard; at rest only the status bar is visible+accessible, everything
// else is visible="false"). A notification banner is reported if either:
//  (a) any element matches a known banner name/type pattern (XCUIElementTypeBanner, ShortLook, NotificationCell, …), or
//  (b) any visible+accessible element sits in the top band OUTSIDE the status bar subtree (wider net for unknown iOS 26 names).
// Returns a short description (no values beyond element type/name/label) or undefined.

const PATTERN = /XCUIElementTypeBanner|ShortLook|NotificationCell|NotificationList|BannerView|notification-banner|SBNotification|LiveActivity/i;

export function springboardBanner(src: string, topBandPt = 250): string | undefined {
  const lines = src.split('\n');
  let statusIndent = -1;
  for (const line of lines) {
    const m = /^(\s*)<(XCUIElementType\w+)\b(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1]!.length;
    const type = m[2]!;
    const attrs = m[3]!;
    if (statusIndent >= 0 && indent <= statusIndent) statusIndent = -1;
    if (type === 'XCUIElementTypeStatusBar') {
      statusIndent = indent;
      continue;
    }
    if (statusIndent >= 0) continue;
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const label = /\blabel="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (PATTERN.test(type) || PATTERN.test(name)) return `${type} name="${name}"`;
    const visible = /\bvisible="true"/.test(attrs);
    const accessible = /\baccessible="true"/.test(attrs);
    const y = Number(/\by="(-?\d+)"/.exec(attrs)?.[1] ?? NaN);
    const h = Number(/\bheight="(\d+)"/.exec(attrs)?.[1] ?? 0);
    if (visible && accessible && Number.isFinite(y) && y < topBandPt && h > 0) return `${type} name="${name}" label="${label.slice(0, 40)}" y=${y}`;
  }
  return undefined;
}
