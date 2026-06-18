import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { categorizeTextForUser, learnCategorizationForUser } from './categorization.engine';

export const categorize = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const text = String(req.body?.text ?? '').trim();

    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const result = await categorizeTextForUser(userId, text);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Categorization failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to categorize text' });
  }
};

export const learn = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const text = String(req.body?.text ?? '').trim();
    const category = String(req.body?.category ?? req.body?.category_id ?? '').trim();
    const subcategory = String(req.body?.subcategory ?? req.body?.subcategory_id ?? '').trim();

    if (!text || !category) {
      return res.status(400).json({ success: false, error: 'Text and category are required' });
    }

    await learnCategorizationForUser(userId, text, category, subcategory);
    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error('Categorization learning failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to save learned category' });
  }
};
