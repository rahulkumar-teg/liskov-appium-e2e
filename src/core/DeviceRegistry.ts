// Device registry (plan §4.21, D8/D12): dedicated-only devices.yaml, zod-validated, unknown keys rejected.
// Phase 1: parse + select. Connectivity checks (devicectl/adb/simctl) are Phase 2 and never run in validate here.
import { promises as fs } from 'node:fs';
import YAML from 'yaml';
import { z } from 'zod';
import { TARGETS, type Target } from './ConfigLoader.js';
import { InfraError } from './errors.js';

const iso = z.string().datetime({ offset: true });

export const DeviceEntry = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id: lower-case, digits, dashes'),
    target: z.enum(TARGETS),
    status: z.enum(['registered', 'pending']),
    udid: z.string().min(1).optional(),
    avd: z.string().optional(),
    name: z.string().optional(),
    osVersion: z.string().optional(),
    gate: z.enum(['release', 'dev-only']),
    sim: z.boolean().optional(),
    provisioned: z.boolean().optional(),
    envSetBy: z.string().optional(),
    envSetAt: iso.optional(),
    registeredAt: iso.optional(),
  })
  .strict() // a leftover `dedicated` / `signedInRole` (v2) is an error
  .superRefine((d, ctx) => {
    const add = (m: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${d.id}: ${m}` });
    if (d.status === 'registered') {
      if (!d.udid || d.udid.startsWith('<')) add('registered device needs a real udid');
      if (!d.registeredAt) add('registered device needs registeredAt');
      if (d.target.endsWith('-real') && (!d.envSetBy || !d.envSetAt)) add('real device needs envSetBy/envSetAt (human confirmed Debug ▸ Environment = Staging, §4.12)');
    }
    if (d.target === 'android-emu' && !d.avd) add('android-emu needs avd');
  });
export type Device = z.infer<typeof DeviceEntry>;

export const DevicesFile = z
  .object({ devices: z.array(DeviceEntry) })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    for (const d of f.devices) {
      if (seen.has(d.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate device id ${d.id}` });
      seen.add(d.id);
    }
    const udids = f.devices.filter((d) => d.udid).map((d) => d.udid!);
    if (new Set(udids).size !== udids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate udid' });
  });

export async function loadDevices(file: string): Promise<Device[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new InfraError('VALIDATE', `${file} not found — register devices with scripts/register-device.ts (Phase 2); see config/devices.example.yaml`);
    throw e;
  }
  const r = DevicesFile.safeParse(YAML.parse(raw));
  if (!r.success) throw new InfraError('CONFIG', `${file}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data.devices;
}

/** Registered devices for a target; DEVICE_ID may be a registry id or a udid. Never returns a pending device. */
export function selectDevices(devices: Device[], target: Target, deviceId?: string): Device[] {
  const forTarget = devices.filter((d) => d.target === target && d.status === 'registered');
  if (!deviceId) return forTarget;
  return forTarget.filter((d) => d.id === deviceId || d.udid === deviceId);
}
