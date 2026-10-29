/// <reference types="@wdio/globals/types" />
// EP-31 · P1 · Both — Retry failed A&A after reconnect (retry once) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, setOnline, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-31 Retry failed A&A after reconnect (retry once) @p1 @offline @retry', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-31');
    await startFromNothing(this, 'EP-31');
  });

  it('A&A fails offline, Retry once after reconnect → AA_DONE', async function () {
    await openMenuEntitled(this, 'EP-31');
    await ui.choose('aa');
    owned.created = true;
    await setOnline(false);
    try {
      assert.equal(await ui.waitState(['FAILED', 'AA_DONE'], Number(process.env['FAILED_STATE_TIMEOUT_MS'] ?? 300_000)), 'FAILED');
    } finally {
      await setOnline(true);
    }
    await ui.tap(browser.isIOS ? '~edition-download-failed-label-with-retry-button' : 'id=retry-edition-download-button');
    assert.equal(await ui.waitState(['AA_DONE', 'FAILED']), 'AA_DONE', 'single retry did not complete (D6: FAIL, no second tap)');
  });

  after(async function () {
    await owned.cleanup();
  });
});
