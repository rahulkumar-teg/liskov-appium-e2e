// v3.1 A1: Amplitude userId per leased account, from config/amplitude-ids.json (git-ignored; example committed).
// Never read from the device (I1). An account with no entry ⇒ its puwilo_* keys are FLAG_AMBIGUOUS (SKIP, never a guess).
//
// Derivation (read-only app source, 2026-10-28): the Experiment userId is lower-case hex SHA-256 of the account's
// Salesforce contactId (UTF-8); deviceId is the Amplitude device id. Same on both platforms:
//   android core/config/.../AmplitudeRemoteConfigServiceImpl.kt: accountInfo?.contactId?.sha256Hash() → ExperimentUser.userId
//   ios Packages/RemoteConfiguration/.../AmplitudeExperimentManager.swift: fetch(userId: sha256Hash(contactId), deviceId:)
// Logged out ⇒ userId null. So per automation account the framework needs the contactId (or the hash) — NOT the email.
// `_devices` holds ids observed on a device's Debug screen whose signed-in account is not yet mapped to a pool ref.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { accountPool, type Role } from '../../config/accounts.js';
import { InfraError } from '../core/errors.js';

const Entry = z.object({ userId: z.string().min(1), note: z.string().optional() }).strict();
const DeviceObservation = z
  .object({
    amplitudeDeviceId: z.string().min(1),
    userId: z.string().regex(/^[0-9a-f]{64}$/, 'userId must be a lower-case sha256 hex (sha256(contactId))').nullable(),
    accountRef: z.string().startsWith('op://').nullable(),
    role: z.string().nullable(),
    observedAt: z.string().datetime({ offset: true }),
    note: z.string().optional(),
  })
  .strict();
export type DeviceObservation = z.infer<typeof DeviceObservation>;
const Devices = z.record(z.string().regex(/^[a-z0-9][a-z0-9-]*$/), DeviceObservation);

/** Experiment userId for an account, exactly as the app computes it. */
export function deriveAmplitudeUserId(contactId: string): string {
  return createHash('sha256').update(contactId, 'utf8').digest('hex');
}

export const AmplitudeIdsFile = z.record(z.string(), z.unknown()).superRefine((o, ctx) => {
  for (const [k, v] of Object.entries(o)) {
    if (k === '_devices') {
      const r = Devices.safeParse(v);
      if (!r.success) for (const i of r.error.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k, ...i.path], message: i.message });
      continue;
    }
    const e = Entry.safeParse(v);
    if (k === '_comment') {
      if (typeof v !== 'string') ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: '_comment must be a string' });
      continue;
    }
    if (!k.startsWith('op://')) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'keys must be op:// references from config/accounts.ts' });
    if (!e.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: 'value must be { userId, note? }' });
  }
});

export class AmplitudeIds {
  private constructor(
    private readonly table: ReadonlyMap<string, { userId: string; note?: string }>,
    private readonly devices: Readonly<Record<string, DeviceObservation>> = {},
  ) {}

  static async load(file: string): Promise<AmplitudeIds> {
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new AmplitudeIds(new Map());
      throw e;
    }
    const r = AmplitudeIdsFile.safeParse(JSON.parse(raw));
    if (!r.success) throw new InfraError('CONFIG', `${file}: ${r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
    const m = new Map<string, { userId: string; note?: string }>();
    for (const [k, v] of Object.entries(r.data)) {
      if (k === '_comment' || k === '_devices') continue;
      const e = Entry.parse(v);
      m.set(k, e.note === undefined ? { userId: e.userId } : { userId: e.userId, note: e.note });
    }
    return new AmplitudeIds(m, r.data['_devices'] ? Devices.parse(r.data['_devices']) : {});
  }

  /** userId for a leased account reference; undefined ⇒ caller marks puwilo_* keys FLAG_AMBIGUOUS. */
  forAccountRef(accountRef: string): { userId: string } | undefined {
    const e = this.table.get(accountRef);
    return e && !e.userId.startsWith('<') ? { userId: e.userId } : undefined;
  }

  /** Plan wording `AmplitudeIds.forAccount(role)`: resolves via the lease's accountRef for that role. */
  forAccount(_role: Role, lease: { accountRef: string }): { userId: string } | undefined {
    return this.forAccountRef(lease.accountRef);
  }

  /** Ids seen on a registered device (Debug screen). Never used for flag resolution until accountRef is set. */
  forDevice(deviceId: string): DeviceObservation | undefined {
    return this.devices[deviceId];
  }

  /** Device observations whose account is not mapped to a pool ref yet (validate warns). */
  unmappedDevices(): string[] {
    return Object.entries(this.devices)
      .filter(([, d]) => !d.accountRef)
      .map(([id]) => id);
  }

  /** Pool accounts with no usable entry (validate warns). */
  missing(): string[] {
    return Object.values(accountPool)
      .flat()
      .map((a) => a.ref)
      .filter((ref) => !this.forAccountRef(ref));
  }
}
