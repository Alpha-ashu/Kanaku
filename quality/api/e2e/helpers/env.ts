/**
 * Environment + base URLs for API E2E tests.
 *
 * Override via env vars (e.g. in CI):
 *   API_BASE_URL   default http://localhost:3000   (Express backend root)
 *   API_PREFIX     default /api/v1
 */
import { createHash } from 'crypto';

export const API_BASE_URL = process.env.API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
export const API_PREFIX = process.env.API_PREFIX || '/api/v1';

export const apiUrl = (path: string): string =>
  `${API_BASE_URL}${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;

/** SHA-256 hex digest — matches the frontend's pre-hash for the login challenge. */
export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

