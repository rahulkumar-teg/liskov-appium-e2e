/// <reference types="@wdio/globals/types" />
// EP-32 · P1 · Both — Retry failed Print download (retry once) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, setOnline, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-32 Retry failed Print download (retry once) @p1 @offline @retry', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-32');
    await startFromNothing(this, 'EP-32');
  });

  it('Print fails offline, Retry once after reconnect → PRINT_DONE', async function () {
    await openMenuEntitled(this, 'EP-32');
    await ui.choose('print');
    owned.created = true;
    await setOnline(false);
    try {
      assert.equal(await ui.waitState(['FAILED', 'PRINT_DONE'], Number(process.env['FAILED_STATE_TIMEOUT_MS'] ?? 300_000)), 'FAILED');
    } finally {
      await setOnline(true);
    }
    await ui.tap(browser.isIOS ? '~pdf-download-failed-label-with-retry-button' : 'id=retry-edition-download-button');
    assert.equal(await ui.waitState(['PRINT_DONE', 'FAILED']), 'PRINT_DONE', 'single retry did not complete (D6: FAIL, no second tap)');
  });

  after(async function () {
    await owned.cleanup();
  });
});
