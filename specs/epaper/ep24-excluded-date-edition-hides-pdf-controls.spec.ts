/// <reference types="@wdio/globals/types" />
// EP-24 · P1 · Both — Excluded-date edition hides PDF controls (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned } from '../support/flows.js';

describe('EP-24 Excluded-date edition hides PDF controls @p1 @eligibility', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-24');
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-24: excluded-date edition lookup not automated yet (needs flag-resolved min/excluded dates + verified Browse-editions card locators)');
  });

  it('excluded-date edition offers no PDF controls but still A&A', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-24: not automated yet — not reached');
  });

  after(async function () {
    await owned.cleanup();
  });
});
