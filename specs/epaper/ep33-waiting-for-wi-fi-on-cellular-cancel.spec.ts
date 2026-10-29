/// <reference types="@wdio/globals/types" />
// EP-33 · P1 · Both — Waiting for Wi-Fi on cellular (+cancel) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-33 Waiting for Wi-Fi on cellular (+cancel) @p1 @cellular', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-33');
    await startFromNothing(this, 'EP-33');
  });

  it('Wi-Fi-only on cellular → WAITING_WIFI; Cancel → NOTHING', async function () {
    await openMenuEntitled(this, 'EP-33');
    await ui.choose('print');
    owned.created = true;
    assert.equal(await ui.waitState('WAITING_WIFI', ui.UI_MS), 'WAITING_WIFI');
    await ui.cancelDownload();
    assert.equal(await ui.waitState('NOTHING', ui.UI_MS), 'NOTHING');
    owned.created = false;
  });

  after(async function () {
    await owned.cleanup();
  });
});
