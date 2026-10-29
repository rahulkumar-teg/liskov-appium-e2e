// DeviceInstaller (plan §4.22, D11). INSTALL_MODE=none (default): read + record only, never install.
// auto: install only when the artifact sha256 differs from ~/.liskov-appium/installed/<udid>.json.
// Never uninstalls (I9). Error codes: SIGNATURE_MISMATCH, UDID_NOT_PROVISIONED, INSTALL.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { InfraError } from '../core/errors.js';
import type { BuildArtifact } from '../build/ArtifactResolver.js';

export interface InstallMeta {
  udid: string;
  bundleId: string;
  sha: string | null;
  kind: string | null;
  sha256: string | null;
  versionName: string | null;
  build: string | null;
  installedAt: string;
  installMode: 'none' | 'auto';
  by: string;
}
export type Exec = (cmd: string, args: string[], timeoutMs: number) => Promise<{ code: number; stdout: string; stderr: string }>;
const defaultExec: Exec = (cmd, args, timeoutMs) =>
  new Promise((res) => execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 << 20 }, (e, stdout, stderr) => res({ code: e ? ((e as { code?: number }).code ?? 1) : 0, stdout, stderr })));

const dir = () => join(process.env['HOME'] ?? '.', '.liskov-appium', 'installed');
function readMeta(udid: string): InstallMeta | null {
  const f = join(dir(), `${udid}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as InstallMeta) : null;
}
function writeMeta(m: InstallMeta): void {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(join(dir(), `${m.udid}.json`), JSON.stringify(m, null, 2) + '\n');
}

/** Read-only readout of the installed app's version on an iOS device (devicectl). */
async function readIosInstalled(udid: string, bundleId: string, exec: Exec = defaultExec): Promise<{ versionName: string; build: string } | null> {
  const r = await exec('xcrun', ['devicectl', 'device', 'info', 'apps', '--device', udid, '--bundle-id', bundleId], 90_000);
  const m = new RegExp(`${bundleId.replace(/\./g, '\\.')}\\s+(\\S+)\\s+(\\S+)`).exec(r.stdout);
  return m ? { versionName: m[1]!, build: m[2]! } : null;
}

export function needsInstall(meta: InstallMeta | null, art: BuildArtifact, readout: { versionName: string; build: string } | null): boolean {
  if (!meta || !readout) return true;
  if (meta.sha256 !== art.sha256) return true;
  return meta.versionName !== readout.versionName || meta.build !== readout.build; // someone installed by hand
}

export function classifyInstallError(platform: 'ios' | 'android', stderr: string): InfraError {
  if (platform === 'android' && /INSTALL_FAILED_UPDATE_INCOMPATIBLE/.test(stderr)) return new InfraError('SIGNATURE_MISMATCH', 'installed app has a different signature — a human must uninstall/reinstall and set Staging (§4.12)');
  if (platform === 'ios' && /0xe8008012|not included in|provisioning profile/i.test(stderr)) return new InfraError('UDID_NOT_PROVISIONED', 'device not in the provisioning profile (§9.2 b)');
  return new InfraError('INSTALL', stderr.split('\n').slice(-3).join(' ').slice(0, 400));
}

export async function ensureInstalled(o: { platform: 'ios' | 'android'; udid: string; bundleId: string; mode: 'none' | 'auto'; art?: BuildArtifact; runId: string; exec?: Exec }): Promise<InstallMeta> {
  const exec = o.exec ?? defaultExec;
  const readout = o.platform === 'ios' ? await readIosInstalled(o.udid, o.bundleId, exec) : null;
  const base: Omit<InstallMeta, 'sha' | 'kind' | 'sha256'> = { udid: o.udid, bundleId: o.bundleId, versionName: readout?.versionName ?? null, build: readout?.build ?? null, installedAt: new Date().toISOString(), installMode: o.mode, by: o.runId };
  if (o.mode === 'none' || !o.art) {
    if (!readout && o.platform === 'ios') throw new InfraError('APP_NOT_INSTALLED', `${o.bundleId} not installed on ${o.udid}`);
    const m = { ...base, sha: null, kind: null, sha256: null };
    writeMeta(m);
    return m;
  }
  if (!needsInstall(readMeta(o.udid), o.art, readout)) return readMeta(o.udid)!;
  const r = o.platform === 'ios' ? await exec('xcrun', ['devicectl', 'device', 'install', 'app', '--device', o.udid, o.art.path], 600_000) : await exec('adb', ['-s', o.udid, 'install', '-r', '-g', o.art.path], 600_000);
  if (r.code !== 0) throw classifyInstallError(o.platform, r.stderr + r.stdout);
  const after = o.platform === 'ios' ? await readIosInstalled(o.udid, o.bundleId, exec) : null;
  const m = { ...base, versionName: after?.versionName ?? null, build: after?.build ?? null, sha: o.art.sha, kind: o.art.kind, sha256: o.art.sha256 };
  writeMeta(m);
  return m;
}
