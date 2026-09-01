import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import * as FriendController from './friend.controller';
import {
  friendCreateSchema,
  friendUpdateSchema,
  friendBulkSchema,
  friendIdParamSchema,
} from './friend.validation';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(pinGate); // friend balances and settlements are financial data — requires a live PIN unlock

router.get('/', FriendController.getFriends);
router.post(
  '/',
  idempotency({ scope: 'friends.create' }),
  validateBody(friendCreateSchema),
  FriendController.createFriend,
);
router.post(
  '/bulk',
  idempotency({ scope: 'friends.bulk' }),
  validateBody(friendBulkSchema),
  FriendController.bulkCreateFriends,
);
router.post('/import', upload.single('file'), FriendController.importFriendsCsv);
router.get('/:id', validateParams(friendIdParamSchema), FriendController.getFriendDetail);
router.put(
  '/:id',
  idempotency({ scope: 'friends.update' }),
  validateParams(friendIdParamSchema),
  validateBody(friendUpdateSchema),
  FriendController.updateFriend,
);
router.delete('/:id', validateParams(friendIdParamSchema), FriendController.deleteFriend);

export { router as friendRoutes };

