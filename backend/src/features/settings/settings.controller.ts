import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

/** Server-authoritative cap on the monthly budget stored in the settings blob. */
const MAX_MONTHLY_BUDGET = Math.floor(1_000_000_000 / 12); // mirrors MAX_MONTHLY_INCOME

/**
 * Keys that already have a dedicated column on `UserSettings` (or are an exact
 * alias of one). They must NEVER be duplicated inside the freeform `settings`
 * blob — the column is the single source of truth. `defaultCurrency` is an
 * alias of `currency`; `languageLabel` is derivable from `language`.
 */
const COLUMN_OWNED_BLOB_KEYS = ['theme', 'language', 'languageLabel', 'currency', 'defaultCurrency', 'timezone'];

/** Coerce a stored/incoming blob (string OR object) into a plain object. */
const toBlobObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, any>) };
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

/**
 * Present a stored blob on the way OUT: parse it (fixing the historical
 * double-encoding where the blob was a JSON *string* inside the Json column)
 * and strip any column-owned keys so the response never repeats the same value
 * under two names. Guarantees the API always returns `settings` as an object.
 */
export const presentSettingsBlob = (value: unknown): Record<string, any> => {
  const obj = toBlobObject(value);
  for (const key of COLUMN_OWNED_BLOB_KEYS) delete obj[key];
  return obj;
};

/**
 * Normalise the freeform settings blob before persistence:
 *  - parse string|object → object (so the Json column stores a real object,
 *    not a double-encoded JSON string),
 *  - clamp `monthlyBudget` to a sane, column-safe range (prevents the
 *    8333333333 overflow value leaking through from the client),
 *  - drop keys that duplicate dedicated columns (single source of truth).
 * Returns a plain object ready for the Json column — never a string.
 */
export const normaliseSettingsBlob = (settings: unknown): Record<string, any> | undefined => {
  if (settings === undefined || settings === null) return undefined;
  const obj = toBlobObject(settings);
  if ('monthlyBudget' in obj) {
    const n = Number(obj.monthlyBudget);
    obj.monthlyBudget = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_MONTHLY_BUDGET) : 0;
  }
  for (const key of COLUMN_OWNED_BLOB_KEYS) delete obj[key];
  return obj;
};

/** Shape every settings response identically: blob parsed + de-duplicated. */
const serializeSettings = (settings: Record<string, any>) => ({
  ...settings,
  settings: presentSettingsBlob(settings.settings),
});

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
          settings: {},
        },
      });
    }

    res.json({ success: true, data: serializeSettings(settings) });
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
          settings: normalisedSettings ?? {},
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
          // Re-strip the existing blob too, so a row written before this fix is
          // cleaned on its next update even without the backfill script.
          settings: normalisedSettings ?? presentSettingsBlob(userSettings.settings),
          updatedAt: new Date(),
        },
      });
    }

    res.json({ success: true, data: serializeSettings(userSettings) });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
