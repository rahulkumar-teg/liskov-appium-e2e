// ConfigLoader (plan §4.2). Env (+ the settings keys of .env) → validated, typed config. .env may ALSO hold secret
// values (copied from mobile-liskov); those are never loaded into process.env — only SecretsBroker's env source reads them (§4.25). Paths support a leading "~/".
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { endpoints, type Env, type Endpoints } from '../../config/environments.js';
import { InfraError } from './errors.js';

export const TARGETS = ['ios-real', 'ios-sim', 'android-real', 'android-emu', 'ios-cloud', 'android-cloud'] as const;
export type Target = (typeof TARGETS)[number];

const home = os.homedir();
const expand = (p: string) => (p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p);
const pathStr = (def: string) => z.string().default(def).transform(expand);
const optPath = () => z.string().transform(expand).optional();
// z.coerce.boolean() turns "false" into true, so parse booleans explicitly.
const bool = (def: boolean) => z.enum(['true', 'false']).default(def ? 'true' : 'false').transform((v) => v === 'true');
const ms = (def: number) => z.coerce.number().int().positive().default(def);

export const ConfigBase = z
  .object({
    TARGET: z.enum(TARGETS).optional(), // required for MODE=run; validate reports it when missing
    ENV: z.enum(['stage', 'prod']).default('stage'),
    MODE: z.enum(['run', 'validate']).default('run'),
    DEVICE_ID: z.string().optional(),

    // --- Build under test (D1 + D11) ---
    INSTALL_MODE: z.enum(['none', 'auto']).default('none'),
    APP_COMMIT: z.string().regex(/^[0-9a-f]{7,40}$/i, 'APP_COMMIT must be a git SHA').optional(),
    BUILD_VARIANT: z.enum(['economistDebug', 'economistQaDebug']).default('economistDebug'),
    APP_PATH: optPath(),
    EXPECTED_APP_BUILD: z.string().optional(),
    LISKOV_BUILD_ROOT: pathStr('~/liskov-appium-builds'),
    LISKOV_STATE_DIR: pathStr('~/.liskov-appium'),
    LISKOV_REMOTE_URL: z.string().default('git@github.com:EconomistDigitalSolutions/mobile-liskov.git'),
    ANDROID_LOCAL_PROPERTIES: optPath(),
    /** Read-only mobile-liskov checkout used by the L0 contract layer. No default slot is required. */
    LISKOV_REPO: optPath(),

    APP_BUNDLE_ID: z.string().default('com.economist.lamarr'),
    ANDROID_ACTIVITY: z.string().default('com.economist.liskov.feature.main.MainActivity'),
    IOS_TEAM_ID: z.string().optional(), // WDA signing team: no default; config/wda.local.json (git-ignored) is what the iOS config uses
    IOS_WDA_BUNDLE_ID: z.string().optional(), // no default; see config/wda.local.json (updatedWDABundleId)

    // --- Region (D3) ---
    COUNTRY: z.string().regex(/^[A-Z]{2}$/, 'COUNTRY must be an ISO-3166 alpha-2 code, e.g. DK').default('DK'),
    REGIONS: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) : undefined))
      .pipe(z.array(z.string().regex(/^[A-Z]{2}$/, 'REGIONS entries must be alpha-2 codes')).min(1).optional()),

    // --- Flags (D2, §4.11) ---
    FLAG_SOURCE: z.enum(['auto', 'api', 'manual']).default('auto'),
    FLAGS_OVERRIDE_PATH: pathStr('config/flags.override.json'),
    FLAGS_MAX_AGE_HOURS: z.coerce.number().positive().default(24),
    FLAGS_WARN_AGE_HOURS: z.coerce.number().positive().default(1),
    AMPLITUDE_IDS_PATH: pathStr('config/amplitude-ids.json'),

    // --- Devices ---
    DEVICES_PATH: pathStr('config/devices.yaml'),

    // --- Cloud (Q9 open) ---
    CLOUD_PROVIDER: z.enum(['browserstack', 'sauce']).optional(),
    CLOUD_TUNNEL: bool(false),

    DOWNLOAD_TIMEOUT_MS: ms(180_000),
    FAILED_STATE_TIMEOUT_MS: ms(300_000),
    LOCK_TTL_MS: ms(2 * 60 * 60_000),
    HEARTBEAT_MS: ms(60_000),
    DEVICE_LOCK_WAIT_MS: ms(10 * 60_000),
    ACCOUNT_LEASE_WAIT_MS: ms(10 * 60_000), // v3.1 A3
    ALLOW_NETWORK_TOGGLE: bool(true),
    VALIDATE_RESOLVE_SECRETS: bool(false),
  });

export const ConfigSchema = ConfigBase.superRefine((c, ctx) => {
    const add = (message: string, p: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [p] });
    if (c.MODE === 'run' && !c.TARGET) add('TARGET is required for MODE=run', 'TARGET');
    const isReal = c.TARGET === 'ios-real' || c.TARGET === 'android-real';
    const isVirtual = c.TARGET === 'ios-sim' || c.TARGET === 'android-emu';
    if (isReal && c.INSTALL_MODE === 'none' && (c.APP_PATH || c.APP_COMMIT)) add('INSTALL_MODE=none uses the pre-installed build (D1): unset APP_PATH/APP_COMMIT or set INSTALL_MODE=auto', 'INSTALL_MODE');
    if (isReal && c.INSTALL_MODE === 'auto' && !c.APP_COMMIT) add('INSTALL_MODE=auto needs APP_COMMIT=<sha>', 'APP_COMMIT');
    if (isVirtual && !c.APP_COMMIT && !c.APP_PATH) add('Emulator/simulator runs need APP_COMMIT=<sha> (or APP_PATH to a prebuilt artifact)', 'APP_COMMIT');
    if (c.TARGET?.endsWith('-cloud') && !c.CLOUD_PROVIDER) add('cloud targets need CLOUD_PROVIDER (Q9 open)', 'CLOUD_PROVIDER');
    if (c.FLAGS_WARN_AGE_HOURS > c.FLAGS_MAX_AGE_HOURS) add('FLAGS_WARN_AGE_HOURS must be ≤ FLAGS_MAX_AGE_HOURS', 'FLAGS_WARN_AGE_HOURS');
    if (c.HEARTBEAT_MS * 2 > c.LOCK_TTL_MS) add('HEARTBEAT_MS must be < LOCK_TTL_MS / 2', 'HEARTBEAT_MS');
  });

export type Config = z.output<typeof ConfigSchema> & { endpoints: Endpoints; regions: string[] };

/** Empty strings in .env (e.g. `DEVICE_ID=`) mean "unset". Inline `# comments` are stripped by dotenv already. */
function clean(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== '') out[k] = v.trim();
  return out;
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const r = ConfigSchema.safeParse(clean(env));
  if (!r.success) {
    throw new InfraError('CONFIG', r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  }
  const c = r.data;
  return { ...c, endpoints: endpoints[c.ENV as Env], regions: c.REGIONS ?? [c.COUNTRY] };
}

/** Loads the SETTINGS keys of .env (never secret keys, see dotenv.ts) without overriding real env vars, then parses. */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const { loadSettingsEnv } = await import('./dotenv.js');
  loadSettingsEnv();
  return parseConfig(env);
}
