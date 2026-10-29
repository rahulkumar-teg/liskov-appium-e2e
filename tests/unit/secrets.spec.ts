import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { SecretString, redact } from '../../src/secrets/SecretString.js';
import { SecretsBroker, isOpRef } from '../../src/secrets/SecretsBroker.js';
import { typeSecret } from '../../src/secrets/typeSecret.js';

const S = 'hunter2-not-a-real-secret';

describe('unit: SecretString / SecretsBroker / typeSecret (no-log contract, §4.25)', () => {
  const s = new SecretString(S, 'op://V/i/password');
  it('never prints: String, template, JSON, inspect, concatenation', () => {
    assert.equal(String(s), '***');
    assert.equal(`${s}`, '***');
    assert.equal(JSON.stringify({ s }), '{"s":"***"}');
    assert.equal(inspect(s), 'SecretString(op://V/i/password: ***)');
    assert.equal('' + s, '***');
    assert.ok(!inspect({ nested: [s] }).includes(S));
    assert.equal(Object.keys(s).includes('value'), false);
  });
  it('is frozen', () => assert.throws(() => Object.assign(s, { ref: 'x' })));
  it('redact() replaces values in text', () => assert.equal(redact(`login ${S} ok`, [s]), 'login *** ok'));
  it('op:// syntax', () => {
    assert.ok(isOpRef('op://Automation/core-digital-1/password'));
    assert.ok(isOpRef('op://V/item/section/field'));
    assert.ok(!isOpRef('op://V/item'));
    assert.ok(!isOpRef('hunter2'));
  });
  it('broker uses the injected runner, caches, and check() never returns values', async () => {
    let calls = 0;
    const b = new SecretsBroker(async (ref) => {
      calls++;
      if (ref.includes('missing')) throw new Error('item not found');
      return S;
    });
    const a = await b.read('op://V/i/password');
    await b.read('op://V/i/password');
    assert.equal(calls, 1);
    assert.ok(a instanceof SecretString);
    const res = await b.check(['op://V/i/password', 'op://V/missing/password']);
    assert.deepEqual(res.map((r) => r.ok), [true, false]);
    assert.ok(!JSON.stringify(res).includes(S));
    await assert.rejects(b.read('plain-value'), /INFRA:CONFIG/);
    await assert.rejects(new SecretsBroker(async () => '').read('op://V/i/password'), /INFRA:SECRETS_LOCKED/);
  });
  it('typeSecret types the value only inside withLoggingSilenced', async () => {
    const events: string[] = [];
    await typeSecret(
      { setValue: async (v) => events.push(`set ${v === S ? 'SECRET' : 'other'}`) },
      s,
      { withLoggingSilenced: async (fn) => { events.push('silence'); const r = await fn(); events.push('restore'); return r; } },
    );
    assert.deepEqual(events, ['silence', 'set SECRET', 'restore']);
  });
  it('typeSecret rejects a plain string at runtime too', async () => {
    await assert.rejects(typeSecret({ setValue: async () => 0 }, S as unknown as SecretString, { withLoggingSilenced: (fn) => fn() }), TypeError);
  });
});
