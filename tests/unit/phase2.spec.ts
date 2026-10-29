import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cacheLookup, kindFor, resolveArtifact } from '../../src/build/ArtifactResolver.js';
import { classifyInstallError, needsInstall } from '../../src/install/DeviceInstaller.js';
import { flakyCases } from '../../src/history/flakes.js';
import { diffForm, snapshotForm } from '../../src/services/loginForm.js';
import { experimentHost, readAmplitudeFlags, variantToBool } from '../../src/services/AmplitudeFlagReader.js';
import { templateToFlags } from '../../src/services/RemoteConfigReader.js';
import { SecretString } from '../../src/secrets/SecretString.js';
import { tmpDir } from './_support.js';

const cfg = { INSTALL_MODE: 'none' as const, BUILD_VARIANT: 'economistDebug' as const, LISKOV_BUILD_ROOT: '/nonexistent' };

describe('unit: Phase 2 (§4.11 readers, §4.18, §4.22, §4.26, §4.27)', () => {
  it('kindFor: real + INSTALL_MODE=none ⇒ no build (D1)', () => {
    assert.equal(kindFor({ ...cfg, TARGET: 'ios-real' }), undefined);
    assert.equal(kindFor({ ...cfg, TARGET: 'ios-real', INSTALL_MODE: 'auto' }), 'ios-device');
    assert.equal(kindFor({ ...cfg, TARGET: 'ios-sim' }), 'ios-sim');
    assert.equal(kindFor({ ...cfg, TARGET: 'android-emu' }), 'android-economistDebug');
  });
  it('cache: hit verifies sha256, corrupt entry is dropped and rebuilt', async () => {
    const t = await tmpDir();
    try {
      const d = path.join(t.dir, 'cache', 'abc1234');
      await (await import('node:fs/promises')).mkdir(d, { recursive: true });
      await writeFile(path.join(d, 'android-economistDebug.apk'), 'apk');
      const hit = await cacheLookup(t.dir, 'abc1234', 'android-economistDebug');
      assert.ok(hit && hit.sha256.length === 64);
      await writeFile(path.join(d, 'android-economistDebug.apk'), 'tampered');
      assert.equal(await cacheLookup(t.dir, 'abc1234', 'android-economistDebug'), undefined);
      let built = 0;
      const art = await resolveArtifact({ ...cfg, TARGET: 'android-emu', APP_COMMIT: 'abc1234', LISKOV_BUILD_ROOT: t.dir }, async () => {
        built++;
        const p = path.join(d, 'android-economistDebug.apk');
        await writeFile(p, 'rebuilt');
        return p;
      });
      assert.equal(built, 1);
      assert.equal(art?.sha, 'abc1234');
    } finally {
      await t.cleanup();
    }
  });
  it('installer: reinstall only on sha256/readout change; error taxonomy', () => {
    const art = { path: 'x', sha: 's', kind: 'ios-device' as const, sha256: 'h1' };
    const meta = { udid: 'u', bundleId: 'b', sha: 's', kind: 'ios-device', sha256: 'h1', versionName: '1', build: '2', installedAt: '', installMode: 'auto' as const, by: 'r' };
    assert.equal(needsInstall(meta, art, { versionName: '1', build: '2' }), false);
    assert.equal(needsInstall(meta, { ...art, sha256: 'h2' }, { versionName: '1', build: '2' }), true);
    assert.equal(needsInstall(meta, art, { versionName: '1', build: '3' }), true);
    assert.equal(classifyInstallError('android', 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: ...]').code, 'SIGNATURE_MISMATCH');
    assert.equal(classifyInstallError('ios', 'error 0xe8008012').code, 'UDID_NOT_PROVISIONED');
    assert.equal(classifyInstallError('ios', 'boom').code, 'INSTALL');
  });
  it('flake report: ≥2 flips in last 10 at the same commit; skips ignored', () => {
    const rows = ['passed', 'failed', 'skipped', 'passed', 'passed'].map((status, i) => ({ case_id: 'EP-03', app_commit: 'c1', started_at: i, status }));
    rows.push(...['passed', 'failed'].map((status, i) => ({ case_id: 'EP-03', app_commit: 'c2', started_at: 10 + i, status })));
    const f = flakyCases(rows);
    assert.equal(f.length, 1);
    assert.deepEqual(f[0]!.statuses, ['passed', 'failed', 'passed', 'passed']);
  });
  it('login guard: snapshot ignores hidden inputs, diff detects a changed field', () => {
    const html = `<form><input type="hidden" name="csrf" value="t"><input type="email" name="email" autocomplete="username"><input type='password' name='password'><button type="submit"><span>Log in</span></button></form>`;
    const s = snapshotForm(html);
    assert.equal(s.length, 3);
    assert.deepEqual(s[2], { tag: 'button', type: 'submit', text: 'Log in' });
    assert.deepEqual(diffForm(s, s), []);
    assert.equal(diffForm(s, snapshotForm(html.replace('name="email"', 'name="user"'))).length, 2);
  });
  it('Amplitude reader: read-only GET, EU host, logged-out ⇒ undecidable', async () => {
    assert.equal(experimentHost('EU'), 'https://api.lab.eu.amplitude.com');
    assert.equal(variantToBool({ key: 'on' }), true);
    assert.equal(variantToBool({ key: 'off' }), false);
    const key = new SecretString('k-secret', 'env:STAGE_AMPLITUDE_API_KEY');
    const none = await readAmplitudeFlags({ userId: null, deploymentKey: key, zone: 'EU' });
    assert.deepEqual(none.undecidable, ['puwilo_epaper_read_sync_enabled']);
    let seen = '';
    const r = await readAmplitudeFlags({
      userId: 'u1', deploymentKey: key, zone: 'EU',
      fetch: async (url, init) => {
        seen = url + ' ' + init.headers['Authorization'];
        return { status: 200, json: async () => ({ puwilo_epaper_read_sync_enabled: { key: 'on' } }) };
      },
    });
    assert.equal(seen, 'https://api.lab.eu.amplitude.com/v1/vardata?user_id=u1 Api-Key k-secret');
    assert.equal(r.values.puwilo_epaper_read_sync_enabled, true);
  });
  it('RC template: conditional ⇒ undecidable, JSON download_config parsed', () => {
    const r = templateToFlags({ parameters: { epaper_pdf_download_enabled: { defaultValue: { value: 'true' }, conditionalValues: { ios: {} } }, download_config: { defaultValue: { value: '{"pdf_download_limit":4}' } }, epaper_pdf_download_min_date: { defaultValue: { value: '2025-08-09' } } } });
    assert.deepEqual(r.undecidable, ['epaper_pdf_download_enabled']);
    assert.deepEqual(r.values.download_config, { pdf_download_limit: 4 });
    assert.equal(r.values.epaper_pdf_download_min_date, '2025-08-09');
  });
});
