// `npm run validate` / `make validate`: dry run, no Appium, no device.
import '../src/core/loadSettings.js';
import { asInfra, formatChecks, runValidate } from '../src/core/ValidateMode.js';

const { checks, exitCode } = await runValidate({ env: process.env, cwd: process.cwd() });
console.log(formatChecks(checks));
const err = asInfra(exitCode, checks);
console.log(err ? `\nvalidate: FAIL (${checks.filter((c) => c.level === 'error').length} error(s)) — ${err.message.slice(0, 200)}` : '\nvalidate: OK (a real run could start, subject to the DEFERRED Phase 2 checks above)');
process.exit(exitCode);
