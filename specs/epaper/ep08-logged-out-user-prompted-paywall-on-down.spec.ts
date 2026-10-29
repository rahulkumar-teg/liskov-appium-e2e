/// <reference types="@wdio/globals/types" />
// EP-08 · P0 · Both — Logged-out user prompted (paywall) on download/view (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-08 Logged-out user prompted (paywall) on download/view @p0 @loggedout', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-08');
  });

  it('logged out: Weekly renders; Download and View print edition show the paywall', async function () {
    await ui.openWeekly();
    assert.equal(await ui.openDownloadMenu(), browser.isIOS ? 'paywall' : 'menu');
    await ui.closePaywall();
    await ui.openViewer();
    assert.ok(await ui.shown(browser.isIOS ? '~paywall-screen' : 'id=paywall-screen', ui.UI_MS), 'paywall expected');
    assert.equal(await ui.viewerOpen(2000), false, 'viewer must not open when logged out');
    await ui.closePaywall();
  });

  after(async function () {
    await owned.cleanup();
  });
});
