import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ClockAndProcess } from '../../src/core/lock.js';

export async function tmpDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'liskov-unit-'));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Controllable clock + pid table for lock/lease tests. */
export function fakeEnv(opts: { now?: number; pid?: number; host?: string; alive?: Set<number> } = {}): ClockAndProcess & { t: number; alive: Set<number> } {
  const e = {
    t: opts.now ?? 1_000_000,
    pid: opts.pid ?? 4242,
    host: opts.host ?? 'test-host',
    alive: opts.alive ?? new Set<number>([opts.pid ?? 4242]),
    now() {
      return e.t;
    },
    isPidAlive(p: number) {
      return e.alive.has(p);
    },
  };
  return e;
}
