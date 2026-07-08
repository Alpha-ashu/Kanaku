import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: __dirname,
  // Mirror the Vite `define` so App.tsx's raw `__ADMIN_UI_ENABLED__` guard
  // resolves under vitest (unified/admin surface → true).
  define: {
    __ADMIN_UI_ENABLED__: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Test suites live in the central quality/ hub, not colocated under src/.
    // The '@' alias below still resolves to ./src, so tests import app code via '@/…'.
    include: ['../quality/frontend/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
