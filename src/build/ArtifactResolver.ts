// ArtifactResolver + BuildProvider (plan §4.18, D1/D11). SHA-keyed local cache; the build itself is
// scripts/build-from-commit.sh (framework-owned clone + detached worktree; never a user checkout).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, promises as fs, statSync } from 'node:fs';
import { join } from 'node:path';
import { InfraError } from '../core/errors.js';

export type ArtifactKind = `android-${'economistDebug' | 'economistQaDebug'}` | 'ios-sim' | 'ios-device';
export interface BuildArtifact {
  path: string;
  sha: string;
  kind: ArtifactKind;
  sha256: string;
}
export interface ResolveCfg {
  TARGET?: string;
  INSTALL_MODE: 'none' | 'auto';
  BUILD_VARIANT: 'economistDebug' | 'economistQaDebug';
  APP_COMMIT?: string;
  APP_PATH?: string;
  LISKOV_BUILD_ROOT: string;
}

export function kindFor(cfg: ResolveCfg): ArtifactKind | undefined {
  const real = cfg.TARGET === 'ios-real' || cfg.TARGET === 'android-real';
  if (real && cfg.INSTALL_MODE === 'none') return undefined; // D1: pre-installed build
  if (cfg.TARGET === 'ios-sim') return 'ios-sim';
  if (cfg.TARGET === 'ios-real' || cfg.TARGET === 'ios-cloud') return 'ios-device';
  return `android-${cfg.BUILD_VARIANT}`;
}

export function artifactFile(kind: ArtifactKind): string {
  return kind === 'ios-sim' ? 'ios-sim.app' : kind === 'ios-device' ? 'ios-device.ipa' : `${kind}.apk`;
}

export async function sha256Of(p: string): Promise<string> {
  if (statSync(p).isDirectory()) {
    // .app bundle: hash of sorted relative paths + file hashes
    const h = createHash('sha256');
    const walk = async (d: string, rel = ''): Promise<void> => {
      for (const e of (await fs.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = join(d, e.name);
        if (e.isDirectory()) await walk(full, `${rel}${e.name}/`);
        else {
          h.update(`${rel}${e.name}\0`);
          h.update(await fs.readFile(full));
        }
      }
    };
    await walk(p);
    return h.digest('hex');
  }
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(p).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

export async function cacheLookup(root: string, sha: string, kind: ArtifactKind): Promise<BuildArtifact | undefined> {
  const dir = join(root.replace(/^~/, process.env['HOME'] ?? '~'), 'cache', sha);
  const path = join(dir, artifactFile(kind));
  const meta = join(dir, `${kind}.sha256`);
  if (!existsSync(path)) return undefined;
  const actual = await sha256Of(path);
  if (existsSync(meta) && (await fs.readFile(meta, 'utf8')).trim() !== actual) {
    await fs.rm(path, { recursive: true, force: true }); // corrupt entry → rebuild
    return undefined;
  }
  if (!existsSync(meta)) await fs.writeFile(meta, actual + '\n');
  return { path, sha, kind, sha256: actual };
}

/** Shells out to scripts/build-from-commit.sh (timeout 60 min). Prints nothing secret; last stdout line = artifact path. */
export function buildFromCommit(cfg: ResolveCfg, kind: ArtifactKind, script = 'scripts/build-from-commit.sh', timeoutMs = 3_600_000): Promise<string> {
  const KIND = kind.startsWith('android') ? 'android' : kind;
  return new Promise((res, rej) => {
    const p = spawn('bash', [script], { env: { ...process.env, APP_COMMIT: cfg.APP_COMMIT ?? '', KIND, BUILD_VARIANT: cfg.BUILD_VARIANT, LISKOV_BUILD_ROOT: cfg.LISKOV_BUILD_ROOT }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    const t = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.stdout.on('data', (c: Buffer) => (out += c.toString()));
    p.on('close', (code) => {
      clearTimeout(t);
      const last = out.trim().split('\n').pop() ?? '';
      if (code === 0 && last) res(last);
      else rej(new InfraError('BUILD', `build-from-commit.sh exit ${code}`));
    });
  });
}

export async function resolveArtifact(cfg: ResolveCfg, build = buildFromCommit): Promise<BuildArtifact | undefined> {
  const kind = kindFor(cfg);
  if (!kind) return undefined;
  if (cfg.APP_PATH) return { path: cfg.APP_PATH, sha: 'prebuilt', kind, sha256: await sha256Of(cfg.APP_PATH) };
  if (!cfg.APP_COMMIT) throw new InfraError('CONFIG', `APP_COMMIT required for ${kind}`);
  const hit = await cacheLookup(cfg.LISKOV_BUILD_ROOT, cfg.APP_COMMIT, kind);
  if (hit) return hit;
  const path = await build(cfg, kind);
  return { path, sha: cfg.APP_COMMIT, kind, sha256: await sha256Of(path) };
}
