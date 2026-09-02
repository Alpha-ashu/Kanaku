import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { validateBillUpload, makeStoragePath } from '../../utils/uploadPolicy';
import { processImage } from '../../utils/imageProcessing';
import { scanBufferForViruses } from '../../utils/virusScan';
import { moderateImage } from '../../utils/moderation';
import { createSignedUrl, uploadBuffer, removeObject } from '../../utils/storage';

const hashBuffer = (buffer: Buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

export const getBills = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactionId = req.query.transactionId ? String(req.query.transactionId) : undefined;

    const bills = await prisma.expenseBill.findMany({
      where: {
        userId,
        ...(transactionId ? { transactionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const withUrls = await Promise.all(
      bills.map(async (bill) => {
        let signedUrl: string | null = null;
        try {
          signedUrl = await createSignedUrl(bill.storagePath);
        } catch (error: any) {
          logger.warn('Failed to create signed url', { billId: bill.id, error: error?.message || error });
        }

        return {
          id: bill.id,
          transactionId: bill.transactionId,
          fileName: bill.originalName,
          fileType: bill.contentType,
          fileSize: bill.size,
          uploadedAt: bill.createdAt,
          downloadUrl: signedUrl,
        };
      }),
    );

    res.json(withUrls);
  } catch (error: any) {
    next(error);
  }
};

export const getBill = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const bill = await prisma.expenseBill.findFirst({ where: { id, userId } });
    if (!bill) {
      throw AppError.notFound('Bill');
    }

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await createSignedUrl(bill.storagePath);
    } catch (error: any) {
      logger.warn('Failed to create signed url', { billId: bill.id, error: error?.message || error });
    }

    res.json({
      id: bill.id,
      transactionId: bill.transactionId,
      fileName: bill.originalName,
      fileType: bill.contentType,
      fileSize: bill.size,
      uploadedAt: bill.createdAt,
      downloadUrl,
    });
  } catch (error: any) {
    next(error);
  }
};

export const uploadBill = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactionIdRaw = req.body.transactionId ? String(req.body.transactionId).trim() : undefined;
    const file = req.file;

    if (!file) {
      throw AppError.badRequest('File is required', 'FILE_REQUIRED');
    }

    logger.info('UPLOAD_STARTED', { userId, originalName: file.originalname, size: file.size });

    let resolvedTransactionId: string | null = null;
    if (transactionIdRaw) {
      const linkedTransaction = await prisma.transaction.findFirst({
        where: {
          id: transactionIdRaw,
          userId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (linkedTransaction) {
        resolvedTransactionId = linkedTransaction.id;
      } else {
        // If the transaction is not found by ID (e.g. client provided local numeric ID or un-synced row),
        // we do NOT fail the upload. We accept the file into the user's secure storage so it is never lost.
        logger.info('UPLOAD_UNLINKED_PENDING', { userId, providedTransactionId: transactionIdRaw });
      }
    }

    const validated = await validateBillUpload(file);
    let buffer = validated.buffer;
    let contentType = validated.contentType;
    let extension = validated.extension;

    let moderationStatus = 'skipped';
    if (validated.kind === 'image') {
      const processed = await processImage(buffer);
      buffer = processed.buffer;
      contentType = processed.contentType;
      extension = processed.extension;

      const moderation = await moderateImage(buffer, contentType);
      moderationStatus = moderation.status;
      if (moderation.status === 'rejected') {
        logger.warn('UPLOAD_FAILED', { userId, reason: 'MODERATION_REJECTED' });
        throw AppError.badRequest('Image rejected by moderation', 'MODERATION_REJECTED');
      }
    }

    const scanResult = await scanBufferForViruses(buffer);
    if (scanResult.status === 'infected') {
      logger.warn('UPLOAD_FAILED', { userId, reason: 'VIRUS_SCAN_FAILED' });
      throw AppError.badRequest('File failed virus scan', 'VIRUS_SCAN_FAILED');
    }

    const fileSha256 = hashBuffer(buffer);

    // Idempotency: check if identical file already exists for this user
    const existingBill = await prisma.expenseBill.findFirst({
      where: {
        userId,
        sha256: fileSha256,
        ...(resolvedTransactionId ? { transactionId: resolvedTransactionId } : {}),
      },
    });

    if (existingBill) {
      logger.info('UPLOAD_DEDUPLICATED', { userId, billId: existingBill.id, sha256: fileSha256 });
      let downloadUrl: string | null = null;
      try {
        downloadUrl = await createSignedUrl(existingBill.storagePath);
      } catch {
        // ignore
      }

      return res.status(200).json({
        id: existingBill.id,
        transactionId: existingBill.transactionId,
        fileName: existingBill.originalName,
        fileType: existingBill.contentType,
        fileSize: existingBill.size,
        uploadedAt: existingBill.createdAt,
        downloadUrl,
        deduplicated: true,
      });
    }

    const baseName = validated.originalName.replace(/\.[^/.]+$/, '');
    const displayName = `${baseName}.${extension}`;
    const storagePath = makeStoragePath(userId, extension, resolvedTransactionId);
    await uploadBuffer(storagePath, buffer, contentType);

    const bill = await prisma.expenseBill.create({
      data: {
        userId,
        transactionId: resolvedTransactionId,
        originalName: displayName,
        contentType,
        size: buffer.length,
        storagePath,
        sha256: fileSha256,
        scanStatus: scanResult.status,
        scanResult: scanResult.details,
        moderationStatus,
      },
    });

    logger.info('ATTACHMENT_DB_CREATED', {
      userId,
      billId: bill.id,
      storagePath,
      contentType,
      size: buffer.length,
    });
    logger.info('UPLOAD_SUCCESS', { userId, billId: bill.id });

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await createSignedUrl(storagePath);
    } catch (error: any) {
      logger.warn('Signed url creation failed after upload', { billId: bill.id, error: error?.message || error });
    }

    return res.status(201).json({
      id: bill.id,
      transactionId: bill.transactionId,
      fileName: bill.originalName,
      fileType: bill.contentType,
      fileSize: bill.size,
      uploadedAt: bill.createdAt,
      downloadUrl,
    });
  } catch (error: any) {
    logger.error('UPLOAD_FAILED', { error: error?.message || error });
    next(error);
  }
};

/**
 * GET /api/v1/bills/:id/file
 *
 * Authenticated streaming/download endpoint. Strictly verifies that the bill
 * belongs to the authenticated user. Streams the stored binary with appropriate
 * headers, or redirects to a fresh storage signed URL.
 */
export const getFile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const bill = await prisma.expenseBill.findFirst({
      where: { id, userId },
    });

    if (!bill) {
      logger.warn('ATTACHMENT_DOWNLOAD_FAILED', { userId, billId: id, reason: 'NOT_FOUND_OR_UNAUTHORIZED' });
      throw AppError.notFound('Bill');
    }

    // 1. Try to fetch a fresh signed URL (e.g. Supabase)
    const signedUrl = await createSignedUrl(bill.storagePath);
    if (signedUrl && signedUrl.startsWith('http')) {
      logger.info('ATTACHMENT_DOWNLOAD_SUCCESS', { userId, billId: id, mode: 'redirect' });
      return res.redirect(302, signedUrl);
    }

    // 2. Stream directly from storage/local disk
    const { downloadBuffer } = await import('../../utils/storage');
    const downloaded = await downloadBuffer(bill.storagePath);
    if (!downloaded || !downloaded.buffer) {
      logger.error('ATTACHMENT_DOWNLOAD_FAILED', { userId, billId: id, reason: 'STORAGE_OBJECT_MISSING' });
      throw AppError.notFound('Attachment file content');
    }

    res.setHeader('Content-Type', downloaded.contentType || bill.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', downloaded.buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(bill.originalName)}"`);

    logger.info('ATTACHMENT_DOWNLOAD_SUCCESS', { userId, billId: id, bytes: downloaded.buffer.length });
    return res.send(downloaded.buffer);
  } catch (error: any) {
    next(error);
  }
};

export const deleteBill = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const bill = await prisma.expenseBill.findFirst({
      where: { id, userId },
    });

    if (!bill) {
      throw AppError.notFound('Bill');
    }

    try {
      await removeObject(bill.storagePath);
    } catch (error: any) {
      logger.warn('Failed to remove object from storage', { billId: bill.id, error: error?.message || error });
    }

    await prisma.expenseBill.delete({ where: { id } });

    // Unlink transaction attachment if pointed to this bill
    await prisma.transaction.updateMany({
      where: {
        userId,
        OR: [
          { attachment: id },
          { attachment: `bill:${id}` },
        ],
      },
      data: {
        attachment: null,
      },
    }).catch(() => {});

    logger.info('ATTACHMENT_DELETE_SYNCED', { userId, billId: id });

    return res.json({ message: 'Bill deleted' });
  } catch (error: any) {
    next(error);
  }
};
