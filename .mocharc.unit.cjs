// Unit tests for framework primitives (locks, leases, config, secrets, history). No device, no network.
module.exports = {
  'node-option': ['import=tsx'],
  spec: ['tests/unit/**/*.spec.ts'],
  extension: ['ts'],
  timeout: 30000,
  reporter: 'spec',
  'forbid-only': true,
};
