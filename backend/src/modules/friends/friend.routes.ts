import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import * as FriendController from './friend.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(authMiddleware);

router.get('/', FriendController.getFriends);
router.post('/', FriendController.createFriend);
router.post('/bulk', FriendController.bulkCreateFriends);
router.post('/import', upload.single('file'), FriendController.importFriendsCsv);
router.get('/:id', FriendController.getFriendDetail);
router.put('/:id', FriendController.updateFriend);
router.delete('/:id', FriendController.deleteFriend);

export { router as friendRoutes };
