/// <reference types="@wdio/globals/types" />
// EP-02 · P0 · Both — Download Articles & audio to completion (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-02 Download Articles & audio to completion @p0 @download', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-02');
    await startFromNothing(this, 'EP-02');
  });

  it('Download ▸ Articles & audio reaches AA_DONE with Manage', async function () {
    await downloadTo(this, 'EP-02', 'aa', owned);
    assert.ok(await ui.present(browser.isIOS ? '~edition-download-manage-button' : 'id=manual-download-row'), 'Manage missing');
    await ui.evidence('EP-02', 'aa-done');
  });

  after(async function () {
    await owned.cleanup();
  });
});
