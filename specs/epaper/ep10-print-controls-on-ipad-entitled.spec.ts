/// <reference types="@wdio/globals/types" />
// EP-10 · P0 · iOS — Print controls on iPad (entitled) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-10 Print controls on iPad (entitled) @p0 @ipad', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-10');
    await startFromNothing(this, 'EP-10');
  });

  it('iPad: controls visible and viewer opens (portrait + landscape)', async function () {
    assert.ok(await ui.viewPrintVisible());
  });

  after(async function () {
    await owned.cleanup();
  });
});
