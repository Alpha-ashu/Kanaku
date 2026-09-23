import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { validateParams } from '../../middleware/validate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import { idempotency } from '../../middleware/idempotency';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import * as VaultController from './vault.controller';
import { requireVaultUnlock } from './vault.lock';
import { vaultIdParamSchema } from './vault.validation';
import { MAX_VAULT_FILE_SIZE } from './vault.storage';

const router = Router();

// Every vault operation requires authentication.
router.use(authMiddleware);
// The admin panel's `vault` switch (on by default for every role).
router.use(requireFeature('vault'));

// ── Vault lock ───────────────────────────────────────────────────────────────
//
// Registered BEFORE `pinGate` and `requireVaultUnlock`, so the keypad can always
// be reached. These four endpoints return no vault contents — only lock state —
// and each carries its own proof: /verify needs the Vault PIN (rate limited
// below), /configure needs a live vault unlock or the current PIN, and /reset
// needs a verified sensitive_action OTP for the account's email.
//
// They used to sit behind pinGate, which made the whole feature unusable on any
// device that had not unlocked the app PIN in the last PIN_GATE_TIMEOUT_MINUTES:
// /lock/status answered 403 PIN_VERIFICATION_REQUIRED, so the Vault screen never
// learned a PIN was set and never showed its keypad, and changing the lock
// settings failed with a bare "you do not have permission".
const lockAttemptLimit = authenticatedRateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  scope: 'vault-lock-attempt',
  message: 'Too many Vault PIN attempts. Please wait 15 minutes and try again.',
});
router.get('/lock/status', VaultController.getLockStatus);
router.post('/lock/configure', VaultController.configureLock);
router.post('/lock/verify', lockAttemptLimit, VaultController.verifyLock);
router.post('/lock/reset', lockAttemptLimit, VaultController.resetLockPin);

// ── Vault contents ───────────────────────────────────────────────────────────
// Like every other route holding personal data, a live app-PIN unlock is
// required; and on top of it a live Vault unlock when the owner set a Vault PIN.
router.use(pinGate);
router.use(requireVaultUnlock);

// Dashboard & stats
router.get('/dashboard', VaultController.getDashboard);
router.get('/storage', VaultController.getStorageUsage);

// Folders
//
// Vault creates carry the same duplicate protection as every other record type:
// an Idempotency-Key replay (24h, Postgres-backed) and the in-flight/content
// guard. Without them a double-tapped "New folder" made two identical folders,
// and a retried upload made two documents AND two storage objects.
router.get('/folders', VaultController.getFolders);
router.post(
  '/folders',
  idempotency({ scope: 'vault.folders.create' }),
  duplicateSubmitGuard({ scope: 'vault.folders.create' }),
  VaultController.createFolder,
);
router.patch('/folders/:id', validateParams(vaultIdParamSchema), VaultController.updateFolder);
router.delete('/folders/:id', validateParams(vaultIdParamSchema), VaultController.deleteFolder);

// Documents
router.get('/documents', VaultController.getDocuments);
router.post(
  '/documents',
  authenticatedRateLimit({
    windowMs: 60_000,
    max: 60,
    scope: 'vault-upload',
    message: 'Too many document uploads. Please wait a moment.',
  }),
  uploadSingle('file', { maxBytes: MAX_VAULT_FILE_SIZE }),
  // Key-based replay only — deliberately NOT duplicateSubmitGuard. That guard
  // fingerprints the request body, and an upload's body is just metadata, so two
  // genuinely different files sharing a title/folder would be merged into one.
  // Same reasoning as the bills upload route.
  idempotency({ scope: 'vault.documents.create' }),
  VaultController.uploadDocument,
);
router.post(
  '/documents/batch-move',
  idempotency({ scope: 'vault.documents.batchMove' }),
  VaultController.batchMoveDocuments,
);
router.post(
  '/documents/:id/version',
  validateParams(vaultIdParamSchema),
  uploadSingle('file', { maxBytes: MAX_VAULT_FILE_SIZE }),
  idempotency({ scope: 'vault.documents.version' }),
  VaultController.uploadNewVersion,
);
router.get('/documents/:id', validateParams(vaultIdParamSchema), VaultController.getDocument);
router.patch('/documents/:id', validateParams(vaultIdParamSchema), VaultController.updateDocument);
router.delete('/documents/:id', validateParams(vaultIdParamSchema), VaultController.deleteDocument);
router.get('/documents/:id/preview', validateParams(vaultIdParamSchema), VaultController.previewDocument);
router.get('/documents/:id/download', validateParams(vaultIdParamSchema), VaultController.downloadDocument);

// Sharing
router.get('/shares', VaultController.getOwnerShares);
// Sharing looks the recipient up by email and says when none exists (the owner
// needs that feedback), so creation is rate limited to stop it being used to
// enumerate accounts in bulk.
router.post(
  '/shares',
  authenticatedRateLimit({
    windowMs: 10 * 60_000,
    max: 30,
    scope: 'vault-share-create',
    message: 'Too many share attempts. Please wait a few minutes.',
  }),
  idempotency({ scope: 'vault.shares.create' }),
  duplicateSubmitGuard({ scope: 'vault.shares.create' }),
  VaultController.createShare,
);
router.patch('/shares/:id', validateParams(vaultIdParamSchema), VaultController.updateShare);
router.delete('/shares/:id', validateParams(vaultIdParamSchema), VaultController.revokeShare);
router.get('/shared-with-me', VaultController.getSharedWithMe);
router.get(
  '/shared-with-me/folders/:id/documents',
  validateParams(vaultIdParamSchema),
  VaultController.getSharedFolderDocuments,
);

// Audit logs
router.get('/audit-logs', VaultController.getAuditLogs);

export { router as vaultRoutes };
