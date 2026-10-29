// File lock primitive (plan §4.9, §4.18, §4.21): pid + host + TTL, created atomically with fs.open('wx').
// Stale = expiresAt < now, OR same host and pid not alive. Used by DeviceLock, FileLeaseStore and build locks.
import { promises as fs, constants as fsc } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { waitFor, WaitTimeoutError } from './waits.js';

const LockFileSchema = z
  .object({
    name: z.string(),
    owner: z.string(),
    pid: z.number().int().positive(),
    host: z.string(),
    acquiredAt: z.number().int(),
    expiresAt: z.number().int(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type LockFile = z.infer<typeof LockFileSchema>;

export interface LockHandle {
  readonly file: string;
  readonly content: LockFile;
  /** Non-null when this acquisition removed a stale previous holder. */
  readonly takenOverFrom: LockFile | null;
}

export type StaleReason = 'expired' | 'pid-dead' | 'unreadable';

export interface ClockAndProcess {
  now(): number;
  pid: number;
  host: string;
  isPidAlive(pid: number): boolean;
}

export const realEnv: ClockAndProcess = {
  now: () => Date.now(),
  pid: process.pid,
  host: os.hostname(),
  isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      // EPERM = exists but owned by someone else → alive.
      return (e as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
};

function staleReason(lock: LockFile | null, env: ClockAndProcess): StaleReason | null {
  if (lock === null) return 'unreadable';
  if (lock.expiresAt < env.now()) return 'expired';
  if (lock.host === env.host && !env.isPidAlive(lock.pid)) return 'pid-dead';
  return null;
}

export async function readLock(file: string): Promise<LockFile | null> {
  try {
    const parsed = LockFileSchema.safeParse(JSON.parse(await fs.readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw e;
    return null;
  }
}

export interface AcquireOptions {
  owner: string;
  ttlMs: number;
  meta?: Record<string, unknown>;
  env?: ClockAndProcess;
}

/** One non-blocking attempt. Returns null when a live holder exists. */
export async function tryAcquire(file: string, opts: AcquireOptions): Promise<LockHandle | null> {
  const env = opts.env ?? realEnv;
  await fs.mkdir(path.dirname(file), { recursive: true });
  let takenOverFrom: LockFile | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = env.now();
    const content: LockFile = {
      name: path.basename(file, '.json'),
      owner: opts.owner,
      pid: env.pid,
      host: env.host,
      acquiredAt: now,
      expiresAt: now + opts.ttlMs,
      ...(opts.meta ? { meta: opts.meta } : {}),
    };
    try {
      const fh = await fs.open(file, fsc.O_CREAT | fsc.O_EXCL | fsc.O_WRONLY, 0o600);
      try {
        await fh.writeFile(JSON.stringify(content, null, 2));
      } finally {
        await fh.close();
      }
      return { file, content, takenOverFrom };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let existing: LockFile | null;
    try {
      existing = await readLock(file);
    } catch {
      continue; // vanished between open and read → retry create
    }
    if (staleReason(existing, env) === null) return null;
    // Stale: remove only if it is still the same file we judged (compare-and-delete by content).
    const removed = await removeIfUnchanged(file, existing);
    if (removed) takenOverFrom = existing ?? { name: content.name, owner: 'unknown', pid: 1, host: 'unknown', acquiredAt: 0, expiresAt: 0 };
  }
  return null;
}

async function removeIfUnchanged(file: string, judged: LockFile | null): Promise<boolean> {
  try {
    const now = await readLock(file);
    if (JSON.stringify(now) !== JSON.stringify(judged)) return false;
    await fs.unlink(file);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw e;
  }
}

/** Blocking acquire with a bounded, condition-based wait. Throws WaitTimeoutError on timeout. */
export async function acquire(file: string, opts: AcquireOptions & { waitMs: number; pollMs?: number }): Promise<LockHandle> {
  return waitFor(() => tryAcquire(file, opts).then((h) => h ?? undefined), {
    timeoutMs: opts.waitMs,
    intervalMs: opts.pollMs ?? 1000,
    description: `lock ${path.basename(file)}`,
  });
}

/** Extends expiresAt; fails if we no longer own the lock (someone took it over). */
export async function heartbeat(h: LockHandle, ttlMs: number, env: ClockAndProcess = realEnv): Promise<LockHandle> {
  const cur = await readLock(h.file).catch(() => null);
  if (!sameHolder(cur, h.content)) {
    throw new Error(`lock ${h.file} is no longer held by this process`);
  }
  const content = { ...cur, expiresAt: env.now() + ttlMs };
  const tmp = `${h.file}.${env.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(content, null, 2), { mode: 0o600 });
  await fs.rename(tmp, h.file);
  return { ...h, content };
}

/** Identity of a holder: owner + pid + host + acquiredAt (owner matters when one process holds several handles). */
function sameHolder(cur: LockFile | null, mine: LockFile): cur is LockFile {
  return cur !== null && cur.owner === mine.owner && cur.pid === mine.pid && cur.host === mine.host && cur.acquiredAt === mine.acquiredAt;
}

/** Releases only our own lock; never deletes another holder's file. */
export async function release(h: LockHandle): Promise<boolean> {
  const cur = await readLock(h.file).catch(() => null);
  if (!sameHolder(cur, h.content)) return false;
  await fs.unlink(h.file).catch(() => undefined);
  return true;
}

export async function listLocks(dir: string, env: ClockAndProcess = realEnv): Promise<Array<{ file: string; lock: LockFile | null; stale: StaleReason | null }>> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const n of names.sort()) {
    const file = path.join(dir, n);
    const lock = await readLock(file).catch(() => null);
    out.push({ file, lock, stale: staleReason(lock, env) });
  }
  return out;
}

export { WaitTimeoutError };
