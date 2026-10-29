// COUNTRY → { locale, expectedRegion } (plan §4.19, D3). Expectations are [ASSUMPTION]: the country → edition-region
// mapping is server-side. RegionService.verify() (Phase 2) confirms each against real GraphQL before use.
// Always en_<CC>: Android row state is parsed from English content-desc (§4.6).
export const EDITION_REGIONS = ['EU', 'AP', 'UK', 'WORLDWIDE', 'NA', 'LA', 'ME', 'A'] as const;
export type EditionRegion = (typeof EDITION_REGIONS)[number];

export interface RegionEntry {
  locale: string;
  expectedRegion: EditionRegion;
}

export const regionMap: Readonly<Record<string, RegionEntry>> = {
  DK: { locale: 'en_DK', expectedRegion: 'EU' }, // DEFAULT (D3) [ASSUMPTION]
  US: { locale: 'en_US', expectedRegion: 'NA' }, // [ASSUMPTION]
  GB: { locale: 'en_GB', expectedRegion: 'UK' }, // [ASSUMPTION]
  AU: { locale: 'en_AU', expectedRegion: 'AP' }, // [ASSUMPTION]
};

export function regionFor(country: string): RegionEntry {
  const r = regionMap[country];
  if (!r) throw new Error(`COUNTRY ${country} not in config/regions.ts`);
  return r;
}
