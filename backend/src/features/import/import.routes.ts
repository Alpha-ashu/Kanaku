import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import multer from 'multer';
import { uploadImport, uploadStatement, confirmImport, getImportSession, importTransactions } from './import.controller';
import { validateBody } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { MAX_IMPORT_ROWS } from './importLedger.service';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const confirmImportSchema = z.object({
  sessionId: z.string().min(1).max(100),
  // Target account is mandatory — every imported row posts to a real account
  // and moves its balance, exactly like a manually entered transaction.
  accountId: z.string().min(1).max(100),
  selectedRows: z.array(z.number().int().min(0)).max(MAX_IMPORT_ROWS).optional(),
  overrides: z.record(z.string(), z.object({
    category: z.string().max(100).optional(),
    subcategory: z.string().max(100).optional(),
    amount: z.number().positive().optional(),
    description: z.string().max(300).optional(),
    type: z.enum(['debit', 'credit']).optional(),
    // Lets the review screen fix a date the file did not say clearly.
    date: isoDay.optional(),
  })).optional(),
});

/** Rows parsed and reviewed in the app. Kept small per request (the client sends ≤250). */
const importRowSchema = z.object({
  clientRowId: z.string().min(1).max(100),
  accountId: z.string().min(1).max(100),
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().positive().max(1e12),
  date: z.string().min(10).max(40),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().max(100).nullish(),
  description: z.string().max(500).nullish(),
  merchant: z.string().max(200).nullish(),
  transferToAccountId: z.string().max(100).nullish(),
  externalId: z.string().max(200).nullish(),
  currency: z.string().length(3).nullish(),
  metadata: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).nullish(),
});

const importTransactionsSchema = z.object({
  source: z.string().trim().min(1).max(200),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
});

// Imports are heavy (parsing, categorising, bulk writes); a person importing a
// year of statements does a handful per minute.
const importLimiter = authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.IMPORT_RATE_LIMIT || 30),
  scope: 'import',
  message: 'Too many imports at once. Please wait a minute and try again.',
});

/**
 * POST /api/v1/import/upload       - Upload CSV/Excel spreadsheet and get preview
 * POST /api/v1/import/statement    - Parse a bank statement (PDF/CSV) into typed rows
 * POST /api/v1/import/confirm      - Bulk-save the reviewed selection of a preview
 * POST /api/v1/import/transactions - Bulk-save rows the app parsed (third-party files, backups)
 * GET  /api/v1/import/:sessionId   - Get your own session preview
 */
// Bank statements in, transactions out — as financial as it gets, so every route
// here sits behind a live PIN unlock alongside /transactions and /accounts.
router.post('/upload', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), importLimiter, upload.single('file'), uploadImport);
router.post('/statement', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), importLimiter, upload.single('file'), uploadStatement);
router.post(
  '/confirm',
  authMiddleware,
  pinGate,
  requireFeature('accounts', 'importStatement'),
  importLimiter,
  idempotency({ scope: 'import.confirm' }),
  validateBody(confirmImportSchema),
  confirmImport,
);
router.post(
  '/transactions',
  authMiddleware,
  pinGate,
  requireFeature('transactions', 'importThirdPartyData'),
  importLimiter,
  idempotency({ scope: 'import.transactions' }),
  validateBody(importTransactionsSchema),
  importTransactions,
);
router.get('/:sessionId', authMiddleware, pinGate, requireFeature('accounts', 'importStatement'), getImportSession);

export default router;
