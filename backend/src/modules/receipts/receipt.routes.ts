import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { uploadSingle } from '../../middleware/upload';
import { validateQuery } from '../../middleware/validate';
import { requireAIFeature } from '../../middleware/featureGate';
import { BILL_MAX_UPLOAD_BYTES } from '../../utils/uploadPolicy';
import { scanReceipt, startReceiptScan, getScanStatus } from './receipt.controller';
import { receiptScanQuerySchema } from './receipt.validation';

const router = Router();

router.use(authMiddleware);

router.post(
  '/start',
  authenticatedRateLimit({
    windowMs: 60_000,
    max: 10,
    scope: 'api-ocr-start',
  }),
  requireAIFeature('ocrEngine', 'transactionOCR', 'transactions'),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  startReceiptScan,
);

router.get(
  '/status/:jobId',
  authenticatedRateLimit({
    windowMs: 10_000,
    max: 20,
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
  requireAIFeature('ocrEngine', 'transactionOCR', 'transactions'),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  scanReceipt,
);

export { router as receiptRoutes };
