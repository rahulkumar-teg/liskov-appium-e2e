/// <reference types="@wdio/globals/types" />
// EP-06 · P0 · Both — E2E journey: A&A coexistence, relaunch, offline View print edition (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, setOnline, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-06 E2E journey: A&A coexistence, relaunch, offline View print edition @p0 @e2e @offline', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-06');
    await startFromNothing(this, 'EP-06');
  });

  it('BOTH_DONE survives relaunch and View print edition opens offline', async function () {
    await downloadTo(this, 'EP-06', 'aa', owned);
    await ui.manageDownloadOther('print');
    assert.equal(await ui.waitState(['BOTH_DONE', 'FAILED']), 'BOTH_DONE');
    await ui.relaunch();
    await ui.openWeekly();
    assert.equal(await ui.headerState(), 'BOTH_DONE');
    await setOnline(false);
    try {
      await ui.openViewer();
      const p = await ui.pageIndicator(ui.UI_MS);
      assert.equal(p.page, 1);
      await ui.closeViewer();
    } finally {
      await setOnline(true);
    }
  });

  after(async function () {
    await owned.cleanup();
  });
});
