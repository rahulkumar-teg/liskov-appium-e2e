/// <reference types="@wdio/globals/types" />
// EP-13 · P0 · Both — View offline without PDF → no-internet alert (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, setOnline, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-13 View offline without PDF → no-internet alert @p0 @offline', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-13');
    await startFromNothing(this, 'EP-13');
  });

  it('offline, no local PDF: View print edition shows no-internet alert, no viewer', async function () {
    await setOnline(false);
    try {
      await ui.openViewer();
      assert.ok(await ui.shown('-ios predicate string:label CONTAINS "no internet connection"', ui.UI_MS) || (await ui.shown('android=new UiSelector().text("There is no internet connection")', 1)), 'no-internet alert');
      assert.equal(await ui.viewerOpen(5000), false, 'viewer must not open offline without a PDF');
    } finally {
      await setOnline(true);
    }
  });

  after(async function () {
    await owned.cleanup();
  });
});
