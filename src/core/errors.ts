// Error taxonomy (plan §4.16). AssertionError (node:assert / chai) = product failure, never retried.

export const INFRA_CODES = {
  CONTRACT: 'run',
  CONFIG: 'run',
  VALIDATE: 'run',
  FLAG_STALE: 'run',
  FLAG_DRIFT: 'run',
  SECRETS_LOCKED: 'run',
  BUILD: 'run',
  BUILD_LOCK_TIMEOUT: 'run',
  UDID_NOT_PROVISIONED: 'device',
  SIGNATURE_MISMATCH: 'device',
  INSTALL: 'device',
  APP_NOT_INSTALLED: 'device',
  WRONG_BUILD: 'device',
  WRONG_ENV: 'device',
  DEVICE_LOCKED: 'device',
  NO_ACCOUNT: 'device',
  SANITY: 'device',
  LOGIN_FORM_CHANGED: 'run',
  LOGIN_CHALLENGE: 'device', // captcha / 2FA / emailed code on the login page: stop, a human must step in
  WRONG_ACCOUNT: 'device', // signed in as someone other than the requested account: stop, never log out
  SESSION: 'case',
  DRIVER_CRASH: 'case',
  APP_CRASH: 'case',
  DEVICE_OFFLINE: 'case',
  NETWORK_RESTORE: 'device',
} as const;

export type InfraCode = keyof typeof INFRA_CODES;
export type InfraScope = (typeof INFRA_CODES)[InfraCode];

export class InfraError extends Error {
  override readonly name = 'InfraError';
  readonly scope: InfraScope;
  constructor(
    readonly code: InfraCode,
    message: string,
    scope?: InfraScope,
  ) {
    super(`INFRA:${code} ${message}`);
    this.scope = scope ?? INFRA_CODES[code];
  }
  /** §4.16 / D6: only case-scope infra errors get the single infra retry. */
  get retryableOnce(): boolean {
    return this.scope === 'case';
  }
}

export const SKIP_REASONS = ['FLAG_AMBIGUOUS', 'FLAG_OFF', 'PRECONDITION', 'NOT_ON_PLATFORM', 'GATED_BY_OPEN_QUESTION', 'WOULD_LOGOUT'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Precondition not met → the spec calls this.skip() with the reason recorded in Allure and SQLite. */
export class SkipError extends Error {
  override readonly name = 'SkipError';
  constructor(
    readonly reason: SkipReason,
    detail: string,
  ) {
    super(`SKIP:${reason} ${detail}`);
  }
}

export function isInfraError(e: unknown): e is InfraError {
  return e instanceof InfraError;
}

/** Retry decision used by the Phase 2 spec wrapper: exactly one retry, only for case-scope InfraError. */
export function shouldRetry(e: unknown, attemptsSoFar: number): boolean {
  return attemptsSoFar === 0 && isInfraError(e) && e.retryableOnce;
}
