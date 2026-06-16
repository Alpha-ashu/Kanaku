import { Router } from 'express';
import { receiveSendGridEvents } from './webhook.controller';

const router = Router();

router.post('/sendgrid', receiveSendGridEvents);

export { router as webhookRoutes };
