// Flag schema (plan §4.11, v3.1 A2 `_overrideWins`). Also exported as config/flags.override.schema.json.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateList = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})*$/);

export const DownloadConfig = z
  .object({
    pdf_download_limit: z.number().int().min(1),
    concurrent_pdf_downloads: z.number().int().min(1),
    to_queue_max_retry_attempts: z.number().int().min(0),
    to_queue_retry_base_delay_secs: z.number().int().min(0),
    to_queue_retry_max_delay_secs: z.number().int().min(0),
  })
  .partial()
  .strict();

export const FlagValues = z
  .object({
    epaper_pdf_download_enabled: z.boolean(),
    epaper_pdf_download_min_date: isoDate,
    epaper_pdf_download_excluded_dates: dateList,
    epaper_pdf_screenshot_disabled: z.boolean(),
    puwilo_epaper_read_sync_enabled: z.boolean(),
    download_config: DownloadConfig,
  })
  .partial()
  .strict(); // unknown keys are an error (typo protection)

export type Flags = z.infer<typeof FlagValues>;
export type FlagKey = keyof Flags;
export const FLAG_KEYS = FlagValues.keyof().options as readonly FlagKey[];

const PerEnv = z.object({ common: FlagValues.default({}), ios: FlagValues.optional(), android: FlagValues.optional() }).strict();
export type PerEnvFlags = z.infer<typeof PerEnv>;

export const FlagsOverrideFile = z
  .object({
    $schema: z.string().optional(),
    _comment: z.string().optional(),
    source: z.string().min(1),
    checkedBy: z.string().min(1),
    checkedAt: z.string().datetime({ offset: true }),
    _overrideWins: z.array(FlagValues.keyof()).default([]),
    stage: PerEnv.optional(),
    prod: PerEnv.optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    // A2: a key in _overrideWins must also be declared in the file (any env/platform block).
    const declared = new Set<string>();
    for (const env of [f.stage, f.prod]) {
      if (!env) continue;
      for (const block of [env.common, env.ios, env.android]) if (block) Object.keys(block).forEach((k) => declared.add(k));
    }
    for (const k of f._overrideWins) {
      if (!declared.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['_overrideWins'], message: `_overrideWins lists "${k}" but it is not declared in any stage/prod block` });
    }
  });
export type FlagsOverride = z.infer<typeof FlagsOverrideFile>;
