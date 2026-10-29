// Popup table contract (no device): the Newsletters post-login page (Rahul 15:42) is matched by its heading and only
// ever dismissed with "Continue"; every row's taps pass SAFE_TAP; account-changing labels are refused by UNSAFE.
import assert from 'node:assert/strict';
import { IOS_POPUPS, POPUPS, __test } from '../../specs/support/popups.js';

const label = (sel: string) => /\("([^"]*)"\)$/.exec(sel)?.[1] ?? /label == "([^"]*)"$/.exec(sel)?.[1] ?? sel;

describe('unit: popups.ts table (safe taps only)', () => {
  it('Android newsletters row: heading marker, Continue-only taps, listed first', () => {
    const r = POPUPS.find((p) => p.name === 'newsletters-onboarding');
    assert.ok(r);
    assert.equal(POPUPS[0]?.name, 'newsletters-onboarding');
    assert.match(r.marker, /text\("Newsletters"\)/);
    assert.ok(!/Editor|Economist for You|Business in Brief/.test(r.marker), 'must not depend on card titles');
    assert.ok(r.tap.length > 0 && r.tap.every((t) => label(t) === 'Continue'));
  });
  it('iOS newsletters row: exact heading + Continue only', () => {
    const r = IOS_POPUPS.find((p) => p.name === 'ios-newsletters-onboarding');
    assert.ok(r);
    assert.match(r.marker, /label == "Newsletters"/);
    assert.deepEqual(r.tap.map(label), ['Continue']);
  });
  it('every tap of every row passes SAFE_TAP and none is UNSAFE', () => {
    for (const p of [...POPUPS, ...IOS_POPUPS]) for (const t of p.tap) {
      assert.ok(__test.SAFE_TAP().test(label(t)), `${p.name}: ${t}`);
      assert.ok(!__test.UNSAFE().test(label(t)) || /^(Don['\u2019]t allow|Close sheet)$/i.test(label(t)), `${p.name}: ${t}`);
    }
  });
  it('UNSAFE refuses newsletter / account controls', () => {
    for (const l of ['Signed up', 'Sign up', 'Remove', 'Jump to', 'Choose section...', 'Subscribe now', 'Log out', 'Upgrade', 'Allow tracking', 'Purchase'])
      assert.ok(__test.UNSAFE().test(l), l);
    assert.ok(!__test.UNSAFE().test('Continue'));
  });
});
