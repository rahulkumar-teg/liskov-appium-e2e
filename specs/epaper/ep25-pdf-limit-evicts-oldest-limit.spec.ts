/// <reference types="@wdio/globals/types" />
// EP-25 · P1 · Both — PDF limit evicts oldest (>limit) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-25 PDF limit evicts oldest (>limit) @p1 @serial-account @slow', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-25');
    await startFromNothing(this, 'EP-25');
  });

  it('download limit+1 PDFs evicts the oldest', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-25: not automated yet — heavy case — runs only with ALLOW_HEAVY=1');
  });

  after(async function () {
    await owned.cleanup();
  });
});
