// SecretString (plan §4.25): a value that never prints. toString/toJSON/inspect return "***".
// The raw value is reachable only through reveal(), which ESLint allows only in SecretsBroker.ts and typeSecret.ts.
import { inspect } from 'node:util';

declare const secretBrand: unique symbol;

export class SecretString {
  /** Nominal brand: a plain string is not assignable to SecretString (no-log typing contract). */
  declare readonly [secretBrand]: true;
  readonly #value: string;
  readonly ref: string;

  constructor(value: string, ref: string) {
    this.#value = value;
    this.ref = ref;
    Object.freeze(this);
  }
  reveal(): string {
    return this.#value;
  }
  /** Case-insensitive containment check (e.g. "is the signed-in email this account?") without exposing the value. */
  occursIn(text: string): boolean {
    return this.#value.length > 0 && text.toLowerCase().includes(this.#value.toLowerCase());
  }
  get length(): number {
    return this.#value.length;
  }
  toString(): string {
    return '***';
  }
  toJSON(): string {
    return '***';
  }
  [inspect.custom](): string {
    return `SecretString(${this.ref}: ***)`;
  }
  [Symbol.toPrimitive](): string {
    return '***';
  }
}

/** Compile-time guard for APIs that must never receive a secret (loggers, Allure params, error messages). */
export type NotSecret<T> = T extends SecretString ? never : T;

/** Replace every known secret value in a text (logs, stderr) with ***. */
export function redact(text: string, secrets: Iterable<SecretString>): string {
  let out = text;
  for (const s of secrets) {
    const v = s.reveal();
    if (v.length >= 3) out = out.split(v).join('***');
  }
  return out;
}
