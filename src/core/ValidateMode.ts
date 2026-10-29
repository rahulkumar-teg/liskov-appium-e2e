// Validate mode (plan §4.24, MODE=validate): a dry run with NO Appium session and NO device access.
// Phase 1 checks: config, devices.yaml, regions, flags override (+ staleness, A2), Amplitude ids (A1),
// secret-reference syntax (resolution opt-in), lock/lease files, LISKOV_REPO.
// Phase 2 checks are listed as DEFERRED — never reported as passed.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { accountPool } from '../../config/accounts.js';
import { regionMap } from '../../config/regions.js';
import { InfraError } from './errors.js';
import { parseConfig, type Config, type Target } from './ConfigLoader.js';
import { loadDevices, selectDevices, type Device } from './DeviceRegistry.js';
import { listLocks } from './lock.js';
import { loadOverrideFile, resolveFlags } from '../services/FlagResolver.js';
import { AmplitudeIds } from '../services/AmplitudeIds.js';
import { envSecrets } from '../../config/secrets.js';
import { isOpRef, isSecretRef, SecretsBroker } from '../secrets/SecretsBroker.js';

export type Level = 'ok' | 'warn' | 'error' | 'deferred';
export interface Check {
  area: string;
  level: Level;
  message: string;
}

export const DEFERRED_PHASE2 = [
  'devices connected (devicectl / adb / simctl) — Phase 2; validate never touches a device in Phase 1',
  'account lease dry-take per device — Phase 2 (lease store itself is unit-tested)',
  'stage GraphQL gateway reachability + selected editions PDF (signed GET: `PDF_STAGING_CONTENT_IDS=… make contract`) — Phase 2 in validate',
  'artifact for APP_COMMIT cached/buildable — Phase 2 (ArtifactResolver)',
  'scripts/doctor.sh — run separately with `make doctor`',
  'spec list per device with expected SKIPs — Phase 2 (device specs run via scripts/run/, not via validate)',
];

export interface ValidateOptions {
  env: NodeJS.ProcessEnv;
  cwd: string;
  now?: Date;
  broker?: SecretsBroker;
}

