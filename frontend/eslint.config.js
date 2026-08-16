// Flat config (ESLint 9+). Replaces .eslintrc.cjs, which ESLint 10 no longer
// loads at all — see the removed file for the pre-migration rule rationale,
// carried forward unchanged below.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'node_modules', 'public/service-worker.js'],
  },
  {
    // The old `--ext ts,tsx` CLI flag scoped every run to .ts/.tsx only — the
    // flag itself is a legacy-config-only no-op in flat-config mode, so
    // js.configs.recommended (which carries no `files` restriction of its
    // own) silently started sweeping in build_desktop.cjs, postcss.config.mjs,
    // and vendor bundles (public/pdf.worker.min.js/mjs) that were never meant
    // to be linted. Scoping it to the same glob as the TS block below restores
    // the original ts/tsx-only intent regardless of what other .js-family
    // files exist in the tree.
    files: ['**/*.{ts,tsx}'],
    ...js.configs.recommended,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      // `configs.recommended.rules` (the legacy-eslintrc-shaped export) is
      // ONLY the TS-specific additions — it does not carry the base-ESLint
      // false-positive disabling (no-undef, no-unused-vars, no-redeclare, ...)
      // that TS types/interfaces need, because that lives in a separate
      // `eslint-recommended` config the legacy `extends` chain pulls in.
      // `configs['flat/recommended']` is the properly pre-merged flat-config
      // array that includes it — merge its rule objects here rather than
      // reading `.recommended.rules` directly.
      ...Object.assign({}, ...tseslint.configs['flat/recommended'].map((c) => c.rules || {})),
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-globals': 'off',

      // Both newly added to typescript-eslint's `recommended` set in the 8.67
      // bump (they weren't enabled at the previously-pinned 8.62/6.21). They
      // surfaced 25 genuine pre-existing findings across application code this
      // session didn't touch (dead stores in OCR/voice-parsing services, caught
      // errors rethrown without `cause`). Fixing those is a real, separate
      // cleanup task — ratchet them as warnings (counted below) rather than
      // hard-blocking CI on debt this change didn't introduce.
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',

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
  },
];
