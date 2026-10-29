/// <reference types="@wdio/globals/types" />
// EP-03 · P0 · Both — Download Print edition to completion (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate, skipCase } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-03 Download Print edition to completion @p0 @download', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-03');
    await startFromNothing(this, 'EP-03');
  });

  it('Download ▸ Print edition reaches PRINT_DONE with Manage + View print edition', async function () {
    const who = await ui.whoAmI();
    console.log(`EP-03 whoAmI loggedIn=${String(who.loggedIn)} email=${who.email ? 'present (redacted)' : 'n/a'} (${who.source})`);
    if (who.loggedIn === false) skipCase(this, 'PRECONDITION', 'EP-03: device is logged out (bots never log in)');
    await ui.openWeekly();
    await downloadTo(this, 'EP-03', 'print', owned);
    assert.ok(await ui.viewPrintVisible(), '"View print edition" row missing after Print download');
    await ui.evidence('EP-03', 'print-done');
  });

  after(async function () {
    await owned.cleanup();
  });
});
