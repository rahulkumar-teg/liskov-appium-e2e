/// <reference types="@wdio/globals/types" />
// EP-21 · P1 · Both — Manage deletes A&A after confirm (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-21 Manage deletes A&A after confirm @p1 @delete', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-21');
    await startFromNothing(this, 'EP-21');
  });

  it('Manage ▸ Delete A&A: Cancel keeps AA_DONE, Delete → NOTHING', async function () {
    await downloadTo(this, 'EP-21', 'aa', owned);
    await ui.deleteVia('manage', false);
    assert.equal(await ui.headerState(), 'AA_DONE', 'Cancel must not delete');
    await ui.deleteVia('manage', true);
    assert.equal(await ui.waitState('NOTHING', ui.UI_MS), 'NOTHING');
    owned.created = false;
  });

  after(async function () {
    await owned.cleanup();
  });
});
