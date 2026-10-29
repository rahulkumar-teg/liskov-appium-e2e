/// <reference types="@wdio/globals/types" />
// EP-19 · P1 · Both — Regional PDFs (AP/EU/NA) valid & separate (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-19 Regional PDFs (AP/EU/NA) valid & separate @p1 @region', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-19');
    await startFromNothing(this, 'EP-19');
  });

  it('per-region PDFs valid and distinct', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-19: not automated yet — multi-region case — needs REGIONS ≥2 + locale change + staging PDFs');
  });

  after(async function () {
    await owned.cleanup();
  });
});
