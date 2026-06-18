/**
 * Security facade — a single, discoverable import surface for the backend's
 * security primitives. The canonical implementations live under `middleware/`
 * and `utils/` (so existing imports keep working); this module re-exports them
 * grouped by concern. New code should prefer importing from here:
 *
 *   import { authMiddleware, requireRole, validateBody, sanitize } from '../security';
 *
 * See ./README.md for the full security-controls catalog and audit notes.
 */

// ── Authentication (who are you) ──────────────────────────────────────────────
export { authMiddleware, getUserId, invalidateUserSnapshotCache } from '../middleware/auth';

// ── Token / JWT security ──────────────────────────────────────────────────────
export {
  generateTokens,
  verifyToken,
  verifyRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../utils/auth';

// ── Authorization (what may you do) ───────────────────────────────────────────
export { requireRole, requireApproved, ownerOnly, withAudit } from '../middleware/rbac';
export {
  requireFeature,
  requireAIFeature,
  invalidateFeatureCache,
  invalidateAIFeatureCache,
} from '../middleware/featureGate';
export { securityGate, generateSecurityToken } from '../middleware/securityGate';

// ── Rate limiting (abuse / brute-force protection) ────────────────────────────
export { rateLimit, authenticatedRateLimit } from '../middleware/rateLimit';

// ── Input validation (Zod request schemas / DTOs) ─────────────────────────────
export { validateBody, validateQuery, validateParams, z } from '../middleware/validate';

// ── Sanitization & AI input/output safety ─────────────────────────────────────
export {
  sanitize,
  sanitizeAIInput,
  sanitizeAIOutput,
  containsPromptInjection,
  validateOcrResult,
  MAX_AI_INPUT_LENGTH,
  MAX_AI_OUTPUT_LENGTH,
} from '../utils/sanitize';

// ── Audit logging (security-relevant events) ──────────────────────────────────
export { audit } from '../utils/auditLogger';
