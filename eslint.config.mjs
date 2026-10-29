// ESLint flat config. Rules encode plan invariants: no fixed sleeps (I7), SecretString.reveal() only in the
// two allowed files (§4.25), no assertions on pHash/OCR evidence (D13).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'allure-*/**', 'reports/**', 'builds/**', '**/*.cjs', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='pause']", message: 'I7: no fixed sleeps; use waits.ts condition waits.' },
        { selector: "CallExpression[callee.property.name='reveal']", message: '§4.25: SecretString.reveal() is allowed only in SecretsBroker.ts / typeSecret.ts / AssetSigner.ts / AmplitudeFlagReader.ts.' },
        { selector: "CallExpression[callee.name=/^(expect|assert)$/] Identifier[name=/phash|ocr/i]", message: 'D13: pHash/OCR are evidence only, never asserted.' },
        { selector: "CallExpression[callee.object.name='assert'] Identifier[name=/phash|ocr/i]", message: 'D13: pHash/OCR are evidence only, never asserted.' },
        { selector: "CallExpression[callee.name=/^(expect|assert)$/] MemberExpression[property.name=/phash|ocr/i]", message: 'D13: pHash/OCR are evidence only, never asserted.' },
        { selector: "CallExpression[callee.object.name='assert'] MemberExpression[property.name=/phash|ocr/i]", message: 'D13: pHash/OCR are evidence only, never asserted.' },
      ],
    },
  },
  {
    files: ['src/secrets/SecretsBroker.ts', 'src/secrets/typeSecret.ts', 'src/secrets/SecretString.ts', 'src/secrets/AssetSigner.ts', 'src/services/AmplitudeFlagReader.ts', 'tests/unit/secrets.spec.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/core/waits.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
