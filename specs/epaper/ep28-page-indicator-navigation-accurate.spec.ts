/// <reference types="@wdio/globals/types" />
// EP-28 · P1 · Both — Page indicator & navigation accurate (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-28 Page indicator & navigation accurate @p1 @viewer', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-28');
    await startFromNothing(this, 'EP-28');
  });

  it('page indicator: 1 of N, next, middle, last, edges', async function () {
    await downloadTo(this, 'EP-28', 'print', owned);
    await ui.openViewer();
    const p = await ui.pageIndicator();
    assert.equal(p.page, 1);
    assert.ok(p.of >= 2, `page count ${p.of}`);
    await ui.swipePage('next');
    await ui.waitPage(2);
    await ui.gotoPage(Math.ceil(p.of / 2));
    await ui.gotoPage(p.of);
    await ui.swipePage('next');
    await ui.waitPage(p.of);
    await ui.gotoPage(1);
    await ui.swipePage('prev');
    await ui.waitPage(1);
    await ui.evidence('EP-28', 'page1');
    console.log(`EP-28 N=${p.of} (contract-layer page count comparison pending a staging PDF)`);
    await ui.closeViewer();
  });

  after(async function () {
    await owned.cleanup();
  });
});
