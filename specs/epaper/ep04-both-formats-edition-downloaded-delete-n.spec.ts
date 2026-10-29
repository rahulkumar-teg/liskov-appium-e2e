/// <reference types="@wdio/globals/types" />
// EP-04 · P0 · Both — Both formats → Edition downloaded + Delete (no Manage) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, downloadTo, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-04 Both formats → Edition downloaded + Delete (no Manage) @p0 @download', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-04');
    await startFromNothing(this, 'EP-04');
  });

  it('A&A then Manage ▸ Download print → BOTH_DONE: Delete shown, Manage absent', async function () {
    await downloadTo(this, 'EP-04', 'aa', owned);
    await ui.manageDownloadOther('print');
    assert.equal(await ui.waitState(['BOTH_DONE', 'FAILED']), 'BOTH_DONE');
    if (browser.isIOS) {
      assert.ok(await ui.present('~edition-download-delete-all-button'), 'Delete missing');
      assert.equal(await ui.present('~edition-download-manage-button'), false, 'Manage must be absent in BOTH_DONE');
    }
    await ui.evidence('EP-04', 'both-done');
  });
  it('variant B: Print then A&A → BOTH_DONE', async function () {
    await owned.cleanup();
    owned.created = false;
    assert.equal(await ui.headerState(), 'NOTHING');
    await downloadTo(this, 'EP-04', 'print', owned);
    await ui.manageDownloadOther('aa');
    assert.equal(await ui.waitState(['BOTH_DONE', 'FAILED']), 'BOTH_DONE');
  });

  after(async function () {
    await owned.cleanup();
  });
});
