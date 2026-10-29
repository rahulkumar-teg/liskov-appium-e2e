/// <reference types="@wdio/globals/types" />
// EP-27 · P1 · Both — PDF internal links open & return (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-27 PDF internal links open & return @p1 @viewer', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-27');
    await startFromNothing(this, 'EP-27');
  });

  it('internal PDF link opens and returns to the same page', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-27: not automated yet — needs the contract-layer link map from a real staging PDF');
  });

  after(async function () {
    await owned.cleanup();
  });
});
