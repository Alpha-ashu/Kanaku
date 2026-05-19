import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { z } from 'zod';
import { processVoice, learnFromCorrection, processVoiceAudio } from './voice.controller';
import { uploadSingle } from '../../middleware/upload';

const router = Router();

const processVoiceSchema = z.object({
  transcript: z.string().min(1).max(5000),
});

const learnSchema = z.object({
  originalSegment: z.string().min(1),
  correctedType: z.string().optional(),
  correctedCategory: z.string().optional(),
  correctedAmount: z.number().optional(),
});

/**
 * POST /api/v1/voice/process-audio
 * Transcribe and process an uploaded audio file
 */
router.post('/process-audio', authMiddleware, uploadSingle('audio'), processVoiceAudio);

/**
 * POST /api/v1/voice/process
 * Analyze a voice transcript and extract financial actions
 */
router.post('/process', authMiddleware, validateBody(processVoiceSchema), processVoice);

/**
 * POST /api/v1/voice/learn
 * Record user corrections for improved future recognition
 */
router.post('/learn', authMiddleware, validateBody(learnSchema), learnFromCorrection);

export default router;


