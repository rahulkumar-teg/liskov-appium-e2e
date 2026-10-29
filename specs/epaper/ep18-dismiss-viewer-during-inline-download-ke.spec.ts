/// <reference types="@wdio/globals/types" />
// EP-18 · P1 · Both — Dismiss viewer during inline download keeps downloading (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-18 Dismiss viewer during inline download keeps downloading @p1 @viewer', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-18');
    await startFromNothing(this, 'EP-18');
  });

  it('closing the viewer during inline download keeps downloading to PRINT_DONE', async function () {
    await ui.openViewer();
    owned.created = true;
    const prog = await ui.inlineProgressSeen();
    if (!prog) {
      await ui.pageIndicator();
      await ui.closeViewer();
      skipCase(this, 'PRECONDITION', 'EP-18: could not observe inline progress (download too fast; no throttle)');
    }
    await ui.closeViewer();
    const s = await ui.waitState(['DOWNLOADING_PRINT', 'PRINT_DONE'], ui.UI_MS);
    console.log(`EP-18 header after back: ${s}`);
    assert.equal(await ui.waitState(['PRINT_DONE', 'FAILED']), 'PRINT_DONE');
  });

  after(async function () {
    await owned.cleanup();
  });
});
