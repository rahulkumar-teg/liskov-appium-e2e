// .env handling (plan §4.2 + §4.25). The framework .env may contain BOTH framework settings and secret values
// copied from mobile-liskov's .env (Rahul, 2026-10-28). Only SETTINGS keys ever reach process.env, so secret
// values are never inherited by child processes (Appium, WDA, tsx workers) and never appear in env dumps.
// Secret keys are read privately by SecretsBroker's env source (`env:NAME` references).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { ConfigBase } from './ConfigLoader.js';

/** Non-secret keys besides ConfigBase that tooling reads from the environment. */
const EXTRA_SETTINGS_KEYS = [
  'PDF_STAGING_FILES',
  'PDF_STAGING_URLS',
  'PDF_STAGING_CONTENT_IDS',
  'PDF_MIN_PAGES',
  'APPIUM_HOME',
  'APPIUM_PORT',
  'WDA_LOCAL_PORT',
] as const;

export const SETTINGS_KEYS: ReadonlySet<string> = new Set([...Object.keys(ConfigBase.shape), ...EXTRA_SETTINGS_KEYS]);

function dotenvPath(cwd = process.cwd()): string {
  return path.join(cwd, '.env');
}

/** Parsed .env (all keys) or {} when absent. Callers must treat non-settings values as secrets. */
export function readDotenv(file = dotenvPath()): Record<string, string> {
  try {
    return parse(readFileSync(file));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

/** Copy settings keys from .env into env (real env vars win). Returns the names loaded (names only). */
export function loadSettingsEnv(env: NodeJS.ProcessEnv = process.env, file = dotenvPath()): string[] {
  const loaded: string[] = [];
  for (const [k, v] of Object.entries(readDotenv(file))) {
    if (!SETTINGS_KEYS.has(k) || env[k] !== undefined) continue;
    env[k] = v;
    loaded.push(k);
  }
  return loaded;
}
