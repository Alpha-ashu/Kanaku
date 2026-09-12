import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { requireAIFeature } from '../../middleware/featureGate';
import { understand } from './kai.controller';

const router = Router();

const contextActionSchema = z.object({
  actionId: z.string().min(1).max(120),
  kind: z.string().min(1).max(40),
  summary: z.string().max(200),
  amount: z.number().optional(),
  person: z.string().max(80).optional(),
  goalName: z.string().max(80).optional(),
  date: z.string().max(20).optional(),
  status: z.enum(['saved', 'pending']),
});

const understandSchema = z.object({
  transcript: z.string().min(1).max(5000),
  sessionId: z.string().min(1).max(80),
  utteranceSeq: z.number().int().min(0),
  context: z.object({
    recentActions: z.array(contextActionSchema).max(8).default([]),
    knownGoals: z.array(z.string().max(80)).max(30).default([]),
    knownContacts: z.array(z.string().max(80)).max(50).default([]),
    pendingClarification: z.object({
      actionId: z.string().min(1).max(120),
      question: z.string().max(200),
      options: z.array(z.string().max(80)).max(4),
    }).optional(),
  }).optional(),
});

/**
 * POST /api/v1/kai/understand
 * Session-aware understanding of one spoken utterance: money actions, goals,
 * todos, corrections to earlier actions, clarifications and answered queries.
 */
router.post('/understand', authMiddleware, requireAIFeature('voiceAssistant'), validateBody(understandSchema), understand);

export default router;
