module.exports = {
  env: {
    browser: true,
    es2020: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-restricted-globals': 'off',

    // `catch {}` for a genuinely ignorable failure (storage unavailable in
    // private mode, a best-effort teardown) is deliberate here and appears
    // throughout with an explanatory comment above it. Empty blocks of any other
    // shape still error.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // `@ts-expect-error` is preferred, but these suppress errors in third-party
    // .d.ts interop (supabase SSR helpers, pdfjs worker imports) that appear and
    // disappear across versions — `@ts-expect-error` would then fail the build
    // for being unnecessary. Require a reason instead of banning outright.
    '@typescript-eslint/ban-ts-comment': ['error', {
      'ts-ignore': 'allow-with-description',
      minimumDescriptionLength: 10,
    }],

    // eslint-plugin-react-hooks was NOT installed before, so every `react-hooks/*`
    // rule was silently inert — including the three
    // `eslint-disable-next-line react-hooks/exhaustive-deps` comments in the
    // codebase, which suppressed nothing. That is why App.tsx was able to place
    // eleven useEffect calls after an early return without anything complaining.
    //
    // rules-of-hooks is an error: it catches genuine "Rendered more hooks than
    // during the previous render" crashes.
    // exhaustive-deps stays a warning so the existing deliberate omissions can be
    // worked through incrementally rather than blocking this change.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules', 'public/service-worker.js'],
};
