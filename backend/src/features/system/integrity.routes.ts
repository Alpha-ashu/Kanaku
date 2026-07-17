import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { getSystemIntegrity } from './integrity.controller';

const router = Router();

router.use(authMiddleware);

router.get('/integrity', getSystemIntegrity);

export { router as systemRoutes };
