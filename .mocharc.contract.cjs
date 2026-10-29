// L0 contract runner (plan §4.23). Deliberately SEPARATE from the WDIO/Mocha device suite:
// plain Node + Mocha, no WebdriverIO, no Appium, no device. `make contract` / `npm run test:contract`.
module.exports = {
  'node-option': ['import=tsx'],
  spec: ['tests/contract/**/*.contract.spec.ts'],
  extension: ['ts'],
  timeout: 60000,
  reporter: 'spec',
  'forbid-only': true,
};
