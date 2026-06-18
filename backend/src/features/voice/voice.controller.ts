import { Request, Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { processVoiceTranscript, FinancialAction } from './voice.nlp';
import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';

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

    const actions = await processVoiceTranscript(transcript);

    // Store transcript in DB (fail-safe)
    try {
      await (prisma as any).voiceTranscript?.create?.({
        data: {
          userId,
          originalText: transcript,
          cleanedText: transcript,
          actionsCount: actions.length,
          processedAt: new Date(),
        },
      }).catch(() => {/* table may not exist yet */});
    } catch { /* non-critical */ }

    return res.json({
      success: true,
      transcript,
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

    // Store learning record (fail-safe)
    try {
      await (prisma as any).userVoiceLearning?.create?.({
        data: {
          userId,
          originalText: originalSegment,
          correctedType: correctedType ?? null,
          correctedCategory: correctedCategory ?? null,
          correctedAmount: correctedAmount ?? null,
          createdAt: new Date(),
        },
      }).catch(() => {});
    } catch { /* non-critical */ }

    return res.json({ success: true, message: 'Learning recorded' });
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

    let transcript = '';
    const provider = config.voice.provider || 'gemini';

    if (provider === 'webkit') {
      // Force client-side transcription fallback
      return res.json({
        success: false,
        error: 'Web Speech API (client-side) transcription configured by administrator.',
        fallbackToWebSpeech: true
      });
    }

    // Google Gemini Audio Transcription
    if (provider === 'gemini' && process.env.GOOGLE_API_KEY) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const modelName = config.voice.model || 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          {
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: file.mimetype || 'audio/webm',
            },
          },
          'Transcribe the following audio. Return only the transcription. Do not explain or add commentary.',
        ]);

        transcript = result.response.text().trim();
      } catch (geminiErr: any) {
        logger.error('Gemini transcription failed', { error: geminiErr.message });
      }
    }

    // OpenAI Whisper Audio Transcription
    if (!transcript && (provider === 'whisper' || !transcript) && process.env.OPENAI_API_KEY) {
      try {
        const OpenAIModule = (require as any)('openai');
        const openai = new OpenAIModule({ apiKey: process.env.OPENAI_API_KEY });
        
        const tempFs = (require as any)('fs');
        const tempPath = (require as any)('path');
        const os = (require as any)('os');
        
        const tempFilePath = tempPath.join(os.tmpdir(), `voice-${Date.now()}.webm`);
        tempFs.writeFileSync(tempFilePath, file.buffer);
        
        const response = await openai.audio.transcriptions.create({
          file: tempFs.createReadStream(tempFilePath),
          model: 'whisper-1',
        });
        
        transcript = response.text;
        
        tempFs.unlinkSync(tempFilePath);
      } catch (openaiErr: any) {
        logger.error('OpenAI Whisper transcription failed', { error: openaiErr.message });
      }
    }

    // If no transcription is available (e.g. no keys or failed), return flag for web speech fallback
    if (!transcript) {
      return res.status(503).json({ 
        error: 'Backend speech-to-text API keys not configured or unavailable. Falling back to local Web Speech API.',
        fallbackToWebSpeech: true
      });
    }

    // Now process the extracted transcript using the NLP pipeline
    const actions = await processVoiceTranscript(transcript);

    // Store transcript in DB (fail-safe)
    try {
      await (prisma as any).voiceTranscript?.create?.({
        data: {
          userId,
          originalText: transcript,
          cleanedText: transcript,
          actionsCount: actions.length,
          processedAt: new Date(),
        },
      }).catch(() => {});
    } catch { /* non-critical */ }

    return res.json({
      success: true,
      transcript,
      actions,
      totalActions: actions.length,
      requiresReview: actions.some(a => a.requiresReview),
    });

  } catch (error: any) {
    logger.error('Audio voice processing failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to process voice audio. Please try again.' });
  }
};


