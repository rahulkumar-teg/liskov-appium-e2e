import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { parseConfig } from '../../src/core/ConfigLoader.js';

describe('unit: ConfigLoader', () => {
  it('defaults: stage, DK, REGIONS=[COUNTRY], ACCOUNT_LEASE_WAIT_MS 600000 (A3), INSTALL_MODE none', () => {
    const c = parseConfig({ TARGET: 'ios-real' });
    assert.equal(c.ENV, 'stage');
    assert.equal(c.COUNTRY, 'DK');
    assert.deepEqual(c.regions, ['DK']);
    assert.equal(c.ACCOUNT_LEASE_WAIT_MS, 600_000);
    assert.equal(c.INSTALL_MODE, 'none');
    assert.equal(c.VALIDATE_RESOLVE_SECRETS, false);
  });
  it('REGIONS list is normalised', () => assert.deepEqual(parseConfig({ TARGET: 'ios-real', REGIONS: 'dk, us ,GB' }).regions, ['DK', 'US', 'GB']));
  it('empty strings mean unset', () => assert.equal(parseConfig({ TARGET: 'ios-real', DEVICE_ID: '  ', COUNTRY: '' }).COUNTRY, 'DK'));
  it('~ is expanded', () => assert.equal(parseConfig({ TARGET: 'ios-real', LISKOV_REPO: '~/x' }).LISKOV_REPO, path.join(os.homedir(), 'x')));
  it('MODE=run needs TARGET; validate does not', () => {
    assert.throws(() => parseConfig({}), /INFRA:CONFIG.*TARGET is required/);
    assert.equal(parseConfig({ MODE: 'validate' }).TARGET, undefined);
  });
  it('rejects bad values with INFRA:CONFIG', () => {
    assert.throws(() => parseConfig({ TARGET: 'ios-real', COUNTRY: 'Denmark' }), /COUNTRY/);
    assert.throws(() => parseConfig({ TARGET: 'nope' }), /INFRA:CONFIG/);
    assert.throws(() => parseConfig({ TARGET: 'ios-real', VALIDATE_RESOLVE_SECRETS: 'yes' }), /INFRA:CONFIG/);
  });
  it('booleans parse "false" as false', () => assert.equal(parseConfig({ TARGET: 'ios-real', ALLOW_NETWORK_TOGGLE: 'false' }).ALLOW_NETWORK_TOGGLE, false));
  it('D1/D11 install rules', () => {
    assert.throws(() => parseConfig({ TARGET: 'ios-real', APP_COMMIT: 'abc1234' }), /INSTALL_MODE=none/);
    assert.throws(() => parseConfig({ TARGET: 'android-real', INSTALL_MODE: 'auto' }), /APP_COMMIT/);
    assert.throws(() => parseConfig({ TARGET: 'ios-sim' }), /Emulator\/simulator/);
    assert.ok(parseConfig({ TARGET: 'ios-sim', APP_COMMIT: 'abc1234' }));
    assert.throws(() => parseConfig({ TARGET: 'ios-cloud' }), /CLOUD_PROVIDER/);
  });
  it('heartbeat must be < TTL/2; warn age ≤ max age', () => {
    assert.throws(() => parseConfig({ TARGET: 'ios-real', HEARTBEAT_MS: '100', LOCK_TTL_MS: '150' }), /HEARTBEAT_MS/);
    assert.throws(() => parseConfig({ TARGET: 'ios-real', FLAGS_WARN_AGE_HOURS: '30' }), /FLAGS_WARN_AGE_HOURS/);
  });
  it('prod graphql path from ProdEnvironmentProvider.kt', () => assert.equal(parseConfig({ TARGET: 'ios-real', ENV: 'prod' }).endpoints.graphql, 'https://api.economist.com/teg/content/b2c-mobile/cp2-gateway/graphql'));
});
