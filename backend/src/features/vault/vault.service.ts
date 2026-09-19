import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import {
  CreateFolderDTO,
  UpdateFolderDTO,
  UploadDocumentDTO,
  UpdateDocumentDTO,
  CreateShareDTO,
  UpdateShareDTO,
  ConfigureLockDTO,
} from './vault.types';
import {
  storeEncryptedVaultFile,
  fetchDecryptedVaultFile,
  deleteVaultFile,
  ALLOWED_MIME_TYPES,
  MAX_VAULT_FILE_SIZE,
} from './vault.storage';
import {
  authorizeDocumentAccess,
  authorizeFolderAccess,
  recordVaultAuditLog,
} from './vault.authorization';

/** 500 MB per-user vault storage limit */
const VAULT_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

const DEFAULT_FOLDERS = [
  { name: 'Personal Documents', category: 'Personal Documents', color: '#3B82F6', icon: 'UserCheck' },
  { name: 'Property Documents', category: 'Property Documents', color: '#10B981', icon: 'Home' },
  { name: 'Insurance', category: 'Insurance', color: '#8B5CF6', icon: 'Shield' },
  { name: 'Financial Documents', category: 'Financial Documents', color: '#F59E0B', icon: 'Coins' },
  { name: 'Legal Documents', category: 'Legal Documents', color: '#EC4899', icon: 'Scale' },
  { name: 'Medical Documents', category: 'Medical Documents', color: '#EF4444', icon: 'Activity' },
  { name: 'Other', category: 'Other', color: '#6B7280', icon: 'Folder' },
];

export class VaultService {
  /**
   * Automatically initializes the 7 standard category folders for a user on first access,
   * and self-heals by deduplicating any duplicate root folders.
   */
  static async ensureDefaultFolders(userId: string): Promise<void> {
    // 1. Fetch all existing non-deleted root folders for this user
    const existingFolders = await prisma.vaultFolder.findMany({
      where: { userId, parentId: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const seenNames = new Map<string, string>();
    const duplicateIdsToDelete: string[] = [];

    for (const folder of existingFolders) {
      if (seenNames.has(folder.name)) {
        const canonicalId = seenNames.get(folder.name)!;
        await prisma.vaultDocument.updateMany({
          where: { folderId: folder.id },
          data: { folderId: canonicalId },
        });
        await prisma.vaultFolder.updateMany({
          where: { parentId: folder.id },
          data: { parentId: canonicalId },
        });
        duplicateIdsToDelete.push(folder.id);
      } else {
        seenNames.set(folder.name, folder.id);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      logger.info(`Deduplicating ${duplicateIdsToDelete.length} duplicate folders for user ${userId}`);
      await prisma.vaultFolder.deleteMany({
        where: { id: { in: duplicateIdsToDelete } },
      });
    }

    // 2. Create missing default folders
    for (const def of DEFAULT_FOLDERS) {
      if (!seenNames.has(def.name)) {
        try {
          const created = await prisma.vaultFolder.create({
            data: {
              userId,
              name: def.name,
              category: def.category,
              isDefault: true,
              color: def.color,
              icon: def.icon,
            },
          });
          seenNames.set(def.name, created.id);
        } catch (err) {
          logger.warn(`Could not create default folder ${def.name}:`, err);
        }
      }
    }
  }

  /**
   * Returns a comprehensive dashboard summary for the user's vault.
   */
  static async getDashboardSummary(userId: string) {
    await this.ensureDefaultFolders(userId);

    const [folders, documents, sharedWithOthersCount, sharedWithMeCount] = await Promise.all([
      prisma.vaultFolder.findMany({
        where: { userId, deletedAt: null },
        include: {
          _count: {
            select: { documents: true },
          },
        },
      }),
      prisma.vaultDocument.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vaultShare.count({
        where: { ownerId: userId, status: 'active' },
      }),
      prisma.vaultShare.count({
        where: { sharedWithUserId: userId, status: 'active' },
      }),
    ]);

    const totalStorageBytes = documents.reduce((acc, doc) => acc + (doc.fileSize || 0), 0);

    const categoryBreakdown: Record<string, number> = {};
    DEFAULT_FOLDERS.forEach((df) => {
      categoryBreakdown[df.name] = 0;
    });

    documents.forEach((doc) => {
      const cat = doc.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    });

    // Deduplicate folder count
    const uniqueRootNames = new Set(folders.filter(f => !f.parentId).map(f => f.name));
    const subfolderCount = folders.filter(f => !!f.parentId).length;
    const totalFolders = uniqueRootNames.size + subfolderCount;

    // Identify documents expiring within the next 45 days
    const now = new Date();
    const futureThreshold = new Date();
    futureThreshold.setDate(now.getDate() + 45);

    const expiringDocuments = documents.filter((doc) => {
      if (!doc.expiryDate) return false;
      const exp = new Date(doc.expiryDate);
      return exp >= now && exp <= futureThreshold;
    });

    return {
      totalDocuments: documents.length,
      totalFolders,
      totalStorageBytes,
      storageLimitBytes: VAULT_STORAGE_LIMIT_BYTES,
      sharedWithOthersCount,
      sharedWithMeCount,
      categoryBreakdown,
      expiringDocuments: expiringDocuments.slice(0, 10),
      recentlyAdded: documents.slice(0, 10),
    };
  }

  /**
   * Retrieves all folders and their subfolder structure.
   */
  static async getFolders(userId: string) {
    await this.ensureDefaultFolders(userId);

    const folders = await prisma.vaultFolder.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { documents: true, subfolders: true },
        },
      },
    });

    // Ensure distinct folders by id and by name (for root folders)
    const uniqueFolders: typeof folders = [];
    const seen = new Set<string>();
    for (const f of folders) {
      const key = f.parentId ? `${f.parentId}:${f.name}` : f.name;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueFolders.push(f);
      }
    }

