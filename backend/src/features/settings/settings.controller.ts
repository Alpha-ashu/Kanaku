import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { cacheDeleteByUserId } from '../../cache/redis';
import { removeObject } from '../../utils/storage';
import {
  acquireClearDataLock,
  releaseClearDataLock,
  getIdempotentResponse,
  storeIdempotentResponse,
} from './clearDataLock';
import { markUserClearing, unmarkUserClearing } from '../../workers/recurring.worker';
import { FinancialEventStore } from '../events/eventStore';
import crypto from 'crypto';

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
          currency: 'INR',
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
          currency: currency || 'INR',
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
  const startMs = Date.now();
  const userId = getUserId(req);

  // Generate structured FactoryResetId and version
  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const factoryResetId = `FR-${todayStr}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const factoryResetVersion = '10.7';

  // Phase timings tracking
  const timings: {
    phase0?: number;
    phase1?: number;
    phase2?: number;
    phase3?: number;
    phase4?: number;
    phase5?: number;
  } = {};

  // ── 0. Dry Run Mode ────────────────────────────────────────────────────────
  if (req.query.dryRun === 'true') {
    try {
      const [
        accounts,
        transactions,
        goals,
        loans,
        budgets,
        friends,
        investments,
        goldAssets,
        expenseBills,
        recurringTransactions,
      ] = await Promise.all([
        prisma.account.count({ where: { userId } }),
        prisma.transaction.count({ where: { userId } }),
        prisma.goal.count({ where: { userId } }),
        prisma.loan.count({ where: { userId } }),
        prisma.budget.count({ where: { userId } }),
        prisma.friend.count({ where: { userId } }),
        prisma.investment.count({ where: { userId } }),
        prisma.goldAsset.count({ where: { userId } }),
        prisma.expenseBill.count({ where: { userId } }),
        prisma.recurringTransaction.count({ where: { userId } }),
      ]);

      const totalCount =
        accounts +
        transactions +
        goals +
        loans +
        budgets +
        friends +
        investments +
        goldAssets +
        expenseBills +
        recurringTransactions;

      const estimatedDurationMs = 200 + Math.ceil(totalCount / 10);

      return res.json({
        success: true,
        dryRun: true,
        factoryResetId,
        factoryResetVersion,
        wouldDelete: {
          accounts,
          transactions,
          goals,
          loans,
          budgets,
          friends,
          investments,
          goldAssets,
          expenseBills,
          recurringTransactions,
        },
        estimatedDurationMs,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `Dry run failed: ${err.message}` });
    }
  }

  // ── 1. Idempotency Key ─────────────────────────────────────────────────────
  const clientKey = req.headers['idempotency-key'] as string;
  if (clientKey) {
    const cached = await getIdempotentResponse<any>(userId, 'clearAllUserData', clientKey);
    if (cached) {
      return res.json(cached);
    }
  }

  // ── 2. Postgres Session Advisory Lock ──────────────────────────────────────
  // Session locks cross transaction boundaries to cover storage & cache actions.
  const locked = await acquireClearDataLock(userId);
  if (!locked) {
    return res.status(409).json({
      code: 'CLEAR_ALREADY_RUNNING',
      error: 'A factory reset is already running for this user.',
    });
  }

  try {
    // ── 3. Background Worker Pause ───────────────────────────────────────────
    markUserClearing(userId);

    // ── 4. Event Store Lifecycle marker ──────────────────────────────────────
    await FinancialEventStore.recordFactoryReset(userId, 'STARTED', {
      factoryResetId,
      factoryResetVersion,
    });

    // ── Phase 0: Pre-fetch storage paths ────────────────────────────────────
    const p0Start = Date.now();
    const billsToDelete = await prisma.expenseBill.findMany({
      where: { userId },
      select: { storagePath: true },
    });
    const storagePathsToDelete = billsToDelete.map(b => b.storagePath);
    timings.phase0 = Date.now() - p0Start;

    // ── Phase 1: Transactional DB deletions ─────────────────────────────────
    const deleted: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      const p1Start = Date.now();

      // ── 1. Financial core (transactions + journal legs) ──────────────────
      const { count: txCount } = await tx.transaction.deleteMany({ where: { userId } });
      deleted.transactions = txCount;

      const { count: jeCount } = await tx.journalEntry.deleteMany({ where: { userId } });
      deleted.journalEntries = jeCount;

      // ── 2. Goals (children before parent) ──────────────────────────────
      const { count: gcCount } = await tx.goalContribution.deleteMany({ where: { userId } });
      deleted.goalContributions = gcCount;
      const { count: gmCount } = await tx.goalMember.deleteMany({ where: { goal: { userId } } });
      deleted.goalMembers = gmCount;
      const { count: goalCount } = await tx.goal.deleteMany({ where: { userId } });
      deleted.goals = goalCount;

      // ── 3. Group expenses (members before expenses) ─────────────────────
      const { count: gemCount } = await tx.groupExpenseMember.deleteMany({
        where: { OR: [{ userId }, { groupExpense: { userId } }] },
      });
      deleted.groupExpenseMembers = gemCount;
      const { count: geCount } = await tx.groupExpense.deleteMany({ where: { userId } });
      deleted.groupExpenses = geCount;

      // ── 4. Loans (payments before loans) ────────────────────────────────
      const { count: lpCount } = await tx.loanPayment.deleteMany({ where: { loan: { userId } } });
      deleted.loanPayments = lpCount;
      const { count: loanCount } = await tx.loan.deleteMany({ where: { userId } });
      deleted.loans = loanCount;

      // ── 5. Other financial entities ──────────────────────────────────────
      const { count: invCount } = await tx.investment.deleteMany({ where: { userId } });
      deleted.investments = invCount;
      const { count: goldCount } = await tx.goldAsset.deleteMany({ where: { userId } });
      deleted.goldAssets = goldCount;
      const { count: budgetCount } = await tx.budget.deleteMany({ where: { userId } });
      deleted.budgets = budgetCount;

      // ── 6. Recurring rules (executions before rules) ─────────────────────
      const { count: reCount } = await tx.recurringExecution.deleteMany({ where: { rule: { userId } } });
      deleted.recurringExecutions = reCount;
      const { count: rtCount } = await tx.recurringTransaction.deleteMany({ where: { userId } });
      deleted.recurringTransactions = rtCount;

      // ── 7. Social / communication ────────────────────────────────────────
      const { count: friendCount } = await tx.friend.deleteMany({ where: { userId } });
      deleted.friends = friendCount;
      const { count: notifCount } = await tx.notification.deleteMany({ where: { userId } });
      deleted.notifications = notifCount;
      const { count: deviceCount } = await tx.device.deleteMany({ where: { userId } });
      deleted.devices = deviceCount;
      const { count: todoCount } = await tx.todo.deleteMany({ where: { userId } });
      deleted.todos = todoCount;

      // ── 8. Import / AI / model runs ──────────────────────────────────────
      const { count: importCount } = await tx.importLog.deleteMany({ where: { userId } });
      deleted.importLogs = importCount;
      const { count: aiScanCount } = await tx.aiScan.deleteMany({ where: { userId } });
      deleted.aiScans = aiScanCount;
      const { count: aiInsCount } = await tx.ai_insights.deleteMany({ where: { user_id: userId } });
      deleted.aiInsights = aiInsCount;
      const { count: aiEvCount } = await tx.ai_events.deleteMany({ where: { user_id: userId } });
      deleted.aiEvents = aiEvCount;


      // ── 9. OTP / auth tokens (not the session refresh token) ─────────────
      const { count: otpCount } = await tx.otpCode.deleteMany({ where: { userId } });
      deleted.otpCodes = otpCount;
      const { count: otpReqCount } = await tx.otpRequest.deleteMany({ where: { userId } });
      deleted.otpRequests = otpReqCount;

      // ── 10. Account Aggregator (AA) — children before parent ─────────────
      //  AaConsentArtifact has no userId column; delete via consentId subquery.
      await tx.$executeRawUnsafe(
        `DELETE FROM public.aa_consent_artifact
         WHERE "consentId" IN (SELECT id FROM public.aa_consent WHERE "userId" = $1)`,
        userId,
      );
      const { count: aaDsCount } = await tx.aaDataSession.deleteMany({ where: { userId } });
      deleted.aaDataSessions = aaDsCount;
      const { count: aaFdCount } = await tx.aaFinancialData.deleteMany({ where: { userId } });
      deleted.aaFinancialData = aaFdCount;
      const { count: aaTxCount } = await tx.aaTransaction.deleteMany({ where: { userId } });
      deleted.aaTransactions = aaTxCount;
      const { count: aaConsentCount } = await tx.aaConsent.deleteMany({ where: { userId } });
      deleted.aaConsents = aaConsentCount;

      // ── 11. Receipt/bill DB rows (storage files deleted post-commit) ──────
      const { count: billCount } = await tx.expenseBill.deleteMany({ where: { userId } });
      deleted.expenseBills = billCount;

      // ── 12. Misc platform data ───────────────────────────────────────────
      const { count: ufCount } = await tx.user_features.deleteMany({ where: { user_id: userId } });
      deleted.userFeatures = ufCount;
      const { count: cpCount } = await tx.collaborationParticipant.deleteMany({ where: { invitedBy: userId } });
      deleted.collaborationParticipants = cpCount;
      // NOTE: AuditLog intentionally excluded — append-only DB trigger (P0001)
      const { count: sqCount } = await tx.syncQueue.deleteMany({ where: { userId } });
      deleted.syncQueues = sqCount;

      // ── 13. Advisor / booking / chat ─────────────────────────────────────
      const { count: chatCount } = await tx.chatMessage.deleteMany({ where: { senderId: userId } });
      deleted.chatMessages = chatCount;
      const { count: sessCount } = await tx.advisorSession.deleteMany({ where: { clientId: userId } });
      deleted.advisorSessions = sessCount;
      const { count: bookCount } = await tx.bookingRequest.deleteMany({ where: { clientId: userId } });
      deleted.bookingRequests = bookCount;
      const { count: payCount } = await tx.payment.deleteMany({ where: { clientId: userId } });
      deleted.payments = payCount;
      const { count: availCount } = await tx.advisorAvailability.deleteMany({ where: { advisorId: userId } });
      deleted.advisorAvailability = availCount;
      const { count: appCount } = await tx.advisorApplication.deleteMany({ where: { userId } });
      deleted.advisorApplications = appCount;

      // ── 14. Raw SQL tables (no Prisma model) ─────────────────────────────
      await tx.$executeRawUnsafe(
        'DELETE FROM public.todo_list_shares WHERE shared_with_user_id = $1::uuid OR shared_by = $1::uuid OR list_id IN (SELECT id FROM public.todo_lists WHERE user_id = $1::uuid)',
        userId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM public.todo_items WHERE user_id = $1::uuid OR list_id IN (SELECT id FROM public.todo_lists WHERE user_id = $1::uuid)',
        userId,
      );
      await tx.$executeRawUnsafe('DELETE FROM public.todo_lists WHERE user_id = $1::uuid', userId);
      await tx.$executeRawUnsafe('DELETE FROM public.user_learning WHERE user_id = $1', userId);

      // ── 14b. Snapshot Invalidation (delete derived rows) ─────────────────
      const { count: dailyBalances } = await tx.dailyAccountBalance.deleteMany({ where: { userId } });
      const { count: monthlySpend } = await tx.monthlyCategorySpend.deleteMany({ where: { userId } });
      const { count: monthlyCashflow } = await tx.monthlyCashflow.deleteMany({ where: { userId } });
      deleted.dailyBalances = dailyBalances;
      deleted.monthlyCategorySpends = monthlySpend;
      deleted.monthlyCashflows = monthlyCashflow;

      // ── 15. Accounts (last — all FK children are gone) ───────────────────
      const { count: accCount } = await tx.account.deleteMany({ where: { userId } });
      deleted.accounts = accCount;

      // ── 16. Reset UserSettings to factory defaults (keep the row) ────────
      // Retrieve current values to compute the incremented version
      const currentSettings = await tx.userSettings.findUnique({
        where: { userId },
        select: { factoryResetVersion: true },
      });
      const nextVersion = (currentSettings?.factoryResetVersion ?? 0) + 1;

      // upsert, not update: a user who never touched their settings has no
      // UserSettings row yet, and update() would throw P2025 and abort the
      // entire factory-reset transaction with a 500.
      const factoryDefaults = {
        theme: 'light',
        language: 'en',
        currency: 'INR',
        timezone: 'UTC',
        settings: {},
        lastFactoryResetAt: new Date(),
        factoryResetVersion: nextVersion,
      };
      await tx.userSettings.upsert({
        where: { userId },
        update: { ...factoryDefaults, factoryResetCount: { increment: 1 } },
        create: { userId, ...factoryDefaults, factoryResetCount: 1 },
      });

      const p1End = Date.now();
      timings.phase1 = p1End - p1Start;

      // ── Phase 2: In-transaction verification ─────────────────────────────
      const p2Start = Date.now();
      const verification = {
        accounts:             await tx.account.count({ where: { userId } }),
        transactions:         await tx.transaction.count({ where: { userId } }),
        goals:                await tx.goal.count({ where: { userId } }),
        loans:                await tx.loan.count({ where: { userId } }),
        budgets:              await tx.budget.count({ where: { userId } }),
        friends:              await tx.friend.count({ where: { userId } }),
        investments:          await tx.investment.count({ where: { userId } }),
        recurringTransactions: await tx.recurringTransaction.count({ where: { userId } }),
        syncQueues:           await tx.syncQueue.count({ where: { userId } }),
        expenseBills:         await tx.expenseBill.count({ where: { userId } }),
        aaConsents:           await tx.aaConsent.count({ where: { userId } }),
        dailyBalances:        await tx.dailyAccountBalance.count({ where: { userId } }),
        monthlySpend:         await tx.monthlyCategorySpend.count({ where: { userId } }),
        monthlyCashflow:      await tx.monthlyCashflow.count({ where: { userId } }),
      };

      const firstDirty = Object.entries(verification).find(([, n]) => n > 0);
      if (firstDirty) {
        const [table, count] = firstDirty;
        throw new Error(`VERIFY_FAILED:${table}:${count}`);
      }
      timings.phase2 = Date.now() - p2Start;

      // Attach verification and new version to outer scope
      (req as any).__clearVerification = verification;
      (req as any).__resetVersion = nextVersion;

    }, { timeout: 30_000 });

    const verification: Record<string, number> = (req as any).__clearVerification ?? {};
    const nextVersion: number = (req as any).__resetVersion ?? 1;

    // ── Phase 3: Supabase Storage cleanup ────────────────────────────────────
    const p3Start = Date.now();
    const storageResults = storagePathsToDelete.length > 0
      ? await Promise.allSettled(storagePathsToDelete.map(p => removeObject(p)))
      : [];

    const storageSucceeded = storageResults.filter(r => r.status === 'fulfilled').length;
    const storageFailed    = storageResults.filter(r => r.status === 'rejected').length;
    const storageErrors    = storageResults
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => String(r.reason?.message ?? r.reason));
    timings.phase3 = Date.now() - p3Start;

    // ── Phase 4: Cache bust ───────────────────────────────────────────────────
    const p4Start = Date.now();
    await cacheDeleteByUserId(userId).catch(() => {});
    timings.phase4 = Date.now() - p4Start;

    // ── Phase 5: Post-commit integrity and application checks ────────────────
    const p5Start = Date.now();
    // ── Phase 5a: Post-commit integrity check (user-scoped ledger) ───────────
    const [orphanTransactions, orphanJournalEntries] = await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      prisma.journalEntry.count({ where: { userId } }),
    ]);

    // ── Phase 5b: Post-commit application-layer verification ─────────────────
    // Query counts directly from DB to verify APIs would return empty lists.
    const [appAccounts, appTransactions, appBudgets, appGoals] = await Promise.all([
      prisma.account.count({ where: { userId, deletedAt: null } }),
      prisma.transaction.count({ where: { userId, deletedAt: null } }),
      prisma.budget.count({ where: { userId, deletedAt: null } }),
      prisma.goal.count({ where: { userId, deletedAt: null } }),
    ]);

    const isAppLayerEmpty = appAccounts === 0 && appTransactions === 0 && appBudgets === 0 && appGoals === 0;

    const integrityStatus = orphanTransactions === 0 && orphanJournalEntries === 0 && isAppLayerEmpty
      ? 'clean'
      : 'warning';
    timings.phase5 = Date.now() - p5Start;

    // ── Phase 6: Factory Reset Report ────────────────────────────────────────
    const durationMs = Date.now() - startMs;

    const report = {
      success: true,
      factoryResetId,
      factoryResetVersion,
      durationMs,
      timings,
      resetMetadata: {
        lastFactoryResetAt: new Date(),
        factoryResetCount:  deleted.accounts > 0 ? undefined : undefined, // increment handled by prisma update
        factoryResetVersion: nextVersion,
      },
      summary: {
        financial: {
          accounts:       deleted.accounts       ?? 0,
          transactions:   deleted.transactions    ?? 0,
          journalEntries: deleted.journalEntries  ?? 0,
        },
        goals: {
          goals:                deleted.goals              ?? 0,
          goalContributions:    deleted.goalContributions  ?? 0,
          goalMembers:          deleted.goalMembers        ?? 0,
        },
        groups: {
          groupExpenses:        deleted.groupExpenses       ?? 0,
          groupExpenseMembers:  deleted.groupExpenseMembers ?? 0,
        },
        loans: {
          loans:        deleted.loans        ?? 0,
          loanPayments: deleted.loanPayments ?? 0,
        },
        investments:    { investments: deleted.investments ?? 0 },
        gold:           { goldAssets:  deleted.goldAssets  ?? 0 },
        budgets:        { budgets:     deleted.budgets     ?? 0 },
        recurring: {
          recurringTransactions: deleted.recurringTransactions ?? 0,
          recurringExecutions:   deleted.recurringExecutions   ?? 0,
        },
        social: {
          friends:       deleted.friends       ?? 0,
          notifications: deleted.notifications ?? 0,
          devices:       deleted.devices       ?? 0,
          todos:         deleted.todos         ?? 0,
        },
        advisor: {
          advisorSessions:       deleted.advisorSessions       ?? 0,
          bookingRequests:       deleted.bookingRequests       ?? 0,
          payments:              deleted.payments              ?? 0,
          advisorAvailability:   deleted.advisorAvailability   ?? 0,
          advisorApplications:   deleted.advisorApplications   ?? 0,
          chatMessages:          deleted.chatMessages          ?? 0,
        },
        data: {
          importLogs:              deleted.importLogs               ?? 0,
          aiScans:                 deleted.aiScans                  ?? 0,
          aiInsights:              deleted.aiInsights               ?? 0,
          aiEvents:                deleted.aiEvents                 ?? 0,
          otpCodes:                deleted.otpCodes                 ?? 0,
          otpRequests:             deleted.otpRequests              ?? 0,
          userFeatures:            deleted.userFeatures             ?? 0,
          collaborationParticipants: deleted.collaborationParticipants ?? 0,
          syncQueues:              deleted.syncQueues               ?? 0,
        },
        aa: {
          aaConsents:      deleted.aaConsents     ?? 0,
          aaDataSessions:  deleted.aaDataSessions ?? 0,
          aaFinancialData: deleted.aaFinancialData ?? 0,
          aaTransactions:  deleted.aaTransactions  ?? 0,
        },
        uploads: {
          expenseBills: deleted.expenseBills ?? 0,
        },
        snapshots: {
          dailyBalances:   deleted.dailyBalances        ?? 0,
          monthlySpends:   deleted.monthlyCategorySpends ?? 0,
          monthlyCashflow: deleted.monthlyCashflows     ?? 0,
        },
      },
      verification,
      storage: {
        attempted:  storagePathsToDelete.length,
        succeeded:  storageSucceeded,
        failed:     storageFailed,
        errors:     storageErrors,
      },
      integrity: {
        orphanTransactions,
        orphanJournalEntries,
        appLayerEmpty: isAppLayerEmpty,
        status: integrityStatus,
      },
      preserved: {
        auditLog:       'append-only — DB trigger prevents deletion',
        financialEvents:'event store — replay / audit history',
        snapshots:      'derived data — deleted and re-created empty',
        refreshTokens:  'kept — current session remains active',
        userProfile:    'kept — identity preserved',
        userSettings:   'reset to factory defaults',
      },
      clientActions: {
        clearDexie:           true,
        clearReactQuery:      true,
        clearBroadcastChannel: true,
        reload:               true,
      },
    };

    // ── 7. Event Store Lifecycle marker (COMPLETED) ──────────────────────────
    await FinancialEventStore.recordFactoryReset(userId, 'COMPLETED', {
      factoryResetId,
      factoryResetVersion,
      durationMs,
      timings,
      summary: report.summary,
      integrity: report.integrity,
    });

    // Store idempotency response if key exists
    if (clientKey) {
      await storeIdempotentResponse(userId, 'clearAllUserData', clientKey, report);
    }

    res.json(report);

  } catch (error: any) {
    // ── 8. Event Store Lifecycle marker (FAILED) ─────────────────────────────
    await FinancialEventStore.recordFactoryReset(userId, 'FAILED', {
      error: error.message || String(error),
      durationMs: Date.now() - startMs,
    });

    if (error?.message?.startsWith('VERIFY_FAILED:')) {
      const [, table, count] = error.message.split(':');
      return res.status(500).json({
        success: false,
        durationMs: Date.now() - startMs,
        error: 'Verification failed — all deletions rolled back',
        detail: { table, remaining: Number(count) },
      });
    }

    console.error('[clearAllUserData] Failed:', error);
    res.status(500).json({
      success: false,
      durationMs: Date.now() - startMs,
      error: error.message || 'Failed to clear user data',
    });
  } finally {
    // ── 9. Unlock and Unmark Worker Skip Set ─────────────────────────────────
    unmarkUserClearing(userId);
    await releaseClearDataLock(userId);
  }
};


