/// <reference types="@wdio/globals/types" />
// EP-15 · P0 · Both — View offline from local storage (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, setOnline, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-15 View offline from local storage @p0 @offline', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-15');
    await startFromNothing(this, 'EP-15');
  });

  it('PRINT_DONE offline: viewer opens from local storage and swipes', async function () {
    await downloadTo(this, 'EP-15', 'print', owned);
    await setOnline(false);
    try {
      await ui.openViewer();
      assert.equal((await ui.pageIndicator(ui.UI_MS)).page, 1);
      await ui.swipePage('next');
      await ui.waitPage(2);
      await ui.closeViewer();
    } finally {
      await setOnline(true);
    }
  });

  after(async function () {
    await owned.cleanup();
  });
});
