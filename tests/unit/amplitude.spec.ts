import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AmplitudeIds, deriveAmplitudeUserId } from '../../src/services/AmplitudeIds.js';
import { tmpDir } from './_support.js';

describe('unit: AmplitudeIds (A1)', () => {
  it('missing file → every pool account missing (no guess)', async () => {
    const a = await AmplitudeIds.load('/nonexistent/amplitude-ids.json');
    assert.equal(a.forAccountRef('op://Automation/core-digital-1/username'), undefined);
    assert.ok(a.missing().length >= 6);
  });
  it('lookup by lease accountRef; <placeholder> counts as missing; committed example parses', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const f = path.join(dir, 'a.json');
      await writeFile(f, JSON.stringify({ _comment: 'x', 'op://Automation/core-digital-1/username': { userId: 'u-123' }, 'op://Automation/b2b-1/username': { userId: '<fill-me>' } }));
      const a = await AmplitudeIds.load(f);
      assert.deepEqual(a.forAccount('core_digital', { accountRef: 'op://Automation/core-digital-1/username' }), { userId: 'u-123' });
      assert.equal(a.forAccountRef('op://Automation/b2b-1/username'), undefined);
      assert.ok(!a.missing().includes('op://Automation/core-digital-1/username'));
      assert.ok(a.missing().includes('op://Automation/b2b-1/username'));
      await AmplitudeIds.load('config/amplitude-ids.example.json');
    } finally {
      await cleanup();
    }
  });
  it('rejects non-op:// keys and string values', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const f = path.join(dir, 'a.json');
      await writeFile(f, JSON.stringify({ 'alice@example.com': { userId: 'u' } }));
      await assert.rejects(AmplitudeIds.load(f), /INFRA:CONFIG.*op:\/\//);
      await writeFile(f, JSON.stringify({ 'op://V/i/username': 'u' }));
      await assert.rejects(AmplitudeIds.load(f), /INFRA:CONFIG/);
    } finally {
      await cleanup();
    }
  });
  it('derives userId like the app: lower-case hex sha256(contactId)', () => {
    // Vector computed independently with python hashlib.
    assert.equal(deriveAmplitudeUserId('0031x00000AbCdEfGH'), 'eeef6e975e5778d29eb07fd94e7fac92af606212bbfb195cae2c9683725db5c9');
  });
  it('_devices: observed ids keyed by registry id; unmapped ones never resolve a pool account', async () => {
    const { dir, cleanup } = await tmpDir();
    try {
      const f = path.join(dir, 'a.json');
      const obs = { amplitudeDeviceId: 'D-1', userId: 'a'.repeat(64), accountRef: null, role: null, observedAt: '2026-10-28T19:30:00+05:30', note: 'role unconfirmed' };
      await writeFile(f, JSON.stringify({ _devices: { 'rahul-iphone17': obs } }));
      const a = await AmplitudeIds.load(f);
      assert.deepEqual(a.forDevice('rahul-iphone17'), obs);
      assert.deepEqual(a.unmappedDevices(), ['rahul-iphone17']);
      assert.ok(a.missing().length >= 6);
      await writeFile(f, JSON.stringify({ _devices: { 'rahul-iphone17': { ...obs, userId: 'not-a-hash' } } }));
      await assert.rejects(AmplitudeIds.load(f), /INFRA:CONFIG.*_devices/);
    } finally {
      await cleanup();
    }
  });
});
