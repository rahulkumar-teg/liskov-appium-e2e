/// <reference types="@wdio/globals/types" />
// EP-23 · P1 · Both — Orientation keeps current page (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-23 Orientation keeps current page @p1 @viewer @rotate', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-23');
    await startFromNothing(this, 'EP-23');
  });

  it('rotation keeps the current page', async function () {
    if (!browser.isIOS && !(await ui.isAndroidTablet())) {
      // MainActivity sets SCREEN_ORIENTATION_PORTRAIT when !isTablet (by design); never call setOrientation on a phone (it also freezes the owner's rotation setting).
      skipCase(this, 'NOT_ON_PLATFORM', 'EP-23: Android phones are portrait-locked by design (MainActivity, !isTablet); rotation applies to tablets only');
    }
    await downloadTo(this, 'EP-23', 'print', owned);
    await ui.openViewer();
    const { of } = await ui.pageIndicator();
    const target = Math.min(4, of);
    await ui.gotoPage(target);
    try {
      const rotErr = await browser.setOrientation('LANDSCAPE').then(
        () => null,
        (e: Error) => e,
      );
      if (rotErr) {
        // iOS app is portrait-locked except fullscreen video (OrientationManager.orientationLock = .portrait; only
        // .force(orientation:) in video views unlocks it) ⇒ XCUIDevice rotation is refused ("Unable To Rotate Device").
        if (browser.isIOS && /unable to rotate/i.test(rotErr.message)) skipCase(this, 'NOT_ON_PLATFORM', 'EP-23: iOS app is portrait-only outside fullscreen video (OrientationManager); the PDF viewer cannot rotate');
        throw rotErr;
      }
      const o = await browser.getOrientation();
      if (o !== 'LANDSCAPE') {
        skipCase(this, 'PRECONDITION', 'EP-23: viewer did not rotate (orientation stays PORTRAIT)');
      }
      await ui.waitPage(target);
      await ui.evidence('EP-23', 'landscape');
    } finally {
      await browser.setOrientation('PORTRAIT').catch(() => undefined);
    }
    await ui.waitPage(target);
    await ui.closeViewer();
  });

  after(async function () {
    await owned.cleanup();
  });
});
