// Firebase Remote Config template reader (plan §4.11, D2): READ-ONLY.
// Needs a service account with firebaseremoteconfig.viewer — NOT in mobile-liskov's .env (see implementation notes 10).
// Without it, returns null (FlagResolver falls back to flags.override.json ⊕ repo defaults). Conditional values ⇒ undecidable.
import { createSign } from 'node:crypto';
import { InfraError } from '../core/errors.js';
import { FLAG_KEYS, type FlagKey, type Flags } from '../model/Flags.js';
import type { ApiFlags } from './FlagResolver.js';

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}
type Fetch = typeof globalThis.fetch;

function jwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.remoteconfig', aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
  const s = createSign('RSA-SHA256');
  s.update(`${head}.${claim}`);
  return `${head}.${claim}.${s.sign(sa.private_key, 'base64url')}`;
}

/** Template params → ApiFlags. Exported for unit tests. */
export function templateToFlags(t: { parameters?: Record<string, { defaultValue?: { value?: string }; conditionalValues?: object }> }): ApiFlags {
  const values: Record<string, unknown> = {};
  const undecidable: FlagKey[] = [];
  for (const key of FLAG_KEYS) {
    const p = t.parameters?.[key];
    if (!p) continue;
    if (p.conditionalValues && Object.keys(p.conditionalValues).length) {
      undecidable.push(key);
      continue;
    }
    const raw = p.defaultValue?.value;
    if (raw === undefined) continue;
    values[key] = key === 'download_config' ? (JSON.parse(raw) as unknown) : raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return { values: values as Flags, undecidable };
}

export async function readRemoteConfig(projectId: string, sa: ServiceAccount | null, fetchImpl: Fetch = globalThis.fetch): Promise<ApiFlags | null> {
  if (!sa) return null;
  const tok = await fetchImpl(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt(sa) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (tok.status !== 200) throw new InfraError('FLAG_STALE', `RC token HTTP ${tok.status}`);
  const { access_token } = (await tok.json()) as { access_token: string };
  const r = await fetchImpl(`https://firebaseremoteconfig.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/remoteConfig`, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15_000) });
  if (r.status !== 200) throw new InfraError('FLAG_STALE', `RC template HTTP ${r.status}`);
  return templateToFlags((await r.json()) as Parameters<typeof templateToFlags>[0]);
}
