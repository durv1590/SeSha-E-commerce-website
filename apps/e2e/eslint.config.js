const base = require('@seshakart/eslint-config')({ tsconfigRootDir: __dirname });

module.exports = [...base, { ignores: ['test-results/**', 'playwright-report/**'] }];
