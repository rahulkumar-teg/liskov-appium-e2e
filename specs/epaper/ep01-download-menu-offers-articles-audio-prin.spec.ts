/// <reference types="@wdio/globals/types" />
// EP-01 · P0 · Both — Download menu offers Articles & audio + Print edition (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import assert from 'node:assert/strict';
import { gate } from '../support/gate.js';
import { Owned, openMenuEntitled, startFromNothing } from '../support/flows.js';
import * as ui from '../support/ui.js';

describe('EP-01 Download menu offers Articles & audio + Print edition @p0 @menu', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-01');
    await startFromNothing(this, 'EP-01');
  });

  it('menu offers exactly Articles & audio and Print edition; dismiss leaves NOTHING', async function () {
    await openMenuEntitled(this, 'EP-01');
    const o = await ui.menuOptions();
    await ui.evidence('EP-01', 'menu');
    assert.deepEqual(o, { aa: true, print: true }, 'Download menu options');
    await ui.dismissMenu();
    assert.equal(await ui.headerState(), 'NOTHING');
  });

  after(async function () {
    await owned.cleanup();
  });
});
