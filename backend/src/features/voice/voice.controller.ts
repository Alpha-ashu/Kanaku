import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { processVoiceTranscriptDetailed, detectLanguage } from './voice.nlp';
import { recordCorrection } from './voice.learning';
import { transcribeAudio, validateAudioUpload } from './voice.stt';
import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { audit } from '../../utils/auditLogger';

/**
 * Persist a processed transcript. Fail-safe: a missing table (migration not
 * yet applied) or DB blip never breaks the user-facing response.
 */
const storeTranscript = async (userId: string, transcript: string, actionsCount: number) => {
  try {
    await prisma.voiceTranscript.create({
      data: {
        userId,
        originalText: transcript,
        cleanedText: transcript,
        actionsCount,
      },
    });
  } catch (err: any) {
    logger.warn('Voice: transcript persistence failed (non-fatal)', { error: err.message });
  }
};

export const processVoice = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();

    if (!config.voice.enabled) {
      return res.status(400).json({ error: 'Voice processing is currently disabled by administrator' });
    }

    const { transcript } = req.body as { transcript: string };

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (transcript.length > 5000) {
      return res.status(400).json({ error: 'Transcript too long (max 5000 characters)' });
    }

    const { actions, parser } = await processVoiceTranscriptDetailed(transcript, userId);
    await storeTranscript(userId, transcript, actions.length);

    return res.json({
      success: true,
      transcript,
      language: detectLanguage(transcript),
      parser,
      actions,
      totalActions: actions.length,
      requiresReview: actions.some(a => a.requiresReview),
    });
  } catch (error: any) {
    logger.error('Voice processing failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to process voice input. Please try again.' });
  }
};

export const learnFromCorrection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { originalSegment, correctedType, correctedCategory, correctedAmount } = req.body as {
      originalSegment: string;
      correctedType?: string;
      correctedCategory?: string;
      correctedAmount?: number;
    };

    if (!originalSegment) {
      return res.status(400).json({ error: 'originalSegment is required' });
    }

    try {
      await recordCorrection(userId, { originalSegment, correctedType, correctedCategory, correctedAmount });
      audit({
        event: 'ai.voice_correction',
        userId,
        meta: { correctedType: correctedType ?? null, correctedCategory: correctedCategory ?? null },
      });
    } catch (err: any) {
      // Table missing / DB blip — acknowledge without failing the client flow,
      // but say so honestly instead of pretending the correction was stored.
      logger.warn('Voice: learning persistence failed', { error: err.message });
      return res.json({ success: true, stored: false, message: 'Correction received but not persisted' });
    }

    return res.json({ success: true, stored: true, message: 'Learning recorded' });
  } catch (error: any) {
    logger.error('Voice learning failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to record correction' });
  }
};

export const processVoiceAudio = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();

    if (!config.voice.enabled) {
      return res.status(400).json({ error: 'Voice processing is currently disabled by administrator' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const uploadError = validateAudioUpload(file);
    if (uploadError) {
      return res.status(400).json({ error: uploadError });
    }

    const provider = config.voice.provider || 'gemini';

    if (provider === 'webkit') {
      // Administrator has pinned client-side transcription
      return res.json({
        success: false,
        error: 'Web Speech API (client-side) transcription configured by administrator.',
        fallbackToWebSpeech: true,
      });
    }

    const stt = await transcribeAudio(file, provider, config.voice.model || 'gemini-flash-latest');

    if (!stt) {
      // No STT provider configured/reachable — client falls back to Web Speech API
      return res.status(503).json({
        error: 'Backend speech-to-text API keys not configured or unavailable. Falling back to local Web Speech API.',
        fallbackToWebSpeech: true,
      });
    }

    audit({ event: 'ai.voice_stt', userId, meta: { provider: stt.provider, chars: stt.transcript.length } });

    const { actions, parser } = await processVoiceTranscriptDetailed(stt.transcript, userId);
    await storeTranscript(userId, stt.transcript, actions.length);

    return res.json({
      success: true,
      transcript: stt.transcript,
      sttProvider: stt.provider,
      language: stt.language ?? detectLanguage(stt.transcript),
      parser,
      actions,
      totalActions: actions.length,
      requiresReview: actions.some(a => a.requiresReview),
    });
  } catch (error: any) {
    logger.error('Audio voice processing failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to process voice audio. Please try again.' });
  }
};
