// AccountCoordinator interface (plan §4.9). FileLeaseStore implements it now (local Mac, D14);
// RedisLeaseStore is deferred (docs/FUTURE.md, trigger: a second runner).
import type { Role } from '../../config/accounts.js';

export type { Role };

export interface LeaseOwner {
  runId: string;
  deviceId: string;
}

export interface Lease {
  role: Role;
  accountRef: string;
  owner: string;
  pid: number;
  host: string;
  expiresAt: number;
  serial: boolean;
  /** v3.1 A4: true when this lease replaced a stale holder's file. */
  takenOverFromStale: boolean;
  /** v3.1 A4: serial && takenOverFromStale ⇒ CleanupFlow.deleteAll() must run on the device before any spec. */
  mustCleanBeforeUse: boolean;
  /** internal: lease file path */
  readonly file: string;
  readonly acquiredAt: number;
}

export interface AccountCoordinator {
  /** Throws InfraError INFRA:NO_ACCOUNT after a bounded wait (ACCOUNT_LEASE_WAIT_MS, A3). */
  lease(role: Role, owner: LeaseOwner, opts?: { serial?: boolean }): Promise<Lease>;
  heartbeat(lease: Lease): Promise<Lease>;
  release(lease: Lease): Promise<void>;
  /** A4: clears the serial-account dirty marker once CleanupFlow.deleteAll() succeeded on the device. */
  markClean(lease: Lease): Promise<void>;
  /** Expired / dead-pid leases → removed; names returned for Allure. */
  sweep(): Promise<string[]>;
}

/** Hook the lease store calls so every take/release (and A4 takeover) lands in SQLite (§4.26). */
export interface LeaseEvents {
  onTaken?(lease: Lease, owner: LeaseOwner): void;
  onReleased?(lease: Lease, owner: LeaseOwner | null): void;
}
