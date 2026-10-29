// t791u: user1 resolves through env: refs (framework .env), op:// entries stay as fallbacks. Dummy values only.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountByKey, accountPool } from '../../config/accounts.js';
import { SecretsBroker, defaultEnvSource, isSecretRef } from '../../src/secrets/SecretsBroker.js';

const DUMMY_EMAIL = 'dummy.user1@example.invalid';
const DUMMY_PASS = 'dummy-pass-not-real-123';
const noOp = async (): Promise<string> => {
  throw new Error('op must not be called for env: refs');
};

describe('unit: accounts env: refs (user1)', () => {
  it('user1 is first for core_digital, refs are env:, op:// fallbacks kept', () => {
    const cd = accountPool.core_digital ?? [];
    assert.equal(cd[0]?.key, 'user1');
    assert.equal(cd[0]?.ref, 'env:USER1_EMAIL');
    assert.equal(cd[0]?.passwordRef, 'env:USER1_PASSWORD');
    assert.ok(cd.slice(1).every((a) => a.ref.startsWith('op://')) && cd.length > 1);
    for (const a of Object.values(accountPool).flat()) assert.ok(isSecretRef(a.ref) && isSecretRef(a.passwordRef), a.ref);
  });
  it('accountByKey finds user1 and its role', () => {
    assert.equal(accountByKey('user1')?.role, 'core_digital');
    assert.equal(accountByKey('nobody'), undefined);
  });
  it('resolves env: refs from process env (dummy) without printing', async () => {
    const b = new SecretsBroker({ op: noOp, env: defaultEnvSource({ USER1_EMAIL: DUMMY_EMAIL, USER1_PASSWORD: DUMMY_PASS }, '/nonexistent/.env') });
    const e = await b.read('env:USER1_EMAIL');
    const p = await b.read('env:USER1_PASSWORD');
    assert.equal(String(e), '***');
    assert.equal(JSON.stringify({ p }), '{"p":"***"}');
    assert.ok(e.occursIn(`Signed in as ${DUMMY_EMAIL.toUpperCase()}`));
    assert.ok(!p.occursIn('something else'));
  });
  it('resolves env: refs from a .env file (dummy)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'acc-env-'));
    const f = path.join(dir, '.env');
    writeFileSync(f, `USER1_EMAIL=${DUMMY_EMAIL}\nUSER1_PASSWORD=${DUMMY_PASS}\n`);
    const b = new SecretsBroker({ op: noOp, env: defaultEnvSource({}, f) });
    assert.ok((await b.read('env:USER1_EMAIL')).occursIn(DUMMY_EMAIL));
    assert.equal((await b.read('env:USER1_PASSWORD')).length, DUMMY_PASS.length);
  });
  it('missing env: value fails without leaking', async () => {
    const b = new SecretsBroker({ op: noOp, env: defaultEnvSource({}, '/nonexistent/.env') });
    await assert.rejects(b.read('env:USER1_EMAIL'), (e: Error) => !e.message.includes(DUMMY_EMAIL));
  });
});
