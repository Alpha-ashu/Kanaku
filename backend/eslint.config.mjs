// Flat config (ESLint 9+). Replaces .eslintrc.cjs, which ESLint 10 no longer
// loads at all — see frontend/eslint.config.js for the fuller migration
// rationale (js.configs.recommended scoping, the flat/recommended merge
// requirement). Carries the original rule intent forward unchanged.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist', 'node_modules'],
  },
  {
    files: ['src/**/*.ts'],
    ...js.configs.recommended,
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // `configs.recommended.rules` alone omits the base-ESLint false-positive
      // disabling (no-undef, no-unused-vars, ...) that TS types need — that
      // lives in the separate config `flat/recommended` bundles in. See
      // frontend/eslint.config.js for the fuller explanation.
      ...Object.assign({}, ...tseslint.configs['flat/recommended'].map((c) => c.rules || {})),
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch (error) {}` with an unused binding is idiomatic, not dead code.
          // typescript-eslint changed this default to 'all', which is what turned
          // ~30 ordinary catch blocks into lint errors.
          caughtErrors: 'none',
          // Covers the deliberate `const { secret, ...safe } = row` idiom used to
          // strip a field before returning it — intentional omission, not dead code.
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Both newly added to typescript-eslint's `recommended` set in the 8.67
      // bump (not enabled at the previously-pinned 8.62/6.21) — see
      // frontend/eslint.config.js for the same finding there. Ratcheted as
      // warnings rather than hard-blocking CI on pre-existing debt this
      // dependency bump didn't introduce.
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
];
