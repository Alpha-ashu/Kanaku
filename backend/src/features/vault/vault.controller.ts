import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { VaultService } from './vault.service';
import {
  createFolderSchema,
  updateFolderSchema,
  updateDocumentSchema,
  createShareSchema,
  updateShareSchema,
  configureLockSchema,
  verifyLockSchema,
  resetLockSchema,
  batchMoveSchema,
} from './vault.validation';
import { AppError } from '../../utils/AppError';
import { VAULT_UNLOCK_HEADER, isValidVaultUnlockToken } from './vault.lock';

/** Only these render safely inline; everything else is served as an attachment. */
const INLINE_SAFE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv']);

/**
 * Headers for decrypted vault files. The content type was declared by the
 * uploader's client, so the response is sandboxed: nosniff stops type
 * guessing, and the CSP sandbox keeps any active content from running on the
 * API origin even if a hostile file slips through.
 */
const setVaultFileHeaders = (res: Response, contentType: string, fileName: string, inline: boolean) => {
  const disposition = inline && INLINE_SAFE_TYPES.has(contentType) ? 'inline' : 'attachment';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
};

export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const summary = await VaultService.getDashboardSummary(userId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

export const getStorageUsage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const usage = await VaultService.getStorageUsage(userId);
    res.json(usage);
  } catch (error) {
    next(error);
  }
};

export const getFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const folders = await VaultService.getFolders(userId);
    res.json(folders);
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validated = createFolderSchema.parse(req.body);
    const folder = await VaultService.createFolder(
      userId,
      validated,
      req.ip,
      req.get('user-agent'),
    );
    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
};

export const updateFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const validated = updateFolderSchema.parse(req.body);
    const folder = await VaultService.updateFolder(
      userId,
      id,
      validated,
      req.ip,
      req.get('user-agent'),
    );
    res.json(folder);
  } catch (error) {
    next(error);
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const result = await VaultService.deleteFolder(userId, id, req.ip, req.get('user-agent'));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { folderId, category, search, tag, isSensitive, expiringSoon } = req.query;

    const docs = await VaultService.getDocuments(userId, {
      folderId: folderId ? String(folderId) : undefined,
      category: category ? String(category) : undefined,
      search: search ? String(search) : undefined,
      tag: tag ? String(tag) : undefined,
      isSensitive: isSensitive !== undefined ? isSensitive === 'true' : undefined,
      expiringSoon: expiringSoon === 'true',
    });

    res.json(docs);
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!req.file) {
      throw AppError.badRequest('No document file attached');
    }

    // Parse JSON metadata from multipart body
    let tags: string[] = [];
    if (req.body.tags) {
      try {
        tags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
      } catch {
        tags = String(req.body.tags).split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    const doc = await VaultService.uploadDocument(
      userId,
      req.file,
      {
        title: req.body.title || req.file.originalname,
        folderId: req.body.folderId || null,
        category: req.body.category || 'Personal Documents',
        description: req.body.description,
        tags,
        institution: req.body.institution,
        documentNumber: req.body.documentNumber,
        expiryDate: req.body.expiryDate,
        renewalDate: req.body.renewalDate,
        reminderDate: req.body.reminderDate,
        isSensitive: req.body.isSensitive === 'true' || req.body.isSensitive === true,
      },
      req.ip,
      req.get('user-agent'),
    );

    res.status(201).json(doc);
  } catch (error) {
    next(error);
  }
};

export const uploadNewVersion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!req.file) {
      throw AppError.badRequest('No document file attached for new version');
    }

    const doc = await VaultService.uploadNewVersion(
      userId,
      id,
      req.file,
      req.body.note,
      req.ip,
      req.get('user-agent'),
    );

    res.status(201).json(doc);
  } catch (error) {
    next(error);
  }
};

export const getDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const doc = await VaultService.getDocument(userId, id, req.ip, req.get('user-agent'));
    res.json(doc);
  } catch (error) {
    next(error);
  }
};

export const updateDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const validated = updateDocumentSchema.parse(req.body);
    const doc = await VaultService.updateDocument(
      userId,
      id,
      validated,
      req.ip,
      req.get('user-agent'),
    );
    res.json(doc);
  } catch (error) {
    next(error);
  }
};

export const batchMoveDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validated = batchMoveSchema.parse(req.body);
    const result = await VaultService.batchMoveDocuments(
      userId,
      validated.documentIds,
      validated.folderId || null,
      req.ip,
      req.get('user-agent'),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const result = await VaultService.deleteDocument(userId, id, req.ip, req.get('user-agent'));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const previewDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const fileStream = await VaultService.streamDocumentFile(
      userId,
      id,
      false,
      req.ip,
      req.get('user-agent'),
    );

    setVaultFileHeaders(res, fileStream.contentType, fileStream.fileName, true);
    res.send(fileStream.buffer);
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const fileStream = await VaultService.streamDocumentFile(
      userId,
      id,
      true,
      req.ip,
      req.get('user-agent'),
    );

    setVaultFileHeaders(res, fileStream.contentType, fileStream.fileName, false);
    res.send(fileStream.buffer);
  } catch (error) {
    next(error);
  }
};

export const getOwnerShares = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const shares = await VaultService.getOwnerShares(userId);
    res.json(shares);
  } catch (error) {
    next(error);
  }
};

export const createShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validated = createShareSchema.parse(req.body);
    const share = await VaultService.createShare(userId, validated, req.ip, req.get('user-agent'));
    res.status(201).json(share);
  } catch (error) {
    next(error);
  }
};

export const updateShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const validated = updateShareSchema.parse(req.body);
    const share = await VaultService.updateShare(userId, id, validated, req.ip, req.get('user-agent'));
    res.json(share);
  } catch (error) {
    next(error);
  }
};

export const revokeShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const result = await VaultService.revokeShare(userId, id, req.ip, req.get('user-agent'));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getSharedWithMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const items = await VaultService.getSharedWithMe(userId);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const getSharedFolderDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const result = await VaultService.getSharedFolderDocuments(userId, id, req.ip, req.get('user-agent'));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const logs = await VaultService.getAuditLogs(userId);
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

export const getLockStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const status = await VaultService.getLockSetting(userId);
    res.json(status);
  } catch (error) {
    next(error);
  }
};

export const configureLock = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validated = configureLockSchema.parse(req.body);
    // Deliberately STRICTER than reading the vault: changing the lock needs this
    // session to hold the unlock token (or the current PIN, checked in the
    // service). The durable "unlocked recently" fallback that keeps older
    // clients reading (vault.lock.ts) must not also let anyone switch the lock
    // off with a stolen token during someone else's unlock window.
    const isUnlocked = isValidVaultUnlockToken(req.headers[VAULT_UNLOCK_HEADER] as string | undefined, userId);
    const result = await VaultService.configureLock(userId, validated, isUnlocked);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const verifyLock = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validated = verifyLockSchema.parse(req.body);
    const result = await VaultService.verifyLock(userId, validated.vaultPin);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const resetLockPin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { newPin } = resetLockSchema.parse(req.body || {});
    const result = await VaultService.resetLockPin(userId, newPin);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

