import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { validateParams } from '../../middleware/validate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { pinGate } from '../../middleware/pinGate';
import * as VaultController from './vault.controller';
import { requireVaultUnlock } from './vault.lock';
import { vaultIdParamSchema } from './vault.validation';
import { MAX_VAULT_FILE_SIZE } from './vault.storage';

const router = Router();

// Every vault operation requires authentication and, like every other route
// holding personal data, a live app-PIN unlock.
router.use(authMiddleware);
router.use(pinGate);

// Vault lock — registered BEFORE requireVaultUnlock so a locked vault can be
// unlocked. PIN verify and reset are brute-force limited per user.
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

// Everything below holds vault contents and needs a live Vault unlock when the
// owner has enabled a Vault PIN (vault.lock.ts).
router.use(requireVaultUnlock);

// Dashboard & stats
router.get('/dashboard', VaultController.getDashboard);
router.get('/storage', VaultController.getStorageUsage);

// Folders
router.get('/folders', VaultController.getFolders);
router.post('/folders', VaultController.createFolder);
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
  VaultController.uploadDocument,
);
router.post('/documents/batch-move', VaultController.batchMoveDocuments);
router.post(
  '/documents/:id/version',
  validateParams(vaultIdParamSchema),
  uploadSingle('file', { maxBytes: MAX_VAULT_FILE_SIZE }),
  VaultController.uploadNewVersion,
);
router.get('/documents/:id', validateParams(vaultIdParamSchema), VaultController.getDocument);
router.patch('/documents/:id', validateParams(vaultIdParamSchema), VaultController.updateDocument);
router.delete('/documents/:id', validateParams(vaultIdParamSchema), VaultController.deleteDocument);
router.get('/documents/:id/preview', validateParams(vaultIdParamSchema), VaultController.previewDocument);
router.get('/documents/:id/download', validateParams(vaultIdParamSchema), VaultController.downloadDocument);

// Sharing
router.get('/shares', VaultController.getOwnerShares);
router.post('/shares', VaultController.createShare);
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
