import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          theme: 'light',
          language: 'en',
          currency: 'USD',
          timezone: 'UTC',
          settings: '{}',
        },
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { theme, language, currency, timezone, settings } = req.body;

    let userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!userSettings) {
      userSettings = await prisma.userSettings.create({
        data: {
          userId,
          theme: theme || 'light',
          language: language || 'en',
          currency: currency || 'USD',
          timezone: timezone || 'UTC',
          settings: settings ? (typeof settings === 'string' ? settings : JSON.stringify(settings)) : '{}',
        },
      });
    } else {
      userSettings = await prisma.userSettings.update({
        where: { userId },
        data: {
          theme: theme || userSettings.theme,
          language: language || userSettings.language,
          currency: currency || userSettings.currency,
          timezone: timezone || userSettings.timezone,
          settings: settings ? (typeof settings === 'string' ? settings : JSON.stringify(settings)) : (userSettings.settings as any),
          updatedAt: new Date(),
        },
      });
    }

    res.json(userSettings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
