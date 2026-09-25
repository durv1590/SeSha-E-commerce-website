const base = require('@seshakart/eslint-config')({ tsconfigRootDir: __dirname });

module.exports = [
  ...base,
  {
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    languageOptions: { globals: { ...require('globals').jest } },
  },
];
