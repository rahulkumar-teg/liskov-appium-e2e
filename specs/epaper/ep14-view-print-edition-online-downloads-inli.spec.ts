/// <reference types="@wdio/globals/types" />
// EP-14 · P0 · Both — View print edition online downloads inline; shared state (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-14 View print edition online downloads inline; shared state @p0 @viewer', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-14');
    await startFromNothing(this, 'EP-14');
  });

  it('online, nothing downloaded: viewer downloads inline, first page shows, header becomes PRINT_DONE', async function () {
    await ui.openViewer();
    owned.created = true;
    if (await ui.shown(browser.isIOS ? '~paywall-screen' : 'id=paywall-screen', 3000)) {
      await ui.closePaywall();
      owned.created = false;
      skipCase(this, 'PRECONDITION', 'EP-14: paywall shown — account not entitled');
    }
    const sawProgress = await ui.inlineProgressSeen();
    console.log(`EP-14 inline progress observed: ${sawProgress}`);
    const p = await ui.pageIndicator();
    assert.equal(p.page, 1, 'viewer did not open on page 1');
    assert.ok(p.of > 1, 'page count');
    await ui.evidence('EP-14', 'viewer-page1');
    await ui.closeViewer();
    assert.equal(await ui.waitState(['PRINT_DONE', 'FAILED']), 'PRINT_DONE');
  });

  after(async function () {
    await owned.cleanup();
  });
});
