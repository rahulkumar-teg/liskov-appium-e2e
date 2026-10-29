/// <reference types="@wdio/globals/types" />
// EP-16 · P1 · Both — Cancel in-progress download (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate, skipCase } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-16 Cancel in-progress download @p1 @cancel', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-16');
    await startFromNothing(this, 'EP-16');
  });

  // Main case: Articles & audio (long enough to cancel on Wi-Fi). Secondary: Print (often finishes first → may SKIP).
  for (const kind of ['aa', 'print'] as const) {
    it(`${kind === 'aa' ? '[main]' : '[secondary]'} cancel in-progress ${kind} download returns to NOTHING`, async function () {
      await ui.openWeekly();
      assert.equal(await ui.headerState(), 'NOTHING');
      await openMenuEntitled(this, 'EP-16');
      await ui.choose(kind);
      owned.created = true;
      const prog = kind === 'print' ? 'DOWNLOADING_PRINT' : 'DOWNLOADING_AA';
      const s = await ui.waitStateFast([prog, kind === 'print' ? 'PRINT_DONE' : 'AA_DONE'], 15_000, 150);
      if (s !== prog) {
        await owned.cleanup();
        skipCase(this, 'PRECONDITION', 'EP-16: could not observe in-progress (download finished first; no throttle on this target)');
      }
      await ui.cancelDownload(); // Android: tap manual-download-row while DOWNLOADING_* (cancels directly, no confirm)
      console.log(`EP-16 ${kind}: cancelled from ${s}`);
      assert.equal(await ui.waitState('NOTHING', ui.UI_MS), 'NOTHING');
      owned.created = false;
    });
  }

  after(async function () {
    await owned.cleanup();
  });
});
