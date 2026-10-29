// Read-only access to a mobile-liskov checkout for the L0 contract layer (plan §4.23).
// Only reads files. Never runs git, never writes. Path comes from LISKOV_REPO (no default slot required).
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InfraError } from '../core/errors.js';

export const LISKOV_FILES = {
  stringsXml: 'android/app/src/main/res/values/strings.xml',
  remoteConfigDefaults: 'android/core/config/src/main/res/xml/remote_config_defaults.xml',
  remoteConfigKey: 'android/core/config/src/main/java/com/economist/liskov/core/config/remoteconfig/RemoteConfigKey.kt',
  weeklyEditionCovers: 'android/app/src/main/java/com/economist/liskov/feature/weekly/compose/WeeklyEditionCovers.kt',
  weeklyViewModel: 'android/app/src/main/java/com/economist/liskov/feature/weekly/WeeklyViewModel.kt',
  remoteMobileAssetRepository: 'android/core/data/src/main/java/com/economist/liskov/core/data/mobileasset/RemoteMobileAssetRepository.kt',
  iosInterfacesFeatureFlags: 'ios/Packages/Interfaces/Sources/Interfaces/Configuration/FeatureFlags.swift',
  iosModuleConfigurations: 'ios/TheEconomistMobile/Services/RemoteConfig/ModuleConfigurations.swift',
  iosDownloadConfiguration: 'ios/TheEconomistMobile/Services/RemoteConfig/Configurations/DownloadConfiguration.swift',
  iosAccessibilityIds: 'ios/TheEconomistMobile/Resources/AccessibilityIds.swift',
  androidTestTags: 'android/core/common/src/main/java/com/economist/liskov/core/common/constant/TestTagConstants.kt',
  iosPdfUrlConstructor: 'ios/TheEconomistMobile/Services/Downloads/Edition/EditionPdfURLConstructor.swift',
} as const;
export type LiskovFile = keyof typeof LISKOV_FILES;

export class LiskovRepo {
  private readonly cache = new Map<string, string>();
  private constructor(readonly root: string) {}

  /** Resolves LISKOV_REPO; INFRA:CONTRACT if unset or not a mobile-liskov checkout. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): LiskovRepo {
    const raw = env['LISKOV_REPO']?.trim();
    if (!raw) throw new InfraError('CONTRACT', 'LISKOV_REPO is not set (path to a read-only mobile-liskov checkout, e.g. ~/Documents/mobile-liskov)');
    const root = path.resolve(raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new InfraError('CONTRACT', `LISKOV_REPO ${root} is not a directory`);
    const repo = new LiskovRepo(root);
    const missing = Object.values(LISKOV_FILES).filter((f) => !existsSync(path.join(root, f)));
    if (missing.length) throw new InfraError('CONTRACT', `LISKOV_REPO ${root} is missing contract sources: ${missing.join(', ')}`);
    return repo;
  }

  read(f: LiskovFile): string {
    const rel = LISKOV_FILES[f];
    let v = this.cache.get(rel);
    if (v === undefined) {
      v = readFileSync(path.join(this.root, rel), 'utf8');
      this.cache.set(rel, v);
    }
    return v;
  }

  /** 1-based line number of the first match, for citations in failure messages. */
  lineOf(f: LiskovFile, re: RegExp): number | null {
    const lines = this.read(f).split('\n');
    const i = lines.findIndex((l) => re.test(l));
    return i < 0 ? null : i + 1;
  }
}
