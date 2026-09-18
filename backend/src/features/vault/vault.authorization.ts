import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { VaultAuditAction } from './vault.types';

export type AccessRole = 'owner' | 'editor' | 'viewer';

const ROLE_HIERARCHY: Record<AccessRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export interface AuthorizationResult {
  authorized: boolean;
  role?: AccessRole;
  canDownload: boolean;
  ownerId: string;
}

/**
 * Records an immutable audit log entry for a vault event.
 */
export const recordVaultAuditLog = async (params: {
  ownerId: string;
  actorId: string;
  action: VaultAuditAction;
  documentId?: string | null;
  folderId?: string | null;
  details?: string | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> => {
  try {
    await prisma.vaultAuditLog.create({
      data: {
        ownerId: params.ownerId,
        actorId: params.actorId,
        action: params.action,
        documentId: params.documentId || null,
        folderId: params.folderId || null,
        details: params.details || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (err: any) {
    logger.error('Failed to write vault audit log:', { error: err?.message, params });
  }
};

/**
 * Checks whether an actor user is authorized to access a folder.
 */
export const authorizeFolderAccess = async (
  actorId: string,
  folderId: string,
  requiredRole: AccessRole = 'viewer',
): Promise<AuthorizationResult> => {
  const folder = await prisma.vaultFolder.findFirst({
    where: { id: folderId, deletedAt: null },
  });

  if (!folder) {
    throw AppError.notFound('Folder not found');
  }

  // 1. Direct Owner
  if (folder.userId === actorId) {
    return { authorized: true, role: 'owner', canDownload: true, ownerId: folder.userId };
  }

  // 2. Check active share directly on this folder or parent folders
  let currentFolder: typeof folder | null = folder;
  const now = new Date();

  while (currentFolder) {
    const activeShare = await prisma.vaultShare.findFirst({
      where: {
        folderId: currentFolder.id,
        sharedWithUserId: actorId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (activeShare) {
      const shareRole = activeShare.permission as AccessRole;
      if (ROLE_HIERARCHY[shareRole] >= ROLE_HIERARCHY[requiredRole]) {
        return {
          authorized: true,
          role: shareRole,
          canDownload: activeShare.canDownload,
          ownerId: folder.userId,
        };
      }
    }

    if (!currentFolder.parentId) break;
    currentFolder = await prisma.vaultFolder.findFirst({
      where: { id: currentFolder.parentId, deletedAt: null },
    });
  }

  return { authorized: false, canDownload: false, ownerId: folder.userId };
};

/**
 * Checks whether an actor user is authorized to access a document.
 */
export const authorizeDocumentAccess = async (
  actorId: string,
  documentId: string,
  requiredRole: AccessRole = 'viewer',
): Promise<AuthorizationResult> => {
  const doc = await prisma.vaultDocument.findFirst({
    where: { id: documentId, deletedAt: null },
  });

  if (!doc) {
    throw AppError.notFound('Document not found');
  }

  // 1. Direct Owner
  if (doc.userId === actorId) {
    return { authorized: true, role: 'owner', canDownload: true, ownerId: doc.userId };
  }

  const now = new Date();

  // 2. Check direct Document Share
  const directShare = await prisma.vaultShare.findFirst({
    where: {
      documentId: doc.id,
      sharedWithUserId: actorId,
      status: 'active',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (directShare) {
    const shareRole = directShare.permission as AccessRole;
    if (ROLE_HIERARCHY[shareRole] >= ROLE_HIERARCHY[requiredRole]) {
      return {
        authorized: true,
        role: shareRole,
        canDownload: directShare.canDownload,
        ownerId: doc.userId,
      };
    }
  }

  // 3. Check Folder-level share if document is in a folder
  if (doc.folderId) {
    const folderAuth = await authorizeFolderAccess(actorId, doc.folderId, requiredRole);
    if (folderAuth.authorized) {
      return folderAuth;
    }
  }

  return { authorized: false, canDownload: false, ownerId: doc.userId };
};
