import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

/** Server-authoritative cap on the monthly budget stored in the settings blob. */
const MAX_MONTHLY_BUDGET = Math.floor(1_000_000_000 / 12); // mirrors MAX_MONTHLY_INCOME

/**
 * Normalise the free-form settings blob before persistence:
 *  - clamp `monthlyBudget` to a sane, column-safe range (prevents the
 *    8333333333 overflow value leaking through from the client),
 *  - return a JSON string ready for storage.
 */
const normaliseSettingsBlob = (settings: unknown): string | undefined => {
  if (settings === undefined || settings === null) return undefined;
  let obj: Record<string, unknown>;
  try {
    obj = typeof settings === 'string' ? JSON.parse(settings) : { ...(settings as Record<string, unknown>) };
  } catch {
    // Not valid JSON — store an empty object rather than malformed data.
    return '{}';
  }
  if (obj && typeof obj === 'object' && 'monthlyBudget' in obj) {
    const n = Number((obj as Record<string, unknown>).monthlyBudget);
    obj.monthlyBudget = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_MONTHLY_BUDGET) : 0;
  }
  return JSON.stringify(obj);
};

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

    const normalisedSettings = normaliseSettingsBlob(settings);

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
          settings: normalisedSettings ?? '{}',
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
          settings: normalisedSettings ?? (userSettings.settings as any),
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
