import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { uploadSingle } from '../../middleware/upload';
import { validateParams } from '../../middleware/validate';
import { BILL_MAX_UPLOAD_BYTES } from '../../utils/uploadPolicy';
import * as BillsController from './bills.controller';
import { billIdParamSchema } from './bills.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', BillsController.getBills);
router.get('/:id', validateParams(billIdParamSchema), BillsController.getBill);
router.post(
  '/',
  authenticatedRateLimit({
    windowMs: 60_000,
    max: Number(process.env.BILL_UPLOAD_RATE_LIMIT || 10),
    scope: 'api-bills-upload',
    message: 'Too many bill uploads. Please try again later.',
  }),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  BillsController.uploadBill,
);
router.delete('/:id', validateParams(billIdParamSchema), BillsController.deleteBill);

export { router as billsRoutes };
