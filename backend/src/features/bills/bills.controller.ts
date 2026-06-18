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
    const transactionId = req.body.transactionId ? String(req.body.transactionId).trim() : undefined;
    const file = req.file;

    if (!file) {
      throw AppError.badRequest('File is required', 'FILE_REQUIRED');
    }

    if (transactionId) {
      const linkedTransaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!linkedTransaction) {
        throw AppError.forbidden('Unauthorized transaction reference', 'UNAUTHORIZED_TRANSACTION_REF');
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
        throw AppError.badRequest('Image rejected by moderation', 'MODERATION_REJECTED');
      }
    }

    const scanResult = await scanBufferForViruses(buffer);
    if (scanResult.status === 'infected') {
      throw AppError.badRequest('File failed virus scan', 'VIRUS_SCAN_FAILED');
    }

    const baseName = validated.originalName.replace(/\.[^/.]+$/, '');
    const displayName = `${baseName}.${extension}`;
    const storagePath = makeStoragePath(userId, extension, transactionId);
    await uploadBuffer(storagePath, buffer, contentType);

    const bill = await prisma.expenseBill.create({
      data: {
        userId,
        transactionId,
        originalName: displayName,
        contentType,
        size: buffer.length,
        storagePath,
        sha256: hashBuffer(buffer),
        scanStatus: scanResult.status,
        scanResult: scanResult.details,
        moderationStatus,
      },
    });

    logger.info('Upload completed', {
      userId,
      billId: bill.id,
      storagePath,
      contentType,
      size: buffer.length,
      scanStatus: scanResult.status,
    });

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

    return res.json({ message: 'Bill deleted' });
  } catch (error: any) {
    next(error);
  }
};
