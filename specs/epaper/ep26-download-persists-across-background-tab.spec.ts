/// <reference types="@wdio/globals/types" />
// EP-26 · P1 · Both — Download persists across background/tab/relaunch (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-26 Download persists across background/tab/relaunch @p1 @lifecycle', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-26');
    await startFromNothing(this, 'EP-26');
  });

  it('Print download survives background, tab switch and relaunch; never silently NOTHING', async function () {
    await openMenuEntitled(this, 'EP-26');
    await ui.choose('print');
    owned.created = true;
    await browser.execute(browser.isIOS ? 'mobile: backgroundApp' : 'mobile: backgroundApp', { seconds: 10 });
    await ui.openWeekly();
    const a = await ui.headerState();
    assert.ok(['DOWNLOADING_PRINT', 'PRINT_DONE'].includes(a), `after background: ${a}`);
    await ui.relaunch();
    await ui.openWeekly();
    const b = await ui.headerState();
    assert.ok(['DOWNLOADING_PRINT', 'PRINT_DONE'].includes(b), `after relaunch: ${b} (must never be silently NOTHING)`);
    assert.equal(await ui.waitState(['PRINT_DONE', 'FAILED']), 'PRINT_DONE');
  });

  after(async function () {
    await owned.cleanup();
  });
});
