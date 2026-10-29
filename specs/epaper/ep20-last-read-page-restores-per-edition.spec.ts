/// <reference types="@wdio/globals/types" />
// EP-20 · P1 · Both — Last-read page restores per edition (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-20 Last-read page restores per edition @p1 @viewer', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-20');
    await startFromNothing(this, 'EP-20');
  });

  it('last-read page restores after relaunch (latest edition)', async function () {
    await downloadTo(this, 'EP-20', 'print', owned);
    await ui.openViewer();
    const { of } = await ui.pageIndicator();
    const target = Math.min(5, of);
    await ui.gotoPage(target);
    await ui.closeViewer();
    await ui.relaunch();
    await ui.openWeekly();
    await ui.openViewer();
    await ui.waitPage(target);
    await ui.evidence('EP-20', 'restored');
    await ui.closeViewer();
    console.log('EP-20 per-edition (E2) half not automated yet — Partial');
  });

  after(async function () {
    await owned.cleanup();
  });
});
