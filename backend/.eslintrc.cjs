module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
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
  },
};
