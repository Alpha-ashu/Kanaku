import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import multer from 'multer';
import { uploadImport, uploadStatement, confirmImport, getImportSession } from './import.controller';
import { validateBody } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const confirmImportSchema = z.object({
  sessionId: z.string().min(1),
  // Target account is mandatory — every imported row posts to a real account
  // and moves its balance, exactly like a manually entered transaction.
  accountId: z.string().min(1),
  selectedRows: z.array(z.number().int().min(0)).max(1000).optional(),
  overrides: z.record(z.object({
    category: z.string().optional(),
    subcategory: z.string().optional(),
    amount: z.number().positive().optional(),
    description: z.string().max(300).optional(),
    type: z.enum(['debit', 'credit']).optional(),
  })).optional(),
});

/**
 * POST /api/v1/import/upload    - Upload CSV/Excel spreadsheet and get preview
 * POST /api/v1/import/statement - Parse a bank statement (PDF/CSV) into typed rows
 * POST /api/v1/import/confirm   - Bulk-save the reviewed selection (single DB transaction)
 * GET  /api/v1/import/:sessionId - Get session preview
 */
// Bank statements in, transactions out — as financial as it gets, so every route
// here sits behind a live PIN unlock alongside /transactions and /accounts.
router.post('/upload', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), upload.single('file'), uploadImport);
router.post('/statement', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), upload.single('file'), uploadStatement);
router.post(
  '/confirm',
  authMiddleware,
  pinGate,
  requireFeature('accounts', 'importStatement'),
  idempotency({ scope: 'import.confirm' }),
  validateBody(confirmImportSchema),
  confirmImport,
);
router.get('/:sessionId', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), getImportSession);

export default router;

