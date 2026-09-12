import { Response } from 'express';
import type { KaiUnderstandRequest, KaiUnderstandResponse } from '@kanaku/shared';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { audit } from '../../utils/auditLogger';
import { storeTranscript } from '../voice/voice.controller';
import { understandKai } from './kai.nlp';

export const understand = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();
    if (!config.voice.enabled) {
      return res.status(400).json({ error: 'Voice processing is currently disabled by administrator' });
    }

    const body = req.body as KaiUnderstandRequest;
    const result = await understandKai(userId, {
      transcript: body.transcript,
      sessionId: body.sessionId,
      utteranceSeq: body.utteranceSeq,
      context: body.context,
    });

    await storeTranscript(userId, body.transcript, result.actions.length);
    audit({
      event: 'ai.kai_understand',
      userId,
      meta: { parser: result.parser, kinds: result.actions.map((a) => a.kind), seq: body.utteranceSeq },
    });

    const response: KaiUnderstandResponse = {
      success: true,
      sessionId: body.sessionId,
      utteranceSeq: body.utteranceSeq,
      transcript: body.transcript,
      language: result.language,
      parser: result.parser,
      actions: result.actions,
    };
    return res.json(response);
  } catch (error: any) {
    logger.error('Kai understand failed', { error: error.message });
    return res.status(500).json({ error: 'Kai could not process that. Please try again.' });
  }
};
