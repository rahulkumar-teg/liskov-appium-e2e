// Roles → secret references (plan §4.9, §4.25). REFERENCES ONLY, never values.
// env:NAME = framework .env / environment (SecretsBroker); op://… = 1Password (fallbacks until the automation vault exists).
// t791u: user1 (core digital test subscriber, USER1_EMAIL / USER1_PASSWORD in the framework .env) is first for core_digital.
// The vault/item names below are [ASSUMPTION] placeholders until the automation vault exists (plan §8 step 2);
// `make validate` checks the syntax; resolution (`op read`) is opt-in (VALIDATE_RESOLVE_SECRETS=1).
export type Role = 'core_digital' | 'print_digital' | 'logged_out' | 'registered_no_sub' | 'b2b';

export interface AccountRef {
  /** Short account key for scripts (e.g. `npm run login -- --account user1`). */
  key?: string;
  /** Secret reference (env:NAME or op://) to the username/email; also the key into config/amplitude-ids.json (A1). */
  ref: string;
  passwordRef: string;
  /** @serial-account accounts (EP-17/25): UI-cleaned before release; stale takeover ⇒ CleanupFlow.deleteAll() (A4). */
  serial?: boolean;
}

export const accountPool: Readonly<Record<Exclude<Role, 'logged_out'>, readonly AccountRef[]>> = {
  core_digital: [
    { key: 'user1', ref: 'env:USER1_EMAIL', passwordRef: 'env:USER1_PASSWORD' },
    { ref: 'op://Automation/core-digital-1/username', passwordRef: 'op://Automation/core-digital-1/password' },
    { ref: 'op://Automation/core-digital-2/username', passwordRef: 'op://Automation/core-digital-2/password' },
    { ref: 'op://Automation/core-digital-serial-1/username', passwordRef: 'op://Automation/core-digital-serial-1/password', serial: true },
  ],
  print_digital: [{ ref: 'op://Automation/print-digital-1/username', passwordRef: 'op://Automation/print-digital-1/password' }],
  registered_no_sub: [{ ref: 'op://Automation/registered-1/username', passwordRef: 'op://Automation/registered-1/password' }],
  b2b: [{ ref: 'op://Automation/b2b-1/username', passwordRef: 'op://Automation/b2b-1/password' }],
};

/** Account by key (e.g. 'user1') across every role; undefined if unknown. */
export function accountByKey(key: string): { role: Exclude<Role, 'logged_out'>; account: AccountRef } | undefined {
  for (const [role, list] of Object.entries(accountPool) as Array<[Exclude<Role, 'logged_out'>, readonly AccountRef[]]>) {
    const account = list.find((a) => a.key === key);
    if (account) return { role, account };
  }
  return undefined;
}
