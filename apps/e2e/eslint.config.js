const base = require('@seshakart/eslint-config')({ tsconfigRootDir: __dirname });

module.exports = [
  ...base,
  { ignores: ['test-results/**', 'playwright-report/**'] },
  // The stack launchers report progress on stdout.
  { files: ['support/*.mjs'], rules: { 'no-console': 'off' } },
];
