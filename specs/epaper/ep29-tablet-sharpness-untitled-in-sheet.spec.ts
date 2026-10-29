/// <reference types="@wdio/globals/types" />
// EP-29 · P1 · Android — Tablet sharpness (untitled in sheet) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-29 Tablet sharpness (untitled in sheet) @p1 @manual @tablet', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-29');
    await startFromNothing(this, 'EP-29');
  });

  it('assisted capture: page 1 at 1×/3× portrait + landscape', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-29: not automated yet — manual');
  });

  after(async function () {
    await owned.cleanup();
  });
});
