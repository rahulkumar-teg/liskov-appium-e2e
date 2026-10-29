// Compile-time no-log contract (checked by `tsc --noEmit`; never executed).
import { SecretString, type NotSecret } from '../../src/secrets/SecretString.js';
import { typeSecret } from '../../src/secrets/typeSecret.js';

declare const el: { setValue(v: string): Promise<unknown> };
declare const log: { withLoggingSilenced<T>(fn: () => Promise<T>): Promise<T> };

// @ts-expect-error a plain string is not a SecretString
void typeSecret(el, 'hunter2', log);
// @ts-expect-error an object with the same public shape is still not a SecretString (nominal brand)
void typeSecret(el, { ref: 'op://V/i/p', length: 7, reveal: () => 'x', toString: () => '***', toJSON: () => '***' }, log);

function logParam<T>(v: NotSecret<T>): void {
  void v;
}
declare const s: SecretString;
// @ts-expect-error NotSecret<T> refuses a SecretString (loggers / Allure params / error messages)
logParam(s);
logParam('fine');
void typeSecret(el, s, log);
