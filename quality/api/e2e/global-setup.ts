/**
 * Global setup: fail fast with a clear message if the backend isn't reachable,
 * so a missing dev server doesn't look like a test bug.
 */
import { request } from '@playwright/test';
import { API_BASE_URL } from './helpers/env';

export default async function globalSetup() {
  const ctx = await request.newContext();
  try {
    const resp = await ctx.get(`${API_BASE_URL}/health`, { timeout: 5_000 });
    if (!resp.ok()) {
      throw new Error(`/health returned ${resp.status()}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[api-e2e] backend healthy at ${API_BASE_URL}`);
  } catch (err) {
    throw new Error(
      `\n[api-e2e] Backend not reachable at ${API_BASE_URL}.\n` +
        `Start it first:  npm run dev:backend  (or set API_BASE_URL).\n` +
        `Underlying error: ${(err as Error).message}\n`,
    );
  } finally {
    await ctx.dispose();
  }
}