    return uniqueFolders;
  }

  /**
   * Creates a new custom folder or subfolder.
   */
  static async createFolder(userId: string, dto: CreateFolderDTO, ip?: string, ua?: string) {
    if (dto.parentId) {
      const parent = await prisma.vaultFolder.findFirst({
        where: { id: dto.parentId, userId, deletedAt: null },
      });
      if (!parent) {
        throw AppError.badRequest('Parent folder does not exist or access denied');
      }
    }

    const folder = await prisma.vaultFolder.create({
      data: {
        userId,
        name: dto.name.trim(),
        category: dto.category?.trim() || 'Other',
        parentId: dto.parentId || null,
        color: dto.color || '#6B7280',
        icon: dto.icon || 'Folder',
        isDefault: false,
      },
    });

    await recordVaultAuditLog({
      ownerId: userId,
      actorId: userId,
      action: 'FOLDER_CREATE',
      folderId: folder.id,
      details: `Created folder "${folder.name}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return folder;
  }

  /**
   * Updates an existing folder.
   */
  static async updateFolder(userId: string, folderId: string, dto: UpdateFolderDTO, ip?: string, ua?: string) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { id: folderId, userId, deletedAt: null },
    });
    if (!folder) {
      throw AppError.notFound('Folder not found');
    }

    if (dto.parentId) {
      if (dto.parentId === folderId) {
        throw AppError.badRequest('Folder cannot be its own parent');
      }
      const parent = await prisma.vaultFolder.findFirst({
        where: { id: dto.parentId, userId, deletedAt: null },
      });
      if (!parent) {
        throw AppError.badRequest('Target parent folder does not exist');
      }
    }

    const updated = await prisma.vaultFolder.update({
      where: { id: folderId },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        parentId: dto.parentId !== undefined ? dto.parentId : undefined,
        color: dto.color,
        icon: dto.icon,
      },
    });

    await recordVaultAuditLog({
      ownerId: userId,
      actorId: userId,
      action: 'FOLDER_RENAME',
      folderId: updated.id,
      details: `Updated folder "${updated.name}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return updated;
  }

  /**
   * Deletes a folder.
   */
  static async deleteFolder(userId: string, folderId: string, ip?: string, ua?: string) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { id: folderId, userId, deletedAt: null },
      include: {
        _count: {
          select: { documents: true, subfolders: true },
        },
      },
    });

    if (!folder) {
      throw AppError.notFound('Folder not found');
    }

    if (folder.isDefault) {
      throw AppError.badRequest('Default system folders cannot be deleted');
    }

    // Move any contained documents to root folder (folderId: null) rather than orphaning them
    await prisma.vaultDocument.updateMany({
      where: { folderId },
      data: { folderId: null },
    });

    // Soft delete the folder
    await prisma.vaultFolder.update({
      where: { id: folderId },
      data: { deletedAt: new Date() },
    });

    await recordVaultAuditLog({
      ownerId: userId,
      actorId: userId,
      action: 'FOLDER_DELETE',
      folderId,
      details: `Deleted folder "${folder.name}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return { success: true, message: 'Folder deleted successfully' };
  }

  /**
   * Lists documents with filtering and search.
   */
  static async getDocuments(
    userId: string,
    query: {
      folderId?: string;
      category?: string;
      search?: string;
      tag?: string;
      isSensitive?: boolean;
      expiringSoon?: boolean;
    },
  ) {
    const where: any = {
      userId,
      deletedAt: null,
    };

    if (query.folderId) {
      where.folderId = query.folderId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.isSensitive !== undefined) {
      where.isSensitive = query.isSensitive;
    }

    if (query.expiringSoon) {
      const now = new Date();
      const future = new Date();
      future.setDate(now.getDate() + 45);
      where.expiryDate = { gte: now, lte: future };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { institution: { contains: s, mode: 'insensitive' } },
        { documentNumber: { contains: s, mode: 'insensitive' } },
        { originalFileName: { contains: s, mode: 'insensitive' } },
      ];
    }

    return prisma.vaultDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        folder: {
          select: { id: true, name: true, category: true, color: true },
        },
        _count: {
          select: { versions: true, shares: true },
        },
      },
    });
  }

  /**
   * Uploads and encrypts a new document.
   */
  /**
   * Returns the total storage used by a user in bytes.
   */
  static async getStorageUsage(userId: string): Promise<{ usedBytes: number; limitBytes: number; remainingBytes: number }> {
    const result = await prisma.vaultDocument.aggregate({
      where: { userId, deletedAt: null },
      _sum: { fileSize: true },
    });
    const usedBytes = result._sum.fileSize || 0;
    return {
      usedBytes,
      limitBytes: VAULT_STORAGE_LIMIT_BYTES,
      remainingBytes: Math.max(0, VAULT_STORAGE_LIMIT_BYTES - usedBytes),
    };
  }

  /**
   * Uploads and encrypts a new document.
   */
  static async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDTO,
    ip?: string,
    ua?: string,
  ) {
    if (!file || !file.buffer) {
      throw AppError.badRequest('No document file uploaded');
    }

    if (file.size > MAX_VAULT_FILE_SIZE) {
      throw AppError.badRequest(`File exceeds the maximum limit of ${MAX_VAULT_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw AppError.badRequest(`Unsupported file format: ${file.mimetype}. Supported: PDF, JPG, PNG, WEBP, DOCX.`);
    }

    // Enforce 500 MB per-user storage quota
    const { usedBytes } = await this.getStorageUsage(userId);
    if (usedBytes + file.size > VAULT_STORAGE_LIMIT_BYTES) {
      const usedMB = (usedBytes / 1024 / 1024).toFixed(1);
      const limitMB = (VAULT_STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0);
      throw AppError.badRequest(
        `Storage limit exceeded. You have used ${usedMB} MB of ${limitMB} MB. Please delete unused documents to free up space.`,
      );
    }

    let folderId = dto.folderId || null;
    if (folderId) {
      const folder = await prisma.vaultFolder.findFirst({
        where: { id: folderId, userId, deletedAt: null },
      });
      if (!folder) folderId = null;
    }

    const documentId = crypto.randomUUID();
    const originalFileName = file.originalname || 'document';

    // Store encrypted file
    const { storagePath, isEncrypted } = await storeEncryptedVaultFile(
      userId,
      documentId,
      file.buffer,
      originalFileName,
    );

    const createdDoc = await prisma.vaultDocument.create({
      data: {
        id: documentId,
        userId,
        folderId,
        title: dto.title.trim() || originalFileName,
        originalFileName,
        fileType: file.mimetype,
        fileSize: file.size,
        storagePath,
        isEncrypted,
        category: dto.category || 'Personal Documents',
        description: dto.description?.trim() || null,
        tags: Array.isArray(dto.tags) ? dto.tags : [],
        institution: dto.institution?.trim() || null,
        documentNumber: dto.documentNumber?.trim() || null,
        expiryDate: (dto.expiryDate && !isNaN(new Date(dto.expiryDate).getTime())) ? new Date(dto.expiryDate) : null,
        renewalDate: (dto.renewalDate && !isNaN(new Date(dto.renewalDate).getTime())) ? new Date(dto.renewalDate) : null,
        reminderDate: (dto.reminderDate && !isNaN(new Date(dto.reminderDate).getTime())) ? new Date(dto.reminderDate) : null,
        currentVersion: 1,
        isSensitive: Boolean(dto.isSensitive),
        versions: {
          create: {
            versionNumber: 1,
            fileName: originalFileName,
            storagePath,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: userId,
            note: 'Initial upload',
          },
        },
      },
      include: {
        folder: true,
        versions: true,
      },
    });

    await recordVaultAuditLog({
      ownerId: userId,
      actorId: userId,
      action: 'UPLOAD',
      documentId: createdDoc.id,
      folderId,
      details: `Uploaded document "${createdDoc.title}" (${originalFileName})`,
      ipAddress: ip,
      userAgent: ua,
    });

    return createdDoc;
  }

  /**
   * Uploads a new version of an existing document.
   */
  static async uploadNewVersion(
    actorId: string,
    documentId: string,
    file: Express.Multer.File,
    note?: string,
    ip?: string,
    ua?: string,
  ) {
    const auth = await authorizeDocumentAccess(actorId, documentId, 'editor');
    if (!auth.authorized) {
      await recordVaultAuditLog({
        ownerId: auth.ownerId,
        actorId,
        action: 'ACCESS_DENIED',
        documentId,
        details: 'Attempted to upload new version without editor permission',
        ipAddress: ip,
        userAgent: ua,
      });
      throw AppError.forbidden('You do not have permission to update this document');
    }

    const doc = await prisma.vaultDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!doc) throw AppError.notFound('Document not found');

    const nextVersion = doc.currentVersion + 1;
    const originalFileName = file.originalname || doc.originalFileName;

    // Encrypt and store under document owner's key
    const { storagePath } = await storeEncryptedVaultFile(
      doc.userId,
      `${documentId}_v${nextVersion}`,
      file.buffer,
      originalFileName,
    );

    await prisma.vaultDocumentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: nextVersion,
        fileName: originalFileName,
        storagePath,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: actorId,
        note: note?.trim() || `Version ${nextVersion}`,
      },
    });

    const updatedDoc = await prisma.vaultDocument.update({
      where: { id: documentId },
      data: {
        currentVersion: nextVersion,
        originalFileName,
        fileSize: file.size,
        fileType: file.mimetype,
        storagePath,
      },
      include: {
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    await recordVaultAuditLog({
      ownerId: doc.userId,
      actorId,
      action: 'UPDATE',
      documentId: doc.id,
      details: `Uploaded Version ${nextVersion} for "${doc.title}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return updatedDoc;
  }

  /**
   * Retrieves single document metadata.
   */
  static async getDocument(actorId: string, documentId: string, ip?: string, ua?: string) {
    const auth = await authorizeDocumentAccess(actorId, documentId, 'viewer');
    if (!auth.authorized) {
      await recordVaultAuditLog({
        ownerId: auth.ownerId,
        actorId,
        action: 'ACCESS_DENIED',
        documentId,
        details: 'Attempted unauthorized document view',
        ipAddress: ip,
        userAgent: ua,
      });
      throw AppError.forbidden('Access denied to this document');
    }

    const doc = await prisma.vaultDocument.findFirst({
      where: { id: documentId, deletedAt: null },
      include: {
        folder: true,
        versions: { orderBy: { versionNumber: 'desc' } },
        shares: {
          where: { status: 'active' },
          include: {
            sharedWithUser: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!doc) throw AppError.notFound('Document not found');

    await recordVaultAuditLog({
      ownerId: doc.userId,
      actorId,
      action: 'VIEW',
      documentId: doc.id,
      details: `Viewed metadata of "${doc.title}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return {
      ...doc,
      userRole: auth.role,
      canDownload: auth.canDownload,
    };
  }

  /**
   * Updates document metadata.
   */
  static async updateDocument(
    actorId: string,
    documentId: string,
    dto: UpdateDocumentDTO,
    ip?: string,
    ua?: string,
  ) {
    const auth = await authorizeDocumentAccess(actorId, documentId, 'editor');
    if (!auth.authorized) {
      throw AppError.forbidden('You do not have permission to edit this document');
    }

    const doc = await prisma.vaultDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!doc) throw AppError.notFound('Document not found');

    const updated = await prisma.vaultDocument.update({
      where: { id: documentId },
      data: {
        title: dto.title ? dto.title.trim() : undefined,
        folderId: dto.folderId !== undefined ? dto.folderId : undefined,
        category: dto.category ? dto.category.trim() : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        tags: Array.isArray(dto.tags) ? dto.tags : undefined,
        institution: dto.institution !== undefined ? dto.institution : undefined,
        documentNumber: dto.documentNumber !== undefined ? dto.documentNumber : undefined,
        expiryDate: dto.expiryDate !== undefined ? (dto.expiryDate ? new Date(dto.expiryDate) : null) : undefined,
        renewalDate: dto.renewalDate !== undefined ? (dto.renewalDate ? new Date(dto.renewalDate) : null) : undefined,
        reminderDate: dto.reminderDate !== undefined ? (dto.reminderDate ? new Date(dto.reminderDate) : null) : undefined,
        isSensitive: dto.isSensitive !== undefined ? dto.isSensitive : undefined,
      },
    });

    await recordVaultAuditLog({
      ownerId: doc.userId,
      actorId,
      action: 'UPDATE',
      documentId: doc.id,
      details: `Updated metadata for "${updated.title}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return updated;
  }

  /**
   * Deletes a document (owner only).
   */
  static async deleteDocument(actorId: string, documentId: string, ip?: string, ua?: string) {
    const auth = await authorizeDocumentAccess(actorId, documentId, 'owner');
    if (!auth.authorized || auth.role !== 'owner') {
      throw AppError.forbidden('Only the document owner can delete this document');
    }

    const doc = await prisma.vaultDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!doc) throw AppError.notFound('Document not found');

    await prisma.vaultDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    await recordVaultAuditLog({
      ownerId: doc.userId,
      actorId,
      action: 'DELETE',
      documentId: doc.id,
      details: `Deleted document "${doc.title}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return { success: true, message: 'Document deleted' };
  }

  /**
   * Streams decrypted document buffer for preview or download.
   */
  static async streamDocumentFile(
    actorId: string,
    documentId: string,
    isDownload = false,
    ip?: string,
    ua?: string,
  ) {
    const auth = await authorizeDocumentAccess(actorId, documentId, 'viewer');
    if (!auth.authorized) {
      await recordVaultAuditLog({
        ownerId: auth.ownerId,
        actorId,
        action: 'ACCESS_DENIED',
        documentId,
        details: `Unauthorized attempt to ${isDownload ? 'download' : 'preview'} document`,
        ipAddress: ip,
        userAgent: ua,
      });
      throw AppError.forbidden('Access denied to this document');
    }

    if (isDownload && !auth.canDownload) {
      throw AppError.forbidden('Download permission not granted for this document');
    }

    const doc = await prisma.vaultDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!doc) throw AppError.notFound('Document not found');

    // Decrypt in server memory
    const decryptedBuffer = await fetchDecryptedVaultFile(
      doc.userId,
      doc.id,
      doc.storagePath,
      doc.isEncrypted,
    );

    await recordVaultAuditLog({
      ownerId: doc.userId,
      actorId,
      action: isDownload ? 'DOWNLOAD' : 'VIEW',
      documentId: doc.id,
      details: `${isDownload ? 'Downloaded' : 'Previewed'} document "${doc.title}"`,
      ipAddress: ip,
      userAgent: ua,
    });

    return {
      buffer: decryptedBuffer,
      contentType: doc.fileType,
      fileName: doc.originalFileName,
    };
  }

  /**
   * Creates an explicit share grant for a document or folder.
   */
  static async createShare(ownerId: string, dto: CreateShareDTO, ip?: string, ua?: string) {
    // 1. Resolve recipient user
    const recipient = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: dto.sharedWithUserEmailOrId.trim(), mode: 'insensitive' } },
          { id: dto.sharedWithUserEmailOrId.trim() },
        ],
      },
    });

    if (!recipient) {
      throw AppError.notFound('Recipient user with that email or ID was not found in Kanakku');
    }

    if (recipient.id === ownerId) {
      throw AppError.badRequest('You cannot share a document with yourself');
    }

    // 2. Validate ownership of entity
    if (dto.documentId) {
      const doc = await prisma.vaultDocument.findFirst({
        where: { id: dto.documentId, userId: ownerId, deletedAt: null },
      });
      if (!doc) throw AppError.notFound('Document not found or you are not the owner');
    }

    if (dto.folderId) {
      const folder = await prisma.vaultFolder.findFirst({
        where: { id: dto.folderId, userId: ownerId, deletedAt: null },
      });
      if (!folder) throw AppError.notFound('Folder not found or you are not the owner');
    }

    // 3. Upsert share
    const existing = await prisma.vaultShare.findFirst({
      where: {
        ownerId,
        sharedWithUserId: recipient.id,
        documentId: dto.documentId || null,
        folderId: dto.folderId || null,
      },
    });

    let share;
    if (existing) {
      share = await prisma.vaultShare.update({
        where: { id: existing.id },
        data: {
          permission: dto.permission,
          canDownload: dto.canDownload !== undefined ? dto.canDownload : true,
          status: 'active',
          revokedAt: null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
    } else {
      share = await prisma.vaultShare.create({
        data: {
          ownerId,
          sharedWithUserId: recipient.id,
          documentId: dto.documentId || null,
          folderId: dto.folderId || null,
          permission: dto.permission,
          canDownload: dto.canDownload !== undefined ? dto.canDownload : true,
          status: 'active',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
    }

    await recordVaultAuditLog({
      ownerId,
      actorId: ownerId,
      action: 'SHARE_GRANT',
      documentId: dto.documentId || null,
      folderId: dto.folderId || null,
      details: `Granted ${dto.permission} access to ${recipient.name} (${recipient.email})`,
      ipAddress: ip,
      userAgent: ua,
    });

    return share;
  }

  /**
   * Updates an active share.
   */
  static async updateShare(ownerId: string, shareId: string, dto: UpdateShareDTO, ip?: string, ua?: string) {
    const share = await prisma.vaultShare.findFirst({
      where: { id: shareId, ownerId },
    });
    if (!share) throw AppError.notFound('Share record not found');

    const updated = await prisma.vaultShare.update({
      where: { id: shareId },
      data: {
        permission: dto.permission || share.permission,
        canDownload: dto.canDownload !== undefined ? dto.canDownload : share.canDownload,
        expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : share.expiresAt,
      },
    });

    await recordVaultAuditLog({
      ownerId,
      actorId: ownerId,
      action: 'PERMISSION_CHANGE',
      documentId: share.documentId,
      folderId: share.folderId,
      details: `Updated share permission to ${updated.permission} (download: ${updated.canDownload})`,
      ipAddress: ip,
      userAgent: ua,
    });

    return updated;
  }

  /**
   * Immediately revokes a share grant.
   */
  static async revokeShare(ownerId: string, shareId: string, ip?: string, ua?: string) {
    const share = await prisma.vaultShare.findFirst({
      where: { id: shareId, ownerId },
    });
    if (!share) throw AppError.notFound('Share record not found');

    await prisma.vaultShare.update({
      where: { id: shareId },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
      },
    });

    await recordVaultAuditLog({
      ownerId,
      actorId: ownerId,
      action: 'SHARE_REVOKE',
      documentId: share.documentId,
      folderId: share.folderId,
      details: `Immediately revoked access for share ${shareId}`,
      ipAddress: ip,
      userAgent: ua,
    });

    return { success: true, message: 'Share access revoked immediately' };
  }

  /**
   * Retrieves all active shares created by the owner.
   */
  static async getOwnerShares(ownerId: string) {
    return prisma.vaultShare.findMany({
      where: { ownerId, status: 'active' },
      include: {
        sharedWithUser: {
          select: { id: true, name: true, email: true },
        },
        document: {
          select: { id: true, title: true, category: true, originalFileName: true },
        },
        folder: {
          select: { id: true, name: true, category: true, color: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * Retrieves items shared with the current user.
   */
  static async getSharedWithMe(userId: string) {
    const now = new Date();
    const shares = await prisma.vaultShare.findMany({
      where: {
        sharedWithUserId: userId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        document: {
          select: {
            id: true,
            title: true,
            category: true,
            originalFileName: true,
            fileType: true,
            fileSize: true,
            expiryDate: true,
            currentVersion: true,
            updatedAt: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
            category: true,
            color: true,
            icon: true,
            _count: { select: { documents: true } },
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return shares;
  }

  /**
   * Retrieves the immutable audit logs for the user's vault.
   */
  static async getAuditLogs(userId: string) {
    return prisma.vaultAuditLog.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
        document: {
          select: { id: true, title: true },
        },
        folder: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Manages Vault Lock settings.
   */
  static async getLockSetting(userId: string) {
    let setting = await prisma.vaultLockSetting.findUnique({
      where: { userId },
    });

    if (!setting) {
      setting = await prisma.vaultLockSetting.create({
        data: {
          userId,
          isLockEnabled: false,
          pinLength: 6,
          autoLockMinutes: 5,
        },
      });
    }

    return {
      isLockEnabled: setting.isLockEnabled,
      hasPin: Boolean(setting.vaultPinHash),
      autoLockMinutes: setting.autoLockMinutes,
      lastUnlockedAt: setting.lastUnlockedAt,
      pinLength: setting.pinLength || 6,
    };
  }

  static async configureLock(userId: string, dto: ConfigureLockDTO) {
    let vaultPinHash: string | undefined = undefined;
    let pinLength: number | undefined = undefined;
    if (dto.vaultPin) {
      vaultPinHash = await bcrypt.hash(dto.vaultPin, 10);
      pinLength = dto.vaultPin.length;
    }

    const setting = await prisma.vaultLockSetting.upsert({
      where: { userId },
      update: {
        isLockEnabled: dto.isLockEnabled,
        ...(vaultPinHash ? { vaultPinHash, pinLength } : {}),
        autoLockMinutes: dto.autoLockMinutes || 5,
      },
      create: {
        userId,
        isLockEnabled: dto.isLockEnabled,
        vaultPinHash: vaultPinHash || null,
        pinLength: pinLength || 6,
        autoLockMinutes: dto.autoLockMinutes || 5,
      },
    });

    return {
      isLockEnabled: setting.isLockEnabled,
      hasPin: Boolean(setting.vaultPinHash),
      autoLockMinutes: setting.autoLockMinutes,
      pinLength: setting.pinLength || 6,
    };
  }

  static async verifyLock(userId: string, pin: string) {
    const setting = await prisma.vaultLockSetting.findUnique({
      where: { userId },
    });

    if (!setting || !setting.vaultPinHash) {
      // If no dedicated PIN, allow unlock
      return { verified: true, unlockedAt: new Date() };
    }

    // 1. Check dedicated Vault PIN
    let match = await bcrypt.compare(pin, setting.vaultPinHash);

    // 2. If dedicated PIN doesn't match, also verify against primary Kanaku entry PIN
    if (!match) {
      try {
        const { pinService } = await import('../pin/pin.service');
        const appPinRes = await pinService.verifyPin({ userId, pin });
        if (appPinRes.success) {
          match = true;
        }
      } catch {
        // ignore
      }
    }

    if (!match) {
      return { verified: false, message: 'Incorrect PIN. Please try again.' };
    }

    await prisma.vaultLockSetting.update({
      where: { userId },
      data: { lastUnlockedAt: new Date() },
    });

    return { verified: true, unlockedAt: new Date() };
  }

  static async resetLockPin(userId: string, newPin?: string) {
    let vaultPinHash: string | null = null;
    let pinLength = 6;
    if (newPin && typeof newPin === 'string' && newPin.length >= 4) {
      vaultPinHash = await bcrypt.hash(newPin, 10);
      pinLength = newPin.length;
    }

    const setting = await prisma.vaultLockSetting.upsert({
      where: { userId },
      update: {
        vaultPinHash,
        pinLength,
        isLockEnabled: Boolean(vaultPinHash),
        lastUnlockedAt: new Date(),
      },
      create: {
        userId,
        vaultPinHash,
        pinLength,
        isLockEnabled: Boolean(vaultPinHash),
        lastUnlockedAt: new Date(),
      },
    });

    await recordVaultAuditLog({
      ownerId: userId,
      actorId: userId,
      action: 'LOCK_SETUP',
      details: vaultPinHash ? 'Vault PIN reset via verified OTP' : 'Vault Lock reset via verified OTP',
    });

    return {
      success: true,
      message: 'Vault PIN reset successfully',
      isLockEnabled: setting.isLockEnabled,
      hasPin: Boolean(setting.vaultPinHash),
      pinLength: setting.pinLength || 6,
    };
  }
}
