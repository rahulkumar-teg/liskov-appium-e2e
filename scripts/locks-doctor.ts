// `make locks` / `make locks-purge`: list device locks, account leases and build locks; purge only STALE ones.
import '../src/core/loadSettings.js';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileLeaseStore } from '../src/accounts/FileLeaseStore.js';
import { listLocks } from '../src/core/lock.js';

const stateDir = (process.env['LISKOV_STATE_DIR'] ?? '~/.liskov-appium').replace(/^~(?=\/|$)/, os.homedir());
const purge = process.argv.includes('--purge-stale');
let stale = 0;
for (const kind of ['locks', 'leases', 'build-locks']) {
  const dir = path.join(stateDir, kind);
  const all = await listLocks(dir);
  console.log(`${dir}: ${all.length}`);
  for (const l of all) {
    const who = l.lock ? `${l.lock.owner} pid=${l.lock.pid}@${l.lock.host} expires ${new Date(l.lock.expiresAt).toISOString()}` : 'unreadable';
    console.log(`  ${path.basename(l.file)}  ${l.stale ? `STALE(${l.stale})` : 'live'}  ${who}`);
    if (l.stale) {
      stale++;
      if (purge && kind !== 'leases') {
        await unlink(l.file).catch(() => undefined);
        console.log('    purged');
      }
    }
  }
}
if (purge) {
  // Leases go through FileLeaseStore.sweep() so a stale @serial-account lease leaves its A4 dirty marker.
  const removed = await new FileLeaseStore({ stateDir, ttlMs: 1, waitMs: 1 }).sweep();
  if (removed.length) console.log(`leases purged via sweep(): ${removed.join(', ')}`);
}
if (!purge && stale) console.log(`${stale} stale; run with --purge-stale (live locks are never removed)`);
