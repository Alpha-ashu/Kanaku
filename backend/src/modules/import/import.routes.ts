import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import multer from 'multer';
import { uploadImport, confirmImport, getImportSession } from './import.controller';
import { validateBody } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const confirmImportSchema = z.object({
  sessionId: z.string().min(1),
  overrides: z.record(z.object({
    category: z.string().optional(),
    subcategory: z.string().optional(),
    amount: z.number().optional(),
    description: z.string().optional(),
  })).optional(),
});

/**
 * POST /api/v1/import/upload  - Upload CSV/Excel file and get preview
 * POST /api/v1/import/confirm - Confirm and save imported transactions
 * GET  /api/v1/import/:sessionId - Get session preview
 */
router.post('/upload', authMiddleware, requireFeature('accounts', 'importStatement'), upload.single('file'), uploadImport);
router.post('/confirm', authMiddleware, requireFeature('accounts', 'importStatement'), validateBody(confirmImportSchema), confirmImport);
router.get('/:sessionId', authMiddleware, getImportSession);

export default router;

