import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runValidate } from '../../src/core/ValidateMode.js';
import { SecretsBroker } from '../../src/secrets/SecretsBroker.js';
import { tryAcquire } from '../../src/core/lock.js';
import { fakeEnv, tmpDir } from './_support.js';

const cwd = process.cwd();
const now = new Date('2026-10-28T12:00:00+05:30');
const lvl = (checks: Array<{ area: string; level: string }>, area: string) => checks.filter((c) => c.area === area).map((c) => c.level);

describe('unit: validate mode (§4.24) — no device, no Appium', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ dir, cleanup } = await tmpDir()));
  afterEach(() => cleanup());
  const env = (extra: Record<string, string> = {}) => ({ LISKOV_STATE_DIR: dir, AMPLITUDE_IDS_PATH: path.join(dir, 'none.json'), FLAGS_OVERRIDE_PATH: path.join(dir, 'none.json'), ...extra });

  it('good fixture → exit 0; Phase 2 checks listed as deferred, never ok', async () => {
    const broker = new SecretsBroker({ env: () => undefined, op: async () => assert.fail('no op') });
    const r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', LISKOV_REPO: cwd }), cwd, now, broker });
    assert.equal(r.exitCode, 0, JSON.stringify(r.checks.filter((c) => c.level === 'error')));
    assert.ok(lvl(r.checks, 'phase2').length >= 5 && lvl(r.checks, 'phase2').every((l) => l === 'deferred'));
    assert.deepEqual(lvl(r.checks, 'secrets'), ['ok', 'warn', 'deferred'], 'env secrets absent → warn, not error');
    const withEnv = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml' }), cwd, now, broker: new SecretsBroker({ env: () => 'v4lue-xyz', op: async () => assert.fail('no op') }) });
    assert.deepEqual(lvl(withEnv.checks, 'secrets'), ['ok', 'ok', 'deferred']);
    assert.ok(!JSON.stringify(withEnv.checks).includes('v4lue-xyz'), 'no value in validate output');
    assert.ok(lvl(r.checks, 'amplitude').includes('warn'), 'A1 coverage warning');
  });

  it('missing TARGET, missing devices.yaml → exit 1', async () => {
    const r = await runValidate({ env: env({ DEVICES_PATH: path.join(dir, 'devices.yaml') }), cwd, now });
    assert.equal(r.exitCode, 1);
    assert.ok(r.checks.some((c) => c.level === 'error' && /TARGET is unset/.test(c.message)));
    assert.ok(r.checks.some((c) => c.level === 'error' && /not found/.test(c.message)));
  });

  it('example devices (all pending) → "no registered device" error', async () => {
    const r = await runValidate({ env: env({ TARGET: 'android-real', DEVICES_PATH: 'config/devices.example.yaml' }), cwd, now });
    assert.equal(r.exitCode, 1);
    assert.ok(r.checks.some((c) => c.level === 'error' && /no registered android-real device/.test(c.message)));
  });

  it('bad config value → single config error, exit 1', async () => {
    const r = await runValidate({ env: env({ COUNTRY: 'Denmark' }), cwd, now });
    assert.equal(r.exitCode, 1);
    assert.equal(r.checks[0]?.area, 'config');
  });

  it('stale flags override → error; invalid _overrideWins → error', async () => {
    const f = path.join(dir, 'flags.json');
    await writeFile(f, JSON.stringify({ source: 's', checkedBy: 'c', checkedAt: '2026-10-20T00:00:00Z' }));
    let r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', FLAGS_OVERRIDE_PATH: f }), cwd, now });
    assert.ok(r.checks.some((c) => c.area === 'flags' && c.level === 'error' && /FLAG_STALE/.test(c.message)));
    await writeFile(f, JSON.stringify({ source: 's', checkedBy: 'c', checkedAt: '2026-10-28T06:00:00Z', _overrideWins: ['epaper_pdf_download_enabled'] }));
    r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', FLAGS_OVERRIDE_PATH: f }), cwd, now });
    assert.ok(r.checks.some((c) => c.area === 'flags' && c.level === 'error' && /not declared/.test(c.message)));
  });

  it('malformed op:// env reference → secrets error (value never echoed)', async () => {
    const r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', SOME_TOKEN: 'op://bad' }), cwd, now });
    const s = r.checks.find((c) => c.area === 'secrets' && c.level === 'error');
    assert.ok(s && s.message.includes('SOME_TOKEN') && !s.message.includes('op://bad'));
  });

  it('VALIDATE_RESOLVE_SECRETS=true uses the broker (injected) and reports names only', async () => {
    const broker = new SecretsBroker(async (ref) => (ref.includes('b2b') ? '' : 'v4lue-xyz'));
    const r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', VALIDATE_RESOLVE_SECRETS: 'true' }), cwd, now, broker });
    const s = r.checks.find((c) => c.area === 'secrets' && c.level === 'error');
    assert.ok(s && /b2b-1/.test(s.message) && !JSON.stringify(r.checks).includes('v4lue-xyz'));
  });

  it('stale lock files are reported as warnings', async () => {
    const e = fakeEnv({ now: 0 });
    await mkdir(path.join(dir, 'locks'), { recursive: true });
    await tryAcquire(path.join(dir, 'locks', 'device-x.json'), { owner: 'old', ttlMs: 1, env: e });
    const r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml' }), cwd, now });
    assert.ok(r.checks.some((c) => c.area === 'locks' && c.level === 'warn' && /1 stale/.test(c.message)));
  });

  it('LISKOV_REPO pointing nowhere → error', async () => {
    const r = await runValidate({ env: env({ TARGET: 'ios-real', DEVICES_PATH: 'tests/fixtures/validate/devices.good.yaml', LISKOV_REPO: path.join(dir, 'nope') }), cwd, now });
    assert.ok(r.checks.some((c) => c.area === 'contract' && c.level === 'error'));
  });
});
