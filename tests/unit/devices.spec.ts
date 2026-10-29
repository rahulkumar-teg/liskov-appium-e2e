import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDevices, selectDevices } from '../../src/core/DeviceRegistry.js';
import { tmpDir } from './_support.js';

describe('unit: DeviceRegistry (dedicated-only, §4.21)', () => {
  it('committed example parses; every entry is pending → nothing selectable', async () => {
    const d = await loadDevices('config/devices.example.yaml');
    assert.ok(d.length > 0);
    assert.ok(d.every((x) => x.status === 'pending'));
    for (const t of ['ios-real', 'android-real', 'ios-sim', 'android-emu'] as const) assert.deepEqual(selectDevices(d, t), []);
  });
  it('registered device is selectable by id or udid', async () => {
    const d = await loadDevices('tests/fixtures/validate/devices.good.yaml');
    assert.equal(selectDevices(d, 'ios-real').length, 1);
    assert.equal(selectDevices(d, 'ios-real', '00008150-TESTUDID0000000')[0]?.id, 'test-iphone');
    assert.equal(selectDevices(d, 'ios-real', 'nope').length, 0);
    assert.equal(selectDevices(d, 'android-real').length, 0, 'pending never selected');
  });
  it('v2 dedicated/signedInRole fields are rejected', async () => {
    await assert.rejects(loadDevices('tests/fixtures/validate/devices.legacy.yaml'), /INFRA:CONFIG.*(dedicated|Unrecognized)/);
  });
  it('missing file → INFRA:VALIDATE', async () => assert.rejects(loadDevices('/nonexistent/devices.yaml'), /INFRA:VALIDATE/));
  it('registration rules: udid, registeredAt, envSetBy/At for real; avd for emu; duplicates', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const f = path.join(dir, 'd.yaml');
      const cases: Array<[string, RegExp]> = [
        ['devices:\n  - {id: a, target: ios-real, status: registered, gate: release, registeredAt: "2026-10-28T10:00:00Z", envSetBy: x, envSetAt: "2026-10-28T10:00:00Z"}\n', /udid/],
        ['devices:\n  - {id: a, target: android-real, status: registered, udid: U, gate: release, registeredAt: "2026-10-28T10:00:00Z"}\n', /envSetBy/],
        ['devices:\n  - {id: a, target: android-emu, status: pending, gate: dev-only}\n', /avd/],
        ['devices:\n  - {id: a, target: ios-sim, status: pending, gate: dev-only}\n  - {id: a, target: ios-sim, status: pending, gate: dev-only}\n', /duplicate device id/],
        ['devices:\n  - {id: A_B, target: ios-sim, status: pending, gate: dev-only}\n', /lower-case/],
      ];
      for (const [yaml, re] of cases) {
        await writeFile(f, yaml);
        await assert.rejects(loadDevices(f), re, yaml);
      }
    } finally {
      await cleanup();
    }
  });
});
