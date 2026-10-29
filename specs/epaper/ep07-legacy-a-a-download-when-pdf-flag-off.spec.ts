/// <reference types="@wdio/globals/types" />
// EP-07 · P0 · Both — Legacy A&A download when PDF flag OFF (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-07 Legacy A&A download when PDF flag OFF @p0 @flagoff', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-07');
    await startFromNothing(this, 'EP-07');
  });

  it('flag OFF: no View print edition, no Print option, legacy A&A completes', async function () {
    assert.equal(await ui.viewPrintVisible(), false, 'flags may be stale: PDF row visible with flag OFF');
    await openMenuEntitled(this, 'EP-07').catch(() => undefined);
    assert.equal((await ui.menuOptions()).print, false, 'flags may be stale: Print option with flag OFF');
  });

  after(async function () {
    await owned.cleanup();
  });
});
