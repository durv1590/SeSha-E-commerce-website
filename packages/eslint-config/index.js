// Shared ESLint flat config for SeShaKart TypeScript packages and the API.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

/** @param {{ tsconfigRootDir?: string }} [opts] */
module.exports = function seshakartConfig(opts = {}) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: opts.tsconfigRootDir ? { tsconfigRootDir: opts.tsconfigRootDir } : {},
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'smart'],
      },
    },
    {
      // Plain CommonJS config/tooling files.
      files: ['**/*.js', '**/*.cjs'],
      languageOptions: { sourceType: 'commonjs' },
      rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
    prettier,
  );
};
