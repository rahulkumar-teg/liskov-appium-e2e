// Parked specs list (specs/support/parked.ts): every parked case exists, reasons are typed skip reasons, the currently
// passing set is never parked, and RUN_PARKED=1 / platform scoping behave. No device.
import assert from 'node:assert/strict';
import { SKIP_REASONS } from '../../src/core/errors.js';
import { CATALOG } from '../../specs/support/catalog.js';
import { PARKED, parked } from '../../specs/support/parked.js';

const ids = (ns: number[]) => ns.map((n) => `EP-${String(n).padStart(2, '0')}`);
const ANDROID_PASSING = ids([1, 2, 3, 4, 5, 11, 12, 14, 16, 18, 20, 21, 22, 26, 28]);
const IOS_PASSING = ANDROID_PASSING.filter((i) => i !== 'EP-16');

describe('unit: parked specs (Rahul 16:38: not running ⇒ explicit skip)', () => {
  it('every parked id is a catalog case with a typed reason and a detail', () => {
    for (const [id, p] of Object.entries(PARKED)) {
      assert.ok(CATALOG[id], `${id} not in catalog`);
      assert.ok((SKIP_REASONS as readonly string[]).includes(p.reason), `${id} reason ${p.reason}`);
      assert.ok(p.detail.length > 10, `${id} has no detail`);
    }
  });
  it('passing sets run; every other case is parked on each platform', () => {
    for (const id of Object.keys(CATALOG)) {
      assert.equal(parked(id, 'android', {}) === null, ANDROID_PASSING.includes(id), `android ${id}`);
      assert.equal(parked(id, 'ios', {}) === null, IOS_PASSING.includes(id), `ios ${id}`);
    }
  });
  it('RUN_PARKED=1 un-parks everything', () => {
    for (const id of Object.keys(PARKED)) assert.equal(parked(id, 'ios', { RUN_PARKED: '1' }), null);
  });
});
