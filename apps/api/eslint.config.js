const globals = require('globals');
const base = require('@seshakart/eslint-config')({ tsconfigRootDir: __dirname });

module.exports = [
  ...base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // NestJS dependency injection reads constructor parameter types at runtime via
        // decorator metadata. Telling the parser keeps `consistent-type-imports` from
        // converting injected classes into `import type` (which would break DI).
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
  {
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
  },
  // CLI scripts report progress on stdout.
  {
    files: ['src/database/seed.ts', 'src/database/seed-demo.ts', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
];
