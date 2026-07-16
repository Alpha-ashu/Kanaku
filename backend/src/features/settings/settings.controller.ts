import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { cacheDeleteByUserId } from '../../cache/redis';

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

export const clearAllUserData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    await prisma.$transaction(async (tx) => {
      // 1. Delete transactions & journal entries
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.journalEntry.deleteMany({ where: { userId } });

      // 2. Delete goal contributions, goal members, and goals
      await tx.goalContribution.deleteMany({ where: { userId } });
      await tx.goalMember.deleteMany({ where: { goal: { userId } } });
      await tx.goal.deleteMany({ where: { userId } });

      // 3. Delete group expense members & group expenses
      await tx.groupExpenseMember.deleteMany({ where: { OR: [{ userId }, { groupExpense: { userId } }] } });
      await tx.groupExpense.deleteMany({ where: { userId } });

      // 4. Delete loan payments & loans
      await tx.loanPayment.deleteMany({ where: { loan: { userId } } });
      await tx.loan.deleteMany({ where: { userId } });

      // 5. Delete other financial categories
      await tx.investment.deleteMany({ where: { userId } });
      await tx.goldAsset.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });

      // 6. Delete friends & notification & device
      await tx.friend.deleteMany({ where: { userId } });
      await tx.todo.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.device.deleteMany({ where: { userId } });

      // 7. Delete recurring rules & executions
      await tx.recurringExecution.deleteMany({ where: { rule: { userId } } });
      await tx.recurringTransaction.deleteMany({ where: { userId } });

      // 8. Delete imported logs, AI events, and consent forms
      await tx.importLog.deleteMany({ where: { userId } });
      await tx.aiScan.deleteMany({ where: { userId } });
      await tx.otpCode.deleteMany({ where: { userId } });
      await tx.aaConsent.deleteMany({ where: { userId } });
      await tx.user_features.deleteMany({ where: { user_id: userId } });
      await tx.ai_insights.deleteMany({ where: { user_id: userId } });
      await tx.ai_events.deleteMany({ where: { user_id: userId } });
      await tx.collaborationParticipant.deleteMany({ where: { invitedBy: userId } });
      await tx.auditLog.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.syncQueue.deleteMany({ where: { userId } });

      // 9. Delete booking requests, advisor applications & chat messages
      await tx.chatMessage.deleteMany({ where: { senderId: userId } });
      await tx.advisorSession.deleteMany({ where: { clientId: userId } });
      await tx.bookingRequest.deleteMany({ where: { clientId: userId } });
      await tx.payment.deleteMany({ where: { clientId: userId } });
      await tx.advisorAvailability.deleteMany({ where: { advisorId: userId } });
      await tx.advisorApplication.deleteMany({ where: { userId } });

      // 10. Delete raw SQL tables (todo lists & user learning)
      await tx.$executeRawUnsafe('DELETE FROM public.todo_list_shares WHERE shared_with_user_id = $1::uuid OR shared_by = $1::uuid OR list_id IN (SELECT id FROM public.todo_lists WHERE user_id = $1::uuid)', userId);
      await tx.$executeRawUnsafe('DELETE FROM public.todo_items WHERE user_id = $1::uuid OR list_id IN (SELECT id FROM public.todo_lists WHERE user_id = $1::uuid)', userId);
      await tx.$executeRawUnsafe('DELETE FROM public.todo_lists WHERE user_id = $1::uuid', userId);
      await tx.$executeRawUnsafe('DELETE FROM public.user_learning WHERE user_id = $1', userId);

      // 11. Delete account balances (depends on accounts being deleted after transactions)
      await tx.account.deleteMany({ where: { userId } });

      // 12. Reset UserSettings back to defaults
      await tx.userSettings.updateMany({
        where: { userId },
        data: {
          theme: 'light',
          language: 'en',
          currency: 'USD',
          timezone: 'UTC',
          settings: {},
        }
      });
    }, { timeout: 30000 });

    // Clear in-memory caches
    await cacheDeleteByUserId(userId);

    res.json({ success: true, message: 'All user data cleared successfully' });
  } catch (error: any) {
    console.error('Failed to clear user data:', error);
    res.status(500).json({ error: error.message || 'Failed to clear user data' });
  }
};
