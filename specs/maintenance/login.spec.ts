/// <reference types="@wdio/globals/types" />
// Log in through the app's own UI (t791u / t792u): Home ▸ ≡ Menu ▸ Settings ▸ Log in ▸ hosted page ▸ back ▸ popups ▸ whoAmI.
// Run via `npm run login` / `make login` (scripts/login.ts), never as part of a suite. Idempotent; never logs out.
import assert from 'node:assert/strict';
import { loginViaSettings } from '../support/flows.js';

describe('maintenance: login via Settings', function () {
  it('is logged in and entitled as the requested account', async function () {
    const key = process.env['LOGIN_ACCOUNT'] ?? 'user1';
    const r = await loginViaSettings(key);
    console.log(`LOGIN RESULT ${r.result} account=${key} entitled=${r.entitled} popupsAfterLogin=${r.popupsAfterLogin.join(',') || 'none'} screenshot=${r.screenshot}`);
    assert.ok(r.entitled, `${key} is logged in but the Weekly download control opens the paywall (not entitled)`);
  });
});
