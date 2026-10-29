// FlagResolver (plan §4.11): read, never write. Precedence API → flags.override.json → repo defaults.
// Phase 1 implements the pure merge/drift/staleness core and the manual source. The API fetchers
// (Firebase RC REST, Amplitude Experiment) are Phase 2 and are injected as `api`.
import { promises as fs } from 'node:fs';
import { repoDefaults, type Platform } from '../../config/flags.defaults.js';
import { InfraError } from '../core/errors.js';
import { FlagsOverrideFile, FLAG_KEYS, type Flags, type FlagKey, type FlagsOverride } from '../model/Flags.js';

export type FlagSource = 'default' | 'api' | 'override' | 'override-intentional';

export interface ApiFlags {
  /** Unconditional values the API can decide. */
  values: Flags;
  /** Keys whose template has conditionalValues (or Amplitude keys without a userId) → can't be decided. */
  undecidable: FlagKey[];
}

export interface ResolveInput {
  platform: Platform;
  env: 'stage' | 'prod';
  override: FlagsOverride | null;
  api: ApiFlags | null;
  now: Date;
  maxAgeHours: number;
  warnAgeHours: number;
}

export interface ResolvedFlags {
  flags: Flags;
  sources: Partial<Record<FlagKey, FlagSource>>;
  ambiguous: FlagKey[];
  intentional: Array<{ key: FlagKey; api: unknown; override: unknown }>;
  warnings: string[];
  meta: { source?: string; checkedBy?: string; checkedAt?: string; ageHours?: number };
}

function defaultsFor(platform: Platform): Flags {
  const c = repoDefaults.common;
  const p = repoDefaults[platform];
  return { ...c, download_config: { ...p.download_config } };
}

function overrideFor(o: FlagsOverride | null, env: 'stage' | 'prod', platform: Platform): Flags {
  const e = o?.[env];
  if (!e) return {};
  const common = e.common ?? {};
  const plat = e[platform] ?? {};
  return { ...common, ...plat, download_config: { ...(common.download_config ?? {}), ...(plat.download_config ?? {}) } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function resolveFlags(i: ResolveInput): ResolvedFlags {
  const warnings: string[] = [];
  const meta: ResolvedFlags['meta'] = {};
  if (i.override) {
    const ageHours = (i.now.getTime() - new Date(i.override.checkedAt).getTime()) / 3_600_000;
    Object.assign(meta, { source: i.override.source, checkedBy: i.override.checkedBy, checkedAt: i.override.checkedAt, ageHours: Math.round(ageHours * 10) / 10 });
    if (ageHours > i.maxAgeHours) throw new InfraError('FLAG_STALE', `flags.override.json checkedAt ${i.override.checkedAt} is ${ageHours.toFixed(1)} h old (> ${i.maxAgeHours} h)`);
    if (ageHours < -0.1) throw new InfraError('CONFIG', `flags.override.json checkedAt ${i.override.checkedAt} is in the future`);
    if (ageHours > i.warnAgeHours) warnings.push(`flags checked ${ageHours.toFixed(1)} h ago`);
  } else if (!i.api) {
    warnings.push('flags: no override file, assuming repo defaults');
  }

  const defs = defaultsFor(i.platform);
  const ov = overrideFor(i.override, i.env, i.platform);
  const wins = new Set<FlagKey>(i.override?._overrideWins ?? []);
  const flags: Record<string, unknown> = {};
  const sources: Partial<Record<FlagKey, FlagSource>> = {};
  const ambiguous: FlagKey[] = [];
  const intentional: ResolvedFlags['intentional'] = [];
  const drift: string[] = [];

  for (const key of FLAG_KEYS) {
    const isDc = key === 'download_config';
    const ovDeclared = isDc ? Object.keys(ov.download_config ?? {}).length > 0 : ov[key] !== undefined;
    const apiHas = i.api ? (isDc ? i.api.values.download_config !== undefined : i.api.values[key] !== undefined) : false;
    const apiUndecidable = i.api?.undecidable.includes(key) ?? false;

    let value: unknown = isDc ? { ...defs.download_config } : defs[key];
    let src: FlagSource = 'default';
    if (apiHas) {
      value = isDc ? { ...(value as object), ...i.api!.values.download_config } : i.api!.values[key];
      src = 'api';
    }
    if (ovDeclared) {
      const ovVal = isDc ? ov.download_config : ov[key];
      if (apiHas) {
        const apiVal = isDc ? pick(i.api!.values.download_config ?? {}, Object.keys(ov.download_config ?? {})) : i.api!.values[key];
        const ovCmp = isDc ? pick(ov.download_config ?? {}, Object.keys(i.api!.values.download_config ?? {})) : ovVal;
        if (!same(apiVal, ovCmp)) {
          if (wins.has(key)) intentional.push({ key, api: apiVal, override: ovVal });
          else drift.push(`${key} api=${JSON.stringify(apiVal)} override=${JSON.stringify(ovVal)}`);
        }
      }
      value = isDc ? { ...(value as object), ...(ovVal as object) } : ovVal;
      src = wins.has(key) && intentional.some((x) => x.key === key) ? 'override-intentional' : 'override';
    } else if (apiUndecidable) {
      ambiguous.push(key);
    }
    flags[key] = value;
    sources[key] = src;
  }
  if (drift.length) throw new InfraError('FLAG_DRIFT', drift.join('; '));
  return { flags: flags as Flags, sources, ambiguous, intentional, warnings, meta };
}

function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => k in o).sort().map((k) => [k, o[k]]));
}

/** Reads and validates the override file. Missing file ⇒ null (live = repo defaults). Invalid ⇒ INFRA:CONFIG. */
export async function loadOverrideFile(file: string): Promise<FlagsOverride | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new InfraError('CONFIG', `${file}: invalid JSON (${(e as Error).message})`);
  }
  const r = FlagsOverrideFile.safeParse(json);
  if (!r.success) throw new InfraError('CONFIG', `${file}: ${r.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ')}`);
  return r.data;
}
