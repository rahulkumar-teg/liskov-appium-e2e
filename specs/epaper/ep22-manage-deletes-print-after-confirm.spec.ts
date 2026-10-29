/// <reference types="@wdio/globals/types" />
// EP-22 · P1 · Both — Manage deletes Print after confirm (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-22 Manage deletes Print after confirm @p1 @delete', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-22');
    await startFromNothing(this, 'EP-22');
  });

  it('Manage ▸ Delete Print: Cancel keeps PRINT_DONE, Delete → NOTHING; View print edition still offered', async function () {
    await downloadTo(this, 'EP-22', 'print', owned);
    await ui.deleteVia('manage', false);
    assert.equal(await ui.headerState(), 'PRINT_DONE', 'Cancel must not delete');
    await ui.deleteVia('manage', true);
    assert.equal(await ui.waitState('NOTHING', ui.UI_MS), 'NOTHING');
    owned.created = false;
    assert.ok(await ui.viewPrintVisible(), 'View print edition must still be offered after delete');
  });

  after(async function () {
    await owned.cleanup();
  });
});
