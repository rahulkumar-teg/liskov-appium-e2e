/// <reference types="@wdio/globals/types" />
// EP-34 · P1 · Both — Zoom text quality (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-34 Zoom text quality @p1 @manual', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-34');
    await startFromNothing(this, 'EP-34');
  });

  it('assisted capture: page 1 at 1×/3× portrait + landscape', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-34: not automated yet — manual');
  });

  after(async function () {
    await owned.cleanup();
  });
});