export async function runValidate(o: ValidateOptions): Promise<{ checks: Check[]; exitCode: number; config?: Config }> {
  const checks: Check[] = [];
  const add = (area: string, level: Level, message: string) => checks.push({ area, level, message });
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(o.cwd, p));
  const now = o.now ?? new Date();

  // 1. config
  let cfg: Config;
  try {
    cfg = parseConfig({ ...o.env, MODE: 'validate' });
    add('config', 'ok', `ENV=${cfg.ENV} TARGET=${cfg.TARGET ?? '(unset)'} INSTALL_MODE=${cfg.INSTALL_MODE} COUNTRY=${cfg.COUNTRY} REGIONS=${cfg.regions.join(',')} ACCOUNT_LEASE_WAIT_MS=${cfg.ACCOUNT_LEASE_WAIT_MS}`);
  } catch (e) {
    add('config', 'error', (e as Error).message);
    return finish(checks);
  }
  if (!cfg.TARGET) add('config', 'error', 'TARGET is unset (ios-real | android-real | ios-sim | android-emu | ios-cloud | android-cloud)');

  // 2. regions
  for (const r of cfg.regions) {
    if (regionMap[r]) add('regions', 'ok', `${r} → locale ${regionMap[r]!.locale}, expected edition region ${regionMap[r]!.expectedRegion} [ASSUMPTION until RegionService.verify]`);
    else add('regions', 'error', `${r} not in config/regions.ts`);
  }

  // 3. devices
  let devices: Device[] = [];
  try {
    devices = await loadDevices(abs(cfg.DEVICES_PATH));
    const pending = devices.filter((d) => d.status === 'pending').map((d) => d.id);
    add('devices', 'ok', `${abs(cfg.DEVICES_PATH)}: ${devices.length} entries, ${devices.length - pending.length} registered`);
    if (pending.length) add('devices', 'warn', `pending (not selectable): ${pending.join(', ')}`);
    if (cfg.TARGET) {
      const sel = selectDevices(devices, cfg.TARGET as Target, cfg.DEVICE_ID);
      if (sel.length === 0) add('devices', 'error', `no registered ${cfg.TARGET} device${cfg.DEVICE_ID ? ` matching DEVICE_ID=${cfg.DEVICE_ID}` : ''}`);
      else add('devices', 'ok', `selected: ${sel.map((d) => `${d.id} (${d.gate})`).join(', ')}`);
      const releaseRegistered = devices.filter((d) => d.status === 'registered' && d.gate === 'release').length;
      if (releaseRegistered < 4) add('devices', 'warn', `release gate not reachable: ${releaseRegistered}/4 release devices registered (§7.3)`);
    }
  } catch (e) {
    add('devices', 'error', (e as Error).message);
  }

  // 4. flags (A2 schema + staleness)
  const platform = cfg.TARGET?.startsWith('android') ? 'android' : 'ios';
  try {
    const ov = await loadOverrideFile(abs(cfg.FLAGS_OVERRIDE_PATH));
    const r = resolveFlags({ platform, env: cfg.ENV, override: ov, api: null, now, maxAgeHours: cfg.FLAGS_MAX_AGE_HOURS, warnAgeHours: cfg.FLAGS_WARN_AGE_HOURS });
    const overridden = Object.entries(r.sources).filter(([, s]) => s !== 'default').map(([k]) => k);
    add('flags', 'ok', ov ? `${cfg.FLAGS_OVERRIDE_PATH}: source "${ov.source}", checkedBy ${ov.checkedBy}, ${r.meta.ageHours} h old; overrides: ${overridden.join(', ') || 'none'}; _overrideWins: ${ov._overrideWins.join(', ') || 'none'}` : 'no override file');
    for (const w of r.warnings) add('flags', 'warn', w);
    if (cfg.FLAG_SOURCE !== 'manual') add('flags', 'deferred', `FLAG_SOURCE=${cfg.FLAG_SOURCE}: API readers (Firebase RC REST / Amplitude) are Phase 2 (§9.2 a); manual source used`);
  } catch (e) {
    add('flags', 'error', (e as Error).message);
  }

  // 5. Amplitude ids (A1)
  try {
    const ids = await AmplitudeIds.load(abs(cfg.AMPLITUDE_IDS_PATH));
    const missing = ids.missing();
    if (missing.length) add('amplitude', 'warn', `${missing.length} pool account(s) without an Amplitude userId → their puwilo_* keys are FLAG_AMBIGUOUS (B1): ${missing.join(', ')}`);
    else add('amplitude', 'ok', 'every pool account has an Amplitude userId');
    const unmapped = ids.unmappedDevices();
    if (unmapped.length) add('amplitude', 'warn', `device observation(s) not mapped to a pool account (not used for flags): ${unmapped.join(', ')}`);
  } catch (e) {
    add('amplitude', 'error', (e as Error).message);
  }

  // 6. secret references (syntax; resolution opt-in, values never printed)
  const refs = [...new Set(Object.values(accountPool).flat().flatMap((a) => [a.ref, a.passwordRef]))];
  const envRefs = Object.entries(o.env).filter(([, v]) => typeof v === 'string' && v.startsWith('op://'));
  const bad = [...refs.filter((r) => !isSecretRef(r)), ...envRefs.filter(([, v]) => !isOpRef(v!)).map(([k]) => k)];
  if (bad.length) add('secrets', 'error', `malformed secret references: ${bad.join(', ')}`);
  else add('secrets', 'ok', `${refs.length} account references (env:/op://) + ${envRefs.length} env references are well-formed (not resolved)`);
  // 6b. env:NAME secrets (framework .env / environment): PRESENCE only, values never read into output
  {
    const b = o.broker ?? new SecretsBroker();
    const named = Object.entries(envSecrets[cfg.ENV]);
    const res = await b.check(named.map(([, r]) => r));
    const absent = res.filter((r) => !r.ok).map((r) => r.ref);
    add('secrets', absent.length ? 'warn' : 'ok', absent.length ? `env secrets missing for ENV=${cfg.ENV}: ${absent.join(', ')}` : `env secrets present for ENV=${cfg.ENV}: ${named.map(([k]) => k).join(', ')} (values not shown)`);
  }
  if (cfg.VALIDATE_RESOLVE_SECRETS) {
    const res = await (o.broker ?? new SecretsBroker()).check([...refs, ...envRefs.map(([, v]) => v!)]);
    const missing = res.filter((r) => !r.ok);
    add('secrets', missing.length ? 'error' : 'ok', missing.length ? `unresolved: ${missing.map((m) => m.ref).join(', ')} (INFRA:SECRETS_LOCKED)` : `all ${res.length} references resolved (values not shown)`);
  } else {
    add('secrets', 'deferred', '1Password resolution not attempted (set VALIDATE_RESOLVE_SECRETS=1; needs a signed-in `op` or service-account token)');
  }

  // 7. locks / leases
  for (const kind of ['locks', 'leases'] as const) {
    const dir = path.join(cfg.LISKOV_STATE_DIR, kind);
    const all = await listLocks(dir);
    const stale = all.filter((l) => l.stale);
    add(kind, stale.length ? 'warn' : 'ok', `${dir}: ${all.length} file(s), ${stale.length} stale${stale.length ? ` (${stale.map((s) => path.basename(s.file)).join(', ')}; make locks-purge)` : ''}`);
  }

  // 8. LISKOV_REPO for L0
  if (!cfg.LISKOV_REPO) add('contract', 'warn', 'LISKOV_REPO unset: `make contract` will fail until it points at a read-only mobile-liskov checkout');
  else if (!existsSync(cfg.LISKOV_REPO)) add('contract', 'error', `LISKOV_REPO ${cfg.LISKOV_REPO} does not exist`);
  else add('contract', 'ok', `LISKOV_REPO ${cfg.LISKOV_REPO}`);

  for (const d of DEFERRED_PHASE2) add('phase2', 'deferred', d);
  return { ...finish(checks), config: cfg };
}

function finish(checks: Check[]): { checks: Check[]; exitCode: number } {
  return { checks, exitCode: checks.some((c) => c.level === 'error') ? 1 : 0 };
}

export function formatChecks(checks: Check[]): string {
  const tag: Record<Level, string> = { ok: ' OK  ', warn: 'WARN ', error: 'ERROR', deferred: 'DEFER' };
  return checks.map((c) => `[${tag[c.level]}] ${c.area.padEnd(9)} ${c.message}`).join('\n');
}

export function asInfra(exitCode: number, checks: Check[]): InfraError | null {
  const errs = checks.filter((c) => c.level === 'error');
  return exitCode === 0 ? null : new InfraError('VALIDATE', errs.map((e) => `${e.area}: ${e.message}`).join(' | '));
}
