// Condition-based waits only (I7). The only place a timer-based delay is allowed: between polls of a condition.

export interface WaitOptions {
  timeoutMs: number;
  intervalMs?: number;
  description: string;
}

export class WaitTimeoutError extends Error {
  override readonly name = 'WaitTimeoutError';
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls `condition` until it returns a non-undefined/non-false value or the timeout elapses. */
export async function waitFor<T>(condition: () => Promise<T | undefined | false> | T | undefined | false, opts: WaitOptions): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs;
  const interval = opts.intervalMs ?? 500;
  for (;;) {
    const v = await condition();
    if (v !== undefined && v !== false) return v as T;
    if (Date.now() >= deadline) throw new WaitTimeoutError(`timed out after ${opts.timeoutMs} ms waiting for: ${opts.description}`);
    await delay(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
}
