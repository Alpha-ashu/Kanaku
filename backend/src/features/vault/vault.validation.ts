import { z } from 'zod';

export const vaultIdParamSchema = z
  .object({
    id: z.string().min(1).max(100),
  })
  .passthrough();

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(100),
  category: z.string().trim().max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(30).optional(),
  icon: z.string().max(50).optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(30).optional(),
  icon: z.string().max(50).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
  category: z.string().trim().max(100).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().trim().max(50)).optional(),
  institution: z.string().trim().max(150).optional(),
  documentNumber: z.string().trim().max(150).optional(),
  expiryDate: z.string().datetime({ offset: true }).nullable().optional(),
  renewalDate: z.string().datetime({ offset: true }).nullable().optional(),
  reminderDate: z.string().datetime({ offset: true }).nullable().optional(),
  isSensitive: z.boolean().optional(),
});

export const createShareSchema = z
  .object({
    sharedWithUserEmailOrId: z.string().trim().min(1, 'Target user email or ID is required'),
    documentId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    permission: z.enum(['viewer', 'editor']).default('viewer'),
    canDownload: z.boolean().default(true),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((data) => data.documentId || data.folderId, {
    message: 'Either documentId or folderId must be provided to share',
  });

export const updateShareSchema = z.object({
  permission: z.enum(['viewer', 'editor']).optional(),
  canDownload: z.boolean().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const configureLockSchema = z.object({
  isLockEnabled: z.boolean(),
  vaultPin: z.string().min(4).max(12).optional(),
  autoLockMinutes: z.number().int().min(1).max(120).optional(),
});

export const verifyLockSchema = z.object({
  vaultPin: z.string().min(4).max(12),
});

export const batchMoveSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1, 'At least one document ID required'),
  folderId: z.string().uuid().nullable().optional(),
});
