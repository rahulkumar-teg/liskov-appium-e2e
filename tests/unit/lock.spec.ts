import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { acquire, heartbeat, listLocks, readLock, release, tryAcquire } from '../../src/core/lock.js';
import { fakeEnv, tmpDir } from './_support.js';

describe('unit: lock primitive (pid + TTL)', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ dir, cleanup } = await tmpDir()));
  afterEach(() => cleanup());

  it('first taker wins; a live holder blocks a second taker', async () => {
    const f = path.join(dir, 'd.json');
    const a = fakeEnv({ pid: 1, alive: new Set([1, 2]) });
    const b = { ...fakeEnv({ pid: 2, alive: new Set([1, 2]) }) };
    assert.ok(await tryAcquire(f, { owner: 'A', ttlMs: 10_000, env: a }));
    assert.equal(await tryAcquire(f, { owner: 'B', ttlMs: 10_000, env: b }), null);
  });

  it('expired lock is taken over and reported (takenOverFrom)', async () => {
    const f = path.join(dir, 'd.json');
    const env = fakeEnv({ pid: 1, alive: new Set([1, 2]) });
    await tryAcquire(f, { owner: 'A', ttlMs: 1_000, env });
    env.t += 5_000;
    const h = await tryAcquire(f, { owner: 'B', ttlMs: 1_000, env: { ...env, pid: 2, now: () => env.t } });
    assert.ok(h);
    assert.equal(h.takenOverFrom?.owner, 'A');
  });

  it('dead pid on the same host is stale even before expiry', async () => {
    const f = path.join(dir, 'd.json');
    const env = fakeEnv({ pid: 7, alive: new Set([7]) });
    await tryAcquire(f, { owner: 'A', ttlMs: 60_000, env });
    env.alive.delete(7);
    assert.equal((await listLocks(dir, env))[0]?.stale, 'pid-dead');
    const h = await tryAcquire(f, { owner: 'B', ttlMs: 60_000, env: { ...env, pid: 8, now: () => env.t } });
    assert.equal(h?.takenOverFrom?.pid, 7);
  });

  it('a lock from another host is not judged by local pids (only by TTL)', async () => {
    const f = path.join(dir, 'd.json');
    await tryAcquire(f, { owner: 'remote', ttlMs: 60_000, env: fakeEnv({ host: 'other', pid: 99 }) });
    const local = fakeEnv({ host: 'test-host', pid: 1, alive: new Set([1]) });
    assert.equal(await tryAcquire(f, { owner: 'B', ttlMs: 60_000, env: local }), null);
  });

  it('unreadable lock file is stale', async () => {
    const f = path.join(dir, 'd.json');
    await writeFile(f, '{not json');
    assert.equal((await listLocks(dir, fakeEnv()))[0]?.stale, 'unreadable');
  });

  it('heartbeat extends expiresAt; release removes only the own lock', async () => {
    const f = path.join(dir, 'd.json');
    const env = fakeEnv();
    const h = await tryAcquire(f, { owner: 'A', ttlMs: 1_000, env });
    env.t += 500;
    const h2 = await heartbeat(h!, 1_000, env);
    assert.equal(h2.content.expiresAt, env.t + 1_000);
    assert.equal((await readLock(f))?.expiresAt, env.t + 1_000);
    // someone else's handle must not delete it
    assert.equal(await release({ ...h2, content: { ...h2.content, owner: 'X' } }), false);
    assert.ok(await readLock(f));
    assert.equal(await release(h2), true);
    await assert.rejects(readFile(f), /ENOENT/);
  });

  it('acquire waits (condition-based) and times out with a WaitTimeoutError', async () => {
    const f = path.join(dir, 'd.json');
    await tryAcquire(f, { owner: 'A', ttlMs: 60_000 });
    await assert.rejects(acquire(f, { owner: 'B', ttlMs: 60_000, waitMs: 150, pollMs: 25 }), /timed out|Timeout/i);
    assert.match(await readFile(f, 'utf8'), /"owner": ?"A"/);
  });
});
