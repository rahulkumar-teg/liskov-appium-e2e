// FileLeaseStore (plan §4.9): ~/.liskov-appium/leases/<role>-<n>.json, atomic create ('wx'), pid+host+TTL.
// A3: bounded wait ACCOUNT_LEASE_WAIT_MS (default 10 min) then INFRA:NO_ACCOUNT.
// A4: a serial account acquired by replacing a stale file ⇒ takenOverFromStale + mustCleanBeforeUse.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { accountPool, type AccountRef, type Role } from '../../config/accounts.js';
import { InfraError } from '../core/errors.js';
import { heartbeat as hbLock, listLocks, readLock, realEnv, release as releaseLock, tryAcquire, type ClockAndProcess, type LockHandle } from '../core/lock.js';
import { waitFor, WaitTimeoutError } from '../core/waits.js';
import type { AccountCoordinator, Lease, LeaseEvents, LeaseOwner } from './AccountCoordinator.js';

export interface FileLeaseStoreOptions {
  stateDir: string;
  ttlMs: number;
  waitMs: number;
  pollMs?: number;
  pool?: Readonly<Partial<Record<Role, readonly AccountRef[]>>>;
  env?: ClockAndProcess;
  events?: LeaseEvents;
}

export class FileLeaseStore implements AccountCoordinator {
  readonly dir: string;
  private readonly pool: Readonly<Partial<Record<Role, readonly AccountRef[]>>>;
  private readonly env: ClockAndProcess;
  private readonly owners = new Map<string, LeaseOwner>();

  constructor(private readonly o: FileLeaseStoreOptions) {
    this.dir = path.join(o.stateDir, 'leases');
    this.pool = o.pool ?? accountPool;
    this.env = o.env ?? realEnv;
  }

  private candidates(role: Role, serial?: boolean): Array<{ acc: AccountRef; file: string }> {
    const list = this.pool[role] ?? [];
    return list
      .map((acc, i) => ({ acc, file: path.join(this.dir, `${role}-${i + 1}.json`) }))
      .filter((c) => serial === undefined || Boolean(c.acc.serial) === serial);
  }

  async lease(role: Role, owner: LeaseOwner, opts: { serial?: boolean } = {}): Promise<Lease> {
    if (role === 'logged_out') throw new InfraError('CONFIG', 'logged_out needs no account lease');
    const cands = this.candidates(role, opts.serial);
    if (cands.length === 0) throw new InfraError('NO_ACCOUNT', `no ${opts.serial ? 'serial ' : ''}accounts configured for role ${role} (config/accounts.ts)`);
    const ownerStr = `${owner.runId}/${owner.deviceId}`;
    try {
      return await waitFor(
        async () => {
          for (const c of cands) {
            const h = await tryAcquire(c.file, { owner: ownerStr, ttlMs: this.o.ttlMs, env: this.env, meta: { role, accountRef: c.acc.ref, serial: Boolean(c.acc.serial) } });
            if (h) {
              const l = await this.toLease(h, role, c.acc);
              this.owners.set(l.file, owner);
              this.o.events?.onTaken?.(l, owner);
              return l;
            }
          }
          return undefined;
        },
        { timeoutMs: this.o.waitMs, intervalMs: this.o.pollMs ?? 2000, description: `account lease ${role}` },
      );
    } catch (e) {
      if (e instanceof WaitTimeoutError) throw new InfraError('NO_ACCOUNT', `no free ${role} account within ${this.o.waitMs} ms (ACCOUNT_LEASE_WAIT_MS)`);
      throw e;
    }
  }

  /** A4 marker: a serial account whose stale lease was removed (by takeover or sweep) and not yet UI-cleaned. */
  static dirtyMarker(leaseFile: string): string {
    return leaseFile.replace(/\.json$/, '.dirty');
  }

  private async toLease(h: LockHandle, role: Role, acc: AccountRef): Promise<Lease> {
    const serial = Boolean(acc.serial);
    const marker = FileLeaseStore.dirtyMarker(h.file);
    const markerExists = await fs.access(marker).then(() => true, () => false);
    const takenOverFromStale = h.takenOverFrom !== null || (serial && markerExists);
    if (serial && takenOverFromStale && !markerExists) {
      // persist until CleanupFlow succeeds, so a crash during cleanup still forces the next taker to clean
      await fs.writeFile(marker, JSON.stringify({ since: this.env.now(), previous: h.takenOverFrom }, null, 2), { mode: 0o600 });
    }
    return {
      role,
      accountRef: acc.ref,
      owner: h.content.owner,
      pid: h.content.pid,
      host: h.content.host,
      expiresAt: h.content.expiresAt,
      serial,
      takenOverFromStale,
      mustCleanBeforeUse: serial && takenOverFromStale,
      file: h.file,
      acquiredAt: h.content.acquiredAt,
    };
  }

  private handle(l: Lease): LockHandle {
    return {
      file: l.file,
      takenOverFrom: null,
      content: { name: path.basename(l.file, '.json'), owner: l.owner, pid: l.pid, host: l.host, acquiredAt: l.acquiredAt, expiresAt: l.expiresAt },
    };
  }

  async heartbeat(l: Lease): Promise<Lease> {
    const h = await hbLock(this.handle(l), this.o.ttlMs, this.env);
    return { ...l, expiresAt: h.content.expiresAt };
  }

  async release(l: Lease): Promise<void> {
    await releaseLock(this.handle(l));
    this.o.events?.onReleased?.(l, this.owners.get(l.file) ?? null);
    this.owners.delete(l.file);
  }

  /** A4: called by CleanupFlow.deleteAll() (Phase 2) after the UI clean succeeded. */
  async markClean(l: Lease): Promise<void> {
    await fs.unlink(FileLeaseStore.dirtyMarker(l.file)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  async sweep(): Promise<string[]> {
    const removed: string[] = [];
    for (const { file, stale } of await listLocks(this.dir, this.env)) {
      if (!stale) continue;
      const before = await readLock(file).catch(() => null);
      // re-check right before unlinking; never removes a live lease
      const still = await listLocks(this.dir, this.env).then((all) => all.find((x) => x.file === file));
      if (still?.stale && JSON.stringify(await readLock(file).catch(() => null)) === JSON.stringify(before)) {
        if (before?.meta?.['serial'] === true) {
          await fs.writeFile(FileLeaseStore.dirtyMarker(file), JSON.stringify({ since: this.env.now(), previous: before }, null, 2), { mode: 0o600 });
        }
        await fs.unlink(file).catch(() => undefined);
        removed.push(path.basename(file));
      }
    }
    return removed;
  }
}
