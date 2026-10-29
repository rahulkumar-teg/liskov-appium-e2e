// Amplitude Experiment flag reader (plan §4.11, D2): READ-ONLY remote evaluation for one userId.
// GET {api}/v1/vardata?user_id=<sha256(contactId)>  Authorization: Api-Key <deployment key> (client key from .env).
// Never writes, never toggles. The key is a SecretString; only flag keys/values (non-secret) are returned.
import { InfraError } from '../core/errors.js';
import type { SecretString } from '../secrets/SecretString.js';
import type { ApiFlags } from './FlagResolver.js';
import type { FlagKey, Flags } from '../model/Flags.js';

export const AMPLITUDE_FLAG_KEYS: readonly FlagKey[] = ['puwilo_epaper_read_sync_enabled'];

export function experimentHost(zone: string): string {
  return /^eu$/i.test(zone.trim()) ? 'https://api.lab.eu.amplitude.com' : 'https://api.lab.amplitude.com';
}

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

/** Variant "on"/"true"/payload true ⇒ true; "off"/"control"/absent ⇒ false. */
export function variantToBool(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as { key?: unknown; value?: unknown; payload?: unknown };
  if (o.payload === true) return true;
  const k = String(o.value ?? o.key ?? '').toLowerCase();
  return k === 'on' || k === 'true' || k === 'treatment' || k === 'enabled';
}

export async function readAmplitudeFlags(opts: { userId: string | null; deploymentKey: SecretString; zone: string; fetch?: Fetch; timeoutMs?: number }): Promise<ApiFlags> {
  if (!opts.userId) return { values: {}, undecidable: [...AMPLITUDE_FLAG_KEYS] }; // logged out ⇒ cannot decide (§4.11)
  const f = opts.fetch ?? (globalThis.fetch as unknown as Fetch);
  const url = `${experimentHost(opts.zone)}/v1/vardata?user_id=${encodeURIComponent(opts.userId)}`;
  const r = await f(url, { headers: { Authorization: `Api-Key ${opts.deploymentKey.reveal()}` }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (r.status !== 200) throw new InfraError('FLAG_STALE', `Amplitude Experiment vardata HTTP ${r.status}`);
  const body = (await r.json()) as Record<string, unknown>;
  const values: Flags = {};
  for (const k of AMPLITUDE_FLAG_KEYS) (values as Record<string, unknown>)[k] = variantToBool(body[k]);
  return { values, undecidable: [] };
}
