// typeSecret (plan §4.25): the ONLY way a secret reaches a UI field. Accepts SecretString, never string.
// Used by specs/support/flows.ts (login); command logging is off while typing and the value is redacted everywhere.
import { SecretString } from './SecretString.js';

export interface SecretField {
  setValue(value: string): Promise<unknown>;
}

export interface CommandLogControl {
  /** Turn WDIO command logging off for the duration of fn (logLevel 'silent'), restoring it afterwards. */
  withLoggingSilenced<T>(fn: () => Promise<T>): Promise<T>;
}

export async function typeSecret(el: SecretField, secret: SecretString, log: CommandLogControl): Promise<void> {
  if (!(secret instanceof SecretString)) throw new TypeError('typeSecret needs a SecretString');
  await log.withLoggingSilenced(() => el.setValue(secret.reveal()));
}
