import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { uploadSingle } from '../../middleware/upload';
import { validateQuery } from '../../middleware/validate';
import { requireFeature, requireAIFeature } from '../../middleware/featureGate';
import { BILL_MAX_UPLOAD_BYTES } from '../../utils/uploadPolicy';
import { scanReceipt, startReceiptScan, getScanStatus } from './receipt.controller';
import { receiptScanQuerySchema } from './receipt.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // receipts carry amounts and merchant data — requires a live PIN unlock

router.post(
  '/start',
  authenticatedRateLimit({
    windowMs: 60_000,
    max: 10,
    scope: 'api-ocr-start',
  }),
  requireFeature('transactions'),
  requireAIFeature('ocrEngine', 'transactionOCR'),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  startReceiptScan,
);

router.get(
  '/status/:jobId',
  authenticatedRateLimit({
    windowMs: 10_000,
    // Sized against what the CLIENT actually does, not a round number. It polls
    // every 700ms for the first 6s (cloudReceiptScanService.pollDelayMs), so a
    // single scan spends ~12 of these in its first 10 seconds. At the previous
    // limit of 20 one scan was fine but two at once were not — and scanning two
    // receipts back to back is ordinary use, not abuse. This leaves room for
    // roughly four concurrent scans while still bounding a runaway client.
    //
    // The read itself is an in-memory job lookup, so the cost of a generous
    // limit here is far lower than the cost of breaking a scan midway.
    max: Number(process.env.RECEIPT_STATUS_RATE_LIMIT || 60),
    scope: 'api-ocr-status',
  }),
  getScanStatus,
);

// Deprecated: Sync scan (keeping for backward compatibility temporarily)
router.post(
  '/scan',
  authenticatedRateLimit({
    windowMs: 60_000,
    max: Number(process.env.RECEIPT_SCAN_RATE_LIMIT || 8),
    scope: 'api-receipts-scan',
  }),
  validateQuery(receiptScanQuerySchema),
  requireFeature('transactions'),
  requireAIFeature('ocrEngine', 'transactionOCR'),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  scanReceipt,
);

export { router as receiptRoutes };
