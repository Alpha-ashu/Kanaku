import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import {
  getAIAccuracyMonitor,
  getAIInsightsFeed,
  getAIOverview,
  getAIPatternAnalytics,
  getAIRawUserData,
  getAIUserIntelligence,
  recordAIEvent,
  runFeatureEngineeringForAllUsers,
  runPredictionEngineForAllUsers,
} from './ai.engine';

export const captureAIEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const body = req.body as { eventType: string; metadata: Record<string, unknown> };

    await recordAIEvent(userId, body.eventType, body.metadata ?? {});
    return res.status(201).json({ success: true, message: 'AI event captured' });
  } catch (error) {
    logger.error('Failed to capture AI event', { error });
    return res.status(500).json({ success: false, error: 'Failed to capture AI event' });
  }
};

export const getAdminAIOverview = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getAIOverview();
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI overview', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI overview' });
  }
};

export const getAdminAIUsers = async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query as { limit?: number };
    const data = await getAIUserIntelligence(query.limit ?? 50);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI user intelligence', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI user intelligence' });
  }
};

export const getAdminAIInsights = async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query as { limit?: number };
    const data = await getAIInsightsFeed(query.limit ?? 60);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI insights feed', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI insights feed' });
  }
};

export const getAdminAIPatterns = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getAIPatternAnalytics();
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI pattern analytics', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI pattern analytics' });
  }
};

export const getAdminAIAccuracy = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getAIAccuracyMonitor();
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI accuracy metrics', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI accuracy metrics' });
  }
};

export const getAdminAIRawUserData = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const data = await getAIRawUserData(userId);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch AI raw user data', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch AI raw user data' });
  }
};

export const runAdminFeatureRefresh = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await runFeatureEngineeringForAllUsers();
    return res.json({ success: true, data: result, message: 'Feature refresh completed' });
  } catch (error) {
    logger.error('Failed to run AI feature refresh', { error });
    return res.status(500).json({ success: false, error: 'Failed to run AI feature refresh' });
  }
};

export const runAdminPredictionRefresh = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await runPredictionEngineForAllUsers();
    return res.json({ success: true, data: result, message: 'Prediction refresh completed' });
  } catch (error) {
    logger.error('Failed to run AI prediction refresh', { error });
    return res.status(500).json({ success: false, error: 'Failed to run AI prediction refresh' });
  }
};

import { getAIConfigurations, updateAIConfigurations } from '../../utils/aiConfig';

export const getAdminAIConfig = async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getAIConfigurations();
    return res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Failed to get AI config', { error });
    return res.status(500).json({ success: false, error: 'Failed to get AI configuration' });
  }
};

export const updateAdminAIConfig = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body;
    const config = await updateAIConfigurations(body);
    return res.json({ success: true, data: config, message: 'AI configuration updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update AI config', { error });
    return res.status(500).json({ success: false, error: error.message || 'Failed to update AI configuration' });
  }
};

