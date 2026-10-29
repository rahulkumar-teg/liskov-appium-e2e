import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DownloadConfig, FLAG_KEYS, FlagsOverrideFile, type FlagsOverride } from '../../src/model/Flags.js';
import { resolveFlags, type ApiFlags } from '../../src/services/FlagResolver.js';

const now = new Date('2026-10-28T12:00:00+05:30');
const ov = (o: Partial<FlagsOverride> & Record<string, unknown>): FlagsOverride =>
  FlagsOverrideFile.parse({ source: 'test', checkedBy: 'unit', checkedAt: '2026-10-28T11:30:00+05:30', ...o });
const base = { platform: 'android' as const, env: 'stage' as const, now, maxAgeHours: 24, warnAgeHours: 1 };
const api = (values: ApiFlags['values'], undecidable: ApiFlags['undecidable'] = []): ApiFlags => ({ values, undecidable });

describe('unit: FlagResolver (§4.11, A2)', () => {
  it('no override, no api → repo defaults + a warning', () => {
    const r = resolveFlags({ ...base, override: null, api: null });
    assert.equal(r.sources.epaper_pdf_download_enabled, 'default');
    assert.ok(r.warnings.some((w) => /no override file/.test(w)));
  });

  it('override wins over defaults (source override)', () => {
    const r = resolveFlags({ ...base, override: ov({ stage: { common: { epaper_pdf_download_enabled: false } } }), api: null });
    assert.equal(r.flags.epaper_pdf_download_enabled, false);
    assert.equal(r.sources.epaper_pdf_download_enabled, 'override');
  });

  it('platform block wins over common; download_config merges per field', () => {
    const r = resolveFlags({ ...base, override: ov({ stage: { common: { download_config: { pdf_download_limit: 9 } }, android: { download_config: { to_queue_max_retry_attempts: 5 } } } }), api: null });
    assert.equal(r.flags.download_config?.pdf_download_limit, 9);
    assert.equal(r.flags.download_config?.to_queue_max_retry_attempts, 5);
  });

  it('api ≠ override → INFRA:FLAG_DRIFT', () => {
    assert.throws(
      () => resolveFlags({ ...base, override: ov({ stage: { common: { epaper_pdf_download_enabled: false } } }), api: api({ epaper_pdf_download_enabled: true }) }),
      /INFRA:FLAG_DRIFT.*epaper_pdf_download_enabled/,
    );
  });

  it('A2: key in _overrideWins → no drift, override used, source override-intentional, recorded', () => {
    const r = resolveFlags({
      ...base,
      override: ov({ _overrideWins: ['epaper_pdf_download_enabled'], stage: { common: { epaper_pdf_download_enabled: false } } }),
      api: api({ epaper_pdf_download_enabled: true }),
    });
    assert.equal(r.flags.epaper_pdf_download_enabled, false);
    assert.equal(r.sources.epaper_pdf_download_enabled, 'override-intentional');
    assert.deepEqual(r.intentional, [{ key: 'epaper_pdf_download_enabled', api: true, override: false }]);
  });

  it('A2: _overrideWins key that is not declared is rejected by the schema', () => {
    assert.throws(() => ov({ _overrideWins: ['epaper_pdf_download_enabled'], stage: { common: {} } }), /not declared/);
  });

  it('A2: override equal to api is plain "override" even when listed', () => {
    const r = resolveFlags({ ...base, override: ov({ _overrideWins: ['epaper_pdf_download_enabled'], stage: { common: { epaper_pdf_download_enabled: true } } }), api: api({ epaper_pdf_download_enabled: true }) });
    assert.equal(r.sources.epaper_pdf_download_enabled, 'override');
  });

  it('undecidable api key without override → ambiguous (spec SKIPs FLAG_AMBIGUOUS)', () => {
    const r = resolveFlags({ ...base, override: null, api: api({}, ['puwilo_epaper_read_sync_enabled']) });
    assert.deepEqual(r.ambiguous, ['puwilo_epaper_read_sync_enabled']);
  });

  it('stale override → INFRA:FLAG_STALE; future checkedAt → INFRA:CONFIG; > warn age → warning', () => {
    assert.throws(() => resolveFlags({ ...base, override: ov({ checkedAt: '2026-10-26T12:00:00+05:30' }), api: null }), /INFRA:FLAG_STALE/);
    assert.throws(() => resolveFlags({ ...base, override: ov({ checkedAt: '2026-10-29T12:00:00+05:30' }), api: null }), /INFRA:CONFIG/);
    const r = resolveFlags({ ...base, override: ov({ checkedAt: '2026-10-28T08:00:00+05:30' }), api: null });
    assert.ok(r.warnings.some((w) => /checked 4\.0 h ago/.test(w)));
  });

  it('unknown flag keys are a schema error (typo protection)', () => {
    assert.throws(() => ov({ stage: { common: { epaper_pdf_dowload_enabled: true } as unknown as Record<string, never> } }));
  });

  it('committed example parses', () => {
    FlagsOverrideFile.parse(JSON.parse(readFileSync('config/flags.override.example.json', 'utf8')));
  });

  it('flags.override.schema.json keys == zod keys (kept in sync)', () => {
    const s = JSON.parse(readFileSync('config/flags.override.schema.json', 'utf8'));
    assert.deepEqual(Object.keys(s.$defs.flagValues.properties).sort(), [...FLAG_KEYS].sort());
    assert.deepEqual(Object.keys(s.$defs.downloadConfig.properties).sort(), Object.keys(DownloadConfig.shape).sort());
    assert.deepEqual(Object.keys(s.properties).sort(), Object.keys(FlagsOverrideFile._def.schema.shape).sort());
    assert.deepEqual([...s.properties._overrideWins.items.enum].sort(), [...FLAG_KEYS].sort());
  });
});
