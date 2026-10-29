// Device lock (plan §4.24): ~/.liskov-appium/locks/device-<id>.json via the lock primitive.
import path from 'node:path';
import { InfraError } from './errors.js';
import { acquire, heartbeat, release, type LockHandle, WaitTimeoutError } from './lock.js';

const deviceLockFile = (stateDir: string, deviceId: string) => path.join(stateDir, 'locks', `device-${deviceId}.json`);

export async function lockDevice(stateDir: string, deviceId: string, runId: string, o: { ttlMs: number; waitMs: number }): Promise<LockHandle> {
  try {
    return await acquire(deviceLockFile(stateDir, deviceId), { owner: runId, ttlMs: o.ttlMs, waitMs: o.waitMs, meta: { deviceId } });
  } catch (e) {
    if (e instanceof WaitTimeoutError) throw new InfraError('DEVICE_LOCKED', `device ${deviceId} busy for ${o.waitMs} ms`);
    throw e;
  }
}

export { heartbeat as heartbeatDevice, release as unlockDevice };
