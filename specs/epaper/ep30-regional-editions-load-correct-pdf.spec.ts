/// <reference types="@wdio/globals/types" />
// EP-30 · P1 · Both — Regional editions load correct PDF (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-30 Regional editions load correct PDF @p1 @region', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-30');
    await startFromNothing(this, 'EP-30');
  });

  it('per-region PDFs valid and distinct', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-30: not automated yet — multi-region case — needs REGIONS ≥2 + locale change + staging PDFs');
  });

  after(async function () {
    await owned.cleanup();
  });
});
