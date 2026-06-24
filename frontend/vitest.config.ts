import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: __dirname,
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
