// SecretsBroker (plan §4.25): resolves secret REFERENCES once per run, cached in memory only, never printed.
// Two sources (v3.1 addendum, 2026-10-28):
//   env:NAME   — ACTIVE source. NAME is read from the real environment first, then from the framework .env
//                (copied from mobile-liskov's .env). The .env is parsed privately here; its secret keys are never
//                put into process.env (src/core/dotenv.ts), so child processes do not inherit them.
//   op://…     — 1Password (`op read`). Kept for the automation vault (§9.2); `op` is not installed on the Mac yet.
// Validate checks reference SYNTAX; resolution only with VALIDATE_RESOLVE_SECRETS=1 (env refs: presence only).
import { execFile } from 'node:child_process';
import { InfraError } from '../core/errors.js';
import { readDotenv } from '../core/dotenv.js';
import { SecretString } from './SecretString.js';

const OP_REF = /^op:\/\/[^/\s]+\/[^/\s]+(\/[^/\s]+){1,2}$/;
const ENV_REF = /^env:[A-Z][A-Z0-9_]*$/;

export function isOpRef(s: string): boolean {
  return OP_REF.test(s);
}
export function isEnvRef(s: string): boolean {
  return ENV_REF.test(s);
}
export function isSecretRef(s: string): boolean {
  return isOpRef(s) || isEnvRef(s);
}

export type OpRunner = (ref: string) => Promise<string>;
/** Returns the raw value for an env NAME, or undefined. */
export type EnvSource = (name: string) => string | undefined;

const realOp: OpRunner = (ref) =>
  new Promise((resolve, reject) => {
    execFile('op', ['read', '--no-newline', ref], { timeout: 30_000, maxBuffer: 1 << 20 }, (err, stdout) => {
      // stderr is deliberately discarded: it may echo parts of the request.
      if (err) reject(new InfraError('SECRETS_LOCKED', `op read failed for ${ref} (${(err as NodeJS.ErrnoException).code ?? 'error'}); is 1Password signed in / service-account token set?`));
      else resolve(stdout);
    });
  });

/** process.env first, then the framework .env (read lazily, once). */
export function defaultEnvSource(env: NodeJS.ProcessEnv = process.env, dotenvFile?: string): EnvSource {
  let file: Record<string, string> | undefined;
  return (name) => {
    const v = env[name];
    if (v !== undefined && v !== '') return v;
    file ??= readDotenv(dotenvFile);
    const f = file[name];
    return f === undefined || f === '' ? undefined : f;
  };
}

export interface BrokerOptions {
  op?: OpRunner;
  env?: EnvSource;
}

export class SecretsBroker {
  private readonly cache = new Map<string, SecretString>();
  private readonly op: OpRunner;
  private readonly env: EnvSource;
  /** Back-compatible: `new SecretsBroker(opRunner)` or `new SecretsBroker({ op, env })`. */
  constructor(o: OpRunner | BrokerOptions = {}) {
    const opts = typeof o === 'function' ? { op: o } : o;
    this.op = opts.op ?? realOp;
    this.env = opts.env ?? defaultEnvSource();
  }

  async read(ref: string): Promise<SecretString> {
    const hit = this.cache.get(ref);
    if (hit) return hit;
    let v: string | undefined;
    if (isEnvRef(ref)) {
      v = this.env(ref.slice(4));
      if (!v) throw new InfraError('SECRETS_LOCKED', `${ref} is not set (environment or .env)`);
    } else if (isOpRef(ref)) {
      v = await this.op(ref);
      if (!v) throw new InfraError('SECRETS_LOCKED', `op read returned an empty value for ${ref}`);
    } else {
      throw new InfraError('CONFIG', `not a secret reference (op://… or env:NAME): ${ref.slice(0, 12)}…`);
    }
    const s = new SecretString(v, ref);
    this.cache.set(ref, s);
    return s;
  }

  /** Validate: "resolved"/"missing" per ref, values never returned. */
  async check(refs: string[]): Promise<Array<{ ref: string; ok: boolean; error?: string }>> {
    const out = [];
    for (const ref of refs) {
      try {
        await this.read(ref);
        out.push({ ref, ok: true });
      } catch (e) {
        out.push({ ref, ok: false, error: (e as Error).message });
      }
    }
    return out;
  }

  /** All values read so far, for log redaction (redact()). */
  known(): SecretString[] {
    return [...this.cache.values()];
  }

  /** For `--log-filters`-style redaction: value list never leaves this module except into the redaction hook. */
  redactionValues(): string[] {
    return this.known().map((s) => s.reveal());
  }
}
