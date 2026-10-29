/// <reference types="@wdio/globals/types" />
// Restore an edition state that THIS framework created in an earlier, interrupted attempt (cleanup blocked).
// Guard: RESTORE_OWN must name the exact state we left behind; anything else is owner data and is left untouched.
import assert from 'node:assert/strict';
import * as ui from '../support/ui.js';

describe('maintenance: restore own download', function () {
  it('returns our own leftover download to NOTHING', async function () {
    const want = process.env['RESTORE_OWN'];
    assert.ok(want, 'RESTORE_OWN not set');
    await ui.openWeekly();
    const s = await ui.headerState();
    if (s !== want) this.skip();
    if (s === 'FAILED') {
      // Our own failed download has no delete path on Android: the row's only action is Retry; retry once, then delete as usual.
      await $('id=manual-download-row').click();
      const r = await ui.waitState(['AA_DONE', 'PRINT_DONE', 'BOTH_DONE', 'FAILED']);
      console.log(`restore-own: retry of our FAILED download ended in ${r}`);
      assert.notEqual(r, 'FAILED', 'retry failed again');
    }
    await ui.cleanupOwn();
    assert.equal(await ui.headerState(), 'NOTHING');
  });
});
