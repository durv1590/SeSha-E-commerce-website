const jsxA11y = require('eslint-plugin-jsx-a11y');
const reactHooks = require('eslint-plugin-react-hooks');
const base = require('@seshakart/eslint-config')({ tsconfigRootDir: __dirname });

module.exports = [
  ...base,
  jsxA11y.flatConfigs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
