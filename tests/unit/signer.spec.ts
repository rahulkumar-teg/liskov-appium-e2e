import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspect } from 'node:util';
import { envSecrets } from '../../config/secrets.js';
import { loadSettingsEnv, SETTINGS_KEYS } from '../../src/core/dotenv.js';
import { editionPdfUrl, signAssetRequest } from '../../src/secrets/AssetSigner.js';
import { SecretsBroker, defaultEnvSource, isEnvRef, isSecretRef } from '../../src/secrets/SecretsBroker.js';
import { SecretString } from '../../src/secrets/SecretString.js';
import { tmpDir } from './_support.js';

const FAKE = 'fake-hmac-key-not-real-0123';

describe('unit: env secret source + AssetSigner (v3.1 addendum)', () => {
  it('signs like the app: base64(HMAC-SHA256(key, path + seconds)), no URL-encoding, no query in path', () => {
    // Vector computed independently with python hmac/hashlib/base64.
    const k = new SecretString('test-key-not-real', 'env:X');
    const h = signAssetRequest('https://stage-mobileapp.economist.com/mobile-assets/epaper/2026_10_24_EU.pdf?x=1', k, 1_761_600_000_999);
    assert.deepEqual(h, { mac: 'SD1gltQoAdNBmxMPj2JP2394ZgGHs7Z9u6iiEO9p9Ww=', timestamp: '1761600000' });
  });
  it("matches the app's own vector (android DownloadRequestSignatureTest.kt l.59-72)", () => {
    const h = signAssetRequest('https://stage-mobileapp.economist.com/mobile-assets/vdaksl7f1cvqoa639qsvelhahuvc0oo9-mobile-images.zip', new SecretString('sample-key', 'env:X'), 1_723_196_516_000);
    assert.deepEqual(h, { mac: 'fiEWwlbgjqQjvhAZ5vW7AWvEvPt9SFtOC1+8GNUfGU8=', timestamp: '1723196516' });
  });
  it('builds edition PDF URLs and rejects malformed content ids', () => {
    assert.equal(editionPdfUrl('https://stage-mobileapp.economist.com/mobile-assets/', '2026_10_24_EU'), 'https://stage-mobileapp.economist.com/mobile-assets/epaper/2026_10_24_EU.pdf');
    assert.throws(() => editionPdfUrl('https://x', '2026-10-24-EU'));
  });
  it('env:NAME syntax; every mapped secret is an env ref', () => {
    assert.ok(isEnvRef('env:STAGE_DOWNLOAD_HMAC_KEY'));
    assert.ok(!isEnvRef('env:lower'));
    assert.ok(isSecretRef('op://V/i/password'));
    for (const e of Object.values(envSecrets)) for (const r of Object.values(e)) assert.ok(isEnvRef(r), r);
  });
  it('broker reads env refs from the injected source, caches, never prints; missing ⇒ SECRETS_LOCKED without value', async () => {
    let calls = 0;
    const b = new SecretsBroker({ env: (n) => (calls++, n === 'STAGE_DOWNLOAD_HMAC_KEY' ? FAKE : undefined), op: async () => assert.fail('op must not run') });
    const s = await b.read('env:STAGE_DOWNLOAD_HMAC_KEY');
    await b.read('env:STAGE_DOWNLOAD_HMAC_KEY');
    assert.equal(calls, 1);
    assert.ok(!inspect(s).includes(FAKE) && !JSON.stringify({ s }).includes(FAKE) && `${s}` === '***');
    const res = await b.check(['env:STAGE_DOWNLOAD_HMAC_KEY', 'env:NOPE']);
    assert.deepEqual(res.map((r) => r.ok), [true, false]);
    assert.ok(!JSON.stringify(res).includes(FAKE));
    await assert.rejects(b.read('env:NOPE'), /INFRA:SECRETS_LOCKED/);
  });
  it('.env: secret keys never reach process.env; settings keys do; real env wins', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const f = path.join(dir, '.env');
      await writeFile(f, `TARGET=ios-real\nCOUNTRY=GB\nSTAGE_DOWNLOAD_HMAC_KEY=${FAKE}\nAIRSHIP_SECRET="${FAKE}"\n`);
      const env: NodeJS.ProcessEnv = { COUNTRY: 'DK' };
      const loaded = loadSettingsEnv(env, f);
      assert.deepEqual(loaded, ['TARGET']);
      assert.equal(env['COUNTRY'], 'DK');
      assert.ok(!Object.values(env).includes(FAKE));
      assert.ok(!SETTINGS_KEYS.has('STAGE_DOWNLOAD_HMAC_KEY'));
      const src = defaultEnvSource({}, f);
      assert.equal(src('STAGE_DOWNLOAD_HMAC_KEY'), FAKE);
      assert.equal(src('AIRSHIP_SECRET'), FAKE);
      assert.equal(defaultEnvSource({ STAGE_DOWNLOAD_HMAC_KEY: 'from-env' }, f)('STAGE_DOWNLOAD_HMAC_KEY'), 'from-env');
    } finally {
      await cleanup();
    }
  });
});
