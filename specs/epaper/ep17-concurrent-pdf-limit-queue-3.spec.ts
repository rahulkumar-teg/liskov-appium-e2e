/// <reference types="@wdio/globals/types" />
// EP-17 · P1 · Both — Concurrent PDF limit & queue (≥3) (plan §6.2). Generated scaffold + hand-written steps; SKIPs via specs/support/gate.ts.
import { gate, skipCase } from '../support/gate.js';
import { Owned, startFromNothing } from '../support/flows.js';

describe('EP-17 Concurrent PDF limit & queue (≥3) @p1 @serial-account @slow', function () {
  const owned = new Owned();
  before(async function () {
    gate(this, 'EP-17');
    await startFromNothing(this, 'EP-17');
  });

  it('≤N concurrent PDF downloads; all three end PRINT_DONE', async function () {
    skipCase(this, 'GATED_BY_OPEN_QUESTION', 'EP-17: not automated yet — heavy case — runs only with ALLOW_HEAVY=1 + ALLOW_THROTTLE=1 (Browse editions multi-download not automated yet)');
  });

  after(async function () {
    await owned.cleanup();
  });
});
