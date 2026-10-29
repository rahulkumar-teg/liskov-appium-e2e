/// <reference types="@wdio/globals/types" />
// EP-09 · P0 · Both — PDF controls only for editions ≥ min date (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned } from '../support/flows.js';

describe('EP-09 PDF controls only for editions ≥ min date @p0 @eligibility', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-09');
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-09: Browse-editions date scan not automated yet (needs flag-resolved min/excluded dates + verified Browse-editions card locators)');
  });

  it('E1 (≥ minDate) has PDF controls; E0 (< minDate) has none', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-09: not automated yet — not reached: before() skips until Browse-editions date scan locators are verified');
  });

  after(async function () {
    await owned.cleanup();
  });
});
