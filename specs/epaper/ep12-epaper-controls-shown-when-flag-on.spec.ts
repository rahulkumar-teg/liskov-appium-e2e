/// <reference types="@wdio/globals/types" />
// EP-12 · P0 · Both — ePaper controls shown when flag ON (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-12 ePaper controls shown when flag ON @p0 @smoke', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-12');
    await startFromNothing(this, 'EP-12');
  });

  it('header shows Download (menu with Print option) and View print edition', async function () {
    assert.ok(await ui.viewPrintVisible(), 'View print edition row missing');
    await openMenuEntitled(this, 'EP-12');
    assert.equal((await ui.menuOptions()).print, true, 'Print option missing');
    await ui.evidence('EP-12', 'controls');
    await ui.dismissMenu();
  });

  after(async function () {
    await owned.cleanup();
  });
});
