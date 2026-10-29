/// <reference types="@wdio/globals/types" />
// EP-05 · P0 · Both — Delete both formats (cancel once, then confirm) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-05 Delete both formats (cancel once, then confirm) @p0 @delete', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-05');
    await startFromNothing(this, 'EP-05');
  });

  it('Delete (both): Cancel keeps BOTH_DONE, Delete returns to NOTHING', async function () {
    await downloadTo(this, 'EP-05', 'aa', owned);
    await ui.manageDownloadOther('print');
    assert.equal(await ui.waitState(['BOTH_DONE', 'FAILED']), 'BOTH_DONE');
    await ui.deleteVia('all', false);
    assert.equal(await ui.headerState(), 'BOTH_DONE', 'Cancel must not delete');
    await ui.deleteVia('all', true);
    assert.equal(await ui.waitState('NOTHING', ui.UI_MS), 'NOTHING');
    owned.created = false;
  });

  after(async function () {
    await owned.cleanup();
  });
});
