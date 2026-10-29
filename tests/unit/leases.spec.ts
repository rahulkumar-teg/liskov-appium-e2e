import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { AccountRef, Role } from '../../config/accounts.js';
import { FileLeaseStore } from '../../src/accounts/FileLeaseStore.js';
import { tryAcquire } from '../../src/core/lock.js';
import { fakeEnv, tmpDir } from './_support.js';

const pool: Partial<Record<Role, AccountRef[]>> = {
  core_digital: [
    { ref: 'op://V/cd-1/username', passwordRef: 'op://V/cd-1/password' },
    { ref: 'op://V/cd-serial/username', passwordRef: 'op://V/cd-serial/password', serial: true },
  ],
};
const exists = (f: string) => access(f).then(() => true, () => false);

describe('unit: FileLeaseStore (A3 bounded wait, A4 serial takeover)', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ dir, cleanup } = await tmpDir()));
  afterEach(() => cleanup());

  it('leases distinct accounts and reports serial', async () => {
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 100, pollMs: 10, pool });
    const a = await s.lease('core_digital', { runId: 'r', deviceId: 'd1' }, { serial: false });
    const b = await s.lease('core_digital', { runId: 'r', deviceId: 'd2' }, { serial: true });
    assert.equal(a.serial, false);
    assert.equal(b.serial, true);
    assert.equal(b.mustCleanBeforeUse, false);
    assert.notEqual(a.accountRef, b.accountRef);
  });

  it('A3: pool exhausted → INFRA:NO_ACCOUNT after the bounded wait', async () => {
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 120, pollMs: 20, pool });
    await s.lease('core_digital', { runId: 'r', deviceId: 'd1' }, { serial: false });
    const t0 = Date.now();
    await assert.rejects(s.lease('core_digital', { runId: 'r', deviceId: 'd2' }, { serial: false }), (e: Error) => e.message.startsWith('INFRA:NO_ACCOUNT'));
    assert.ok(Date.now() - t0 >= 100);
  });

  it('A3: unconfigured role → INFRA:NO_ACCOUNT immediately; logged_out → INFRA:CONFIG', async () => {
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 10_000, pool });
    await assert.rejects(s.lease('b2b', { runId: 'r', deviceId: 'd' }), /INFRA:NO_ACCOUNT/);
    await assert.rejects(s.lease('logged_out', { runId: 'r', deviceId: 'd' }), /INFRA:CONFIG/);
  });

  it('released account can be leased again', async () => {
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 100, pollMs: 10, pool });
    const a = await s.lease('core_digital', { runId: 'r', deviceId: 'd1' }, { serial: false });
    await s.release(a);
    const b = await s.lease('core_digital', { runId: 'r', deviceId: 'd2' }, { serial: false });
    assert.equal(b.accountRef, a.accountRef);
  });

  it('A4: stale serial lease taken over → takenOverFromStale + mustCleanBeforeUse; marker persists until markClean', async () => {
    const env = fakeEnv({ pid: 1, alive: new Set([1]) });
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 1_000, waitMs: 100, pollMs: 10, pool, env });
    // simulate a crashed holder: lease then let the TTL expire without release
    await s.lease('core_digital', { runId: 'crashed', deviceId: 'd1' }, { serial: true });
    env.t += 10_000;
    const l = await s.lease('core_digital', { runId: 'r2', deviceId: 'd2' }, { serial: true });
    assert.equal(l.takenOverFromStale, true);
    assert.equal(l.mustCleanBeforeUse, true);
    const marker = FileLeaseStore.dirtyMarker(l.file);
    assert.ok(await exists(marker));
    // a crash during cleanup: release without markClean → next taker must still clean
    await s.release(l);
    const l2 = await s.lease('core_digital', { runId: 'r3', deviceId: 'd3' }, { serial: true });
    assert.equal(l2.mustCleanBeforeUse, true, 'dirty marker forces cleanup even without a takeover');
    await s.markClean(l2);
    assert.equal(await exists(marker), false);
    await s.release(l2);
    const l3 = await s.lease('core_digital', { runId: 'r4', deviceId: 'd4' }, { serial: true });
    assert.equal(l3.mustCleanBeforeUse, false);
  });

  it('A4: non-serial takeover is reported but needs no cleanup', async () => {
    const env = fakeEnv({ pid: 1, alive: new Set([1]) });
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 1_000, waitMs: 100, pollMs: 10, pool, env });
    await s.lease('core_digital', { runId: 'crashed', deviceId: 'd1' }, { serial: false });
    env.t += 10_000;
    const l = await s.lease('core_digital', { runId: 'r2', deviceId: 'd2' }, { serial: false });
    assert.equal(l.takenOverFromStale, true);
    assert.equal(l.mustCleanBeforeUse, false);
  });

  it('A4: sweep removes only stale leases and leaves a dirty marker for serial ones', async () => {
    const env = fakeEnv({ pid: 1, alive: new Set([1]) });
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 1_000, waitMs: 100, pollMs: 10, pool, env });
    const serial = await s.lease('core_digital', { runId: 'x', deviceId: 'd1' }, { serial: true });
    env.t += 10_000;
    const live = await s.lease('core_digital', { runId: 'y', deviceId: 'd2' }, { serial: false });
    const removed = await s.sweep();
    assert.deepEqual(removed, [path.basename(serial.file)]);
    assert.ok(await exists(live.file));
    assert.ok(await exists(FileLeaseStore.dirtyMarker(serial.file)));
    const again = await s.lease('core_digital', { runId: 'z', deviceId: 'd3' }, { serial: true });
    assert.equal(again.mustCleanBeforeUse, true);
  });

  it('events hook receives take and release (→ SQLite in Phase 2)', async () => {
    const seen: string[] = [];
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 100, pool, events: { onTaken: (l) => seen.push(`take ${l.accountRef}`), onReleased: (l, o) => seen.push(`rel ${l.accountRef} ${o?.runId}`) } });
    const l = await s.lease('core_digital', { runId: 'r', deviceId: 'd' }, { serial: false });
    await s.release(l);
    assert.deepEqual(seen, ['take op://V/cd-1/username', 'rel op://V/cd-1/username r']);
  });

  it('a foreign live lease file is respected (cross-process)', async () => {
    const s = new FileLeaseStore({ stateDir: dir, ttlMs: 60_000, waitMs: 60, pollMs: 10, pool: { core_digital: [pool.core_digital![0]!] } });
    await tryAcquire(path.join(dir, 'leases', 'core_digital-1.json'), { owner: 'other-run', ttlMs: 60_000 });
    await assert.rejects(s.lease('core_digital', { runId: 'r', deviceId: 'd' }), /INFRA:NO_ACCOUNT/);
  });
});
