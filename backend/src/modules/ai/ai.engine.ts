import { randomUUID } from 'crypto';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { AIInsightRecord, AIInsightType, AIOverview, AIUserIntelligenceRow, UserFeatureSnapshot } from './ai.types';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let featureInterval: NodeJS.Timeout | null = null;
let predictionInterval: NodeJS.Timeout | null = null;

const safeJsonParse = <T>(value: string | null | any, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T; // Handle cases where pg/prisma might already parse JSON
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toTwoDecimals = (value: number) => Number(value.toFixed(2));

const getWeekdayName = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'long' });

let aiTablesReady = false;

const ensureAITables = async () => {
  if (aiTablesReady) return;
  try {
    // We cannot rely on Prisma migrations for Supabase cross-schema tables,
    // so we must create them explicitly if they don't exist.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_features (
        user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        avg_spend NUMERIC DEFAULT 0,
        monthly_income NUMERIC DEFAULT 0,
        savings_rate NUMERIC DEFAULT 0,
        top_category VARCHAR(100),
        risk_score NUMERIC DEFAULT 0,
        peak_day VARCHAR(20),
        feature_data_json JSONB,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ai_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        insight_type VARCHAR(50) NOT NULL,
        insight_data_json JSONB NOT NULL,
        confidence NUMERIC(4,2) NOT NULL DEFAULT 0.0,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (user_id, insight_type)
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ai_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        metadata_json JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ai_model_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_type VARCHAR(50) NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) DEFAULT 'running',
        processed_users INTEGER DEFAULT 0,
        notes TEXT
      );
    `);
    
    aiTablesReady = true;
    logger.info('AI tables verified via DDL execution');
  } catch (error) {
    logger.error('Failed to create AI tables in DB:', { error });
  }
};

const insertModelRun = async (runType: 'feature_engineering' | 'prediction_engine') => {
  const id = randomUUID();
  const startedAt = new Date();

  await prisma.$executeRaw`
    INSERT INTO ai_model_runs (id, run_type, status, started_at, processed_users)
    VALUES (${id}, ${runType}, 'running', ${startedAt}, 0)
  `;

  return { id, startedAt: startedAt.toISOString() };
};

const updateModelRun = async (
  id: string,
  status: 'completed' | 'failed',
  processedUsers: number,
  notes?: string,
) => {
  const completedAt = new Date();
  await prisma.$executeRaw`
    UPDATE ai_model_runs
    SET status = ${status},
        completed_at = ${completedAt},
        processed_users = ${processedUsers},
        notes = ${notes ?? null}
    WHERE id = ${id}
  `;
};

export const recordAIEvent = async (
  userId: string,
  eventType: string,
  metadata: Record<string, unknown>,
) => {
  await ensureAITables();
  await prisma.$executeRaw`
    INSERT INTO ai_events (id, user_id, event_type, metadata_json, created_at)
    VALUES (${randomUUID()}, ${userId}, ${eventType}, ${metadata}, ${new Date()})
  `;
};

const getRecentTransactions = async (userId: string, days: number) => {
  const fromDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  return prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      date: { gte: fromDate },
    },
    select: {
      amount: true,
      type: true,
      category: true,
      date: true,
      merchant: true,
      description: true,
    },
    orderBy: { date: 'asc' },
  });
};

const buildFeatureSnapshot = async (userId: string): Promise<UserFeatureSnapshot> => {
  const transactions = await getRecentTransactions(userId, 90);
  const loans = await prisma.loan.findMany({
    where: { userId, deletedAt: null },
    select: { outstandingBalance: true, principalAmount: true, status: true },
  });

  const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');
  const incomeTransactions = transactions.filter((tx) => tx.type === 'income');

  const expenseTotal = expenseTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const incomeTotal = incomeTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const periodDays = transactions.length > 1
    ? Math.max(1, Math.ceil((transactions[transactions.length - 1]!.date.getTime() - transactions[0]!.date.getTime()) / (24 * 60 * 60 * 1000)))
    : 30;

  const avgSpend = expenseTotal / periodDays;
  const monthlyIncome = incomeTotal * (30 / periodDays);
  const savingsRate = incomeTotal > 0 ? clamp((incomeTotal - expenseTotal) / incomeTotal, -1, 1) : 0;

  const categoryTotals = expenseTransactions.reduce<Record<string, number>>((acc, tx) => {
    const key = tx.category || 'Uncategorized';
    acc[key] = (acc[key] ?? 0) + Number(tx.amount);
    return acc;
  }, {});

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const [topCategory = 'Uncategorized', topCategoryAmount = 0] = sortedCategories[0] ?? ['Uncategorized', 0];

  const weekdayTotals = expenseTransactions.reduce<Record<string, number>>((acc, tx) => {
    const day = getWeekdayName(tx.date);
    acc[day] = (acc[day] ?? 0) + Number(tx.amount);
    return acc;
  }, {});

  const peakDay = Object.entries(weekdayTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

  const avgExpenseTransaction = expenseTransactions.length > 0 ? expenseTotal / expenseTransactions.length : 0;
  const maxExpenseTransaction = expenseTransactions.reduce((max, tx) => Math.max(max, Number(tx.amount)), 0);

  const overspendPressure = incomeTotal > 0 ? expenseTotal / incomeTotal : (expenseTotal > 0 ? 1.2 : 0);
  const categoryConcentration = expenseTotal > 0 ? topCategoryAmount / expenseTotal : 0;
  const spikeRatio = avgExpenseTransaction > 0 ? maxExpenseTransaction / avgExpenseTransaction : 1;

  const loanPressure = loans.length > 0
    ? loans.reduce((sum, loan) => {
      if (Number(loan.principalAmount) <= 0) return sum;
      return sum + clamp(Number(loan.outstandingBalance) / Number(loan.principalAmount), 0, 1.5);
    }, 0) / loans.length
    : 0;

  const riskScore = clamp(
    ((clamp((overspendPressure - 0.7) / 0.8, 0, 1) * 35)
      + (clamp((categoryConcentration - 0.35) / 0.65, 0, 1) * 25)
      + (clamp((spikeRatio - 1.8) / 3, 0, 1) * 25)
      + (clamp(loanPressure / 1.2, 0, 1) * 15)),
    0,
    100,
  );

  const featureData: Record<string, unknown> = {
    totals: {
      expenseTotal: toTwoDecimals(expenseTotal),
      incomeTotal: toTwoDecimals(incomeTotal),
    },
    transactionCounts: {
      total: transactions.length,
      expense: expenseTransactions.length,
      income: incomeTransactions.length,
    },
    categoryTotals,
    weekdayTotals,
    derived: {
      periodDays,
      overspendPressure: toTwoDecimals(overspendPressure),
      categoryConcentration: toTwoDecimals(categoryConcentration),
      spikeRatio: toTwoDecimals(spikeRatio),
      loanPressure: toTwoDecimals(loanPressure),
    },
  };

  const snapshot: UserFeatureSnapshot = {
    userId,
    avgSpend: toTwoDecimals(avgSpend),
    monthlyIncome: toTwoDecimals(monthlyIncome),
    savingsRate: toTwoDecimals(savingsRate),
    topCategory,
    riskScore: toTwoDecimals(riskScore),
    peakDay,
    featureData,
    updatedAt: new Date().toISOString(),
  };

  await prisma.$executeRaw`
    INSERT INTO user_features (
      user_id, avg_spend, monthly_income, savings_rate, top_category, risk_score, peak_day, feature_data_json, updated_at
    )
    VALUES (
      ${snapshot.userId},
      ${snapshot.avgSpend},
      ${snapshot.monthlyIncome},
      ${snapshot.savingsRate},
      ${snapshot.topCategory},
      ${snapshot.riskScore},
      ${snapshot.peakDay},
      ${snapshot.featureData},
      ${new Date()}
    )
    ON CONFLICT(user_id) DO UPDATE SET
      avg_spend = EXCLUDED.avg_spend,
      monthly_income = EXCLUDED.monthly_income,
      savings_rate = EXCLUDED.savings_rate,
      top_category = EXCLUDED.top_category,
      risk_score = EXCLUDED.risk_score,
      peak_day = EXCLUDED.peak_day,
      feature_data_json = EXCLUDED.feature_data_json,
      updated_at = EXCLUDED.updated_at
  `;

  await recordAIEvent(userId, 'features_refreshed', {
    avgSpend: snapshot.avgSpend,
    monthlyIncome: snapshot.monthlyIncome,
    savingsRate: snapshot.savingsRate,
    topCategory: snapshot.topCategory,
    riskScore: snapshot.riskScore,
  });

  return snapshot;
};

const buildRecurringCandidates = async (userId: string) => {
  const recentExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      type: 'expense',
      date: { gte: new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)) },
    },
    select: { amount: true, category: true, merchant: true, date: true },
  });

  const buckets = new Map<string, { count: number; amount: number; category: string }>();

  recentExpenses.forEach((expense) => {
    const rounded = Math.round(Number(expense.amount));
    const category = expense.category || 'Uncategorized';
    const key = `${category}::${rounded}`;
    const item = buckets.get(key) ?? { count: 0, amount: rounded, category };
    item.count += 1;
    buckets.set(key, item);
  });

  return Array.from(buckets.values())
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count);
};

const computeIncomeGapStdDev = async (userId: string) => {
  const incomes = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      type: 'income',
      date: { gte: new Date(Date.now() - (120 * 24 * 60 * 60 * 1000)) },
    },
    select: { date: true },
    orderBy: { date: 'asc' },
  });

  if (incomes.length < 3) return 0;

  const dayGaps: number[] = [];
  for (let index = 1; index < incomes.length; index += 1) {
    const prev = incomes[index - 1]!.date.getTime();
    const next = incomes[index]!.date.getTime();
    dayGaps.push((next - prev) / (24 * 60 * 60 * 1000));
  }

  const mean = dayGaps.reduce((sum, value) => sum + value, 0) / dayGaps.length;
  const variance = dayGaps.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / dayGaps.length;
  return Math.sqrt(variance);
};

const buildGoalInsights = async (userId: string, snapshot: UserFeatureSnapshot) => {
  const goals = await prisma.goal.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, targetAmount: true, currentAmount: true, targetDate: true },
  });

  const income = Number((snapshot.featureData.totals as { incomeTotal?: number } | undefined)?.incomeTotal ?? 0);
  const expense = Number((snapshot.featureData.totals as { expenseTotal?: number } | undefined)?.expenseTotal ?? 0);
  const periodDays = Number((snapshot.featureData.derived as { periodDays?: number } | undefined)?.periodDays ?? 30);
  const dailySavingsPotential = periodDays > 0 ? Math.max(0, (income - expense) / periodDays) : 0;

  const results: Omit<AIInsightRecord, 'id' | 'userId' | 'createdAt'>[] = [];

  for (const goal of goals) {
    const daysLeft = Math.max(0, Math.ceil((goal.targetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
    const projected = Number(goal.currentAmount) + (dailySavingsPotential * daysLeft);
    const confidence = clamp(daysLeft > 0 ? projected / Math.max(Number(goal.targetAmount), 1) : 0, 0, 1);

    if (remaining <= 0) {
      continue;
    }

    if (daysLeft <= 0) {
      results.push({
        insightType: 'goal_risk_prediction',
        insightData: {
          goalId: goal.id,
          goalName: goal.name,
          status: 'missed_target_date',
          remainingAmount: toTwoDecimals(remaining),
          projectedAmount: toTwoDecimals(projected),
          suggestedDailySaving: toTwoDecimals(remaining / 30),
        },
        confidenceScore: 0.95,
      });
      continue;
    }

    if (projected < Number(goal.targetAmount)) {
      results.push({
        insightType: 'goal_risk_prediction',
        insightData: {
          goalId: goal.id,
          goalName: goal.name,
          status: 'at_risk',
          remainingAmount: toTwoDecimals(remaining),
          projectedAmount: toTwoDecimals(projected),
          daysLeft,
          suggestedDailySaving: toTwoDecimals(remaining / Math.max(daysLeft, 1)),
        },
        confidenceScore: clamp(1 - confidence, 0.55, 0.96),
      });
    }
  }

  return results;
};

const insertInsights = async (userId: string, insights: Omit<AIInsightRecord, 'id' | 'userId' | 'createdAt'>[]) => {
  if (!userId || insights.length === 0) return;

  for (const insight of insights) {
    await prisma.$executeRaw`
      INSERT INTO ai_insights (id, user_id, insight_type, insight_data_json, confidence_score, created_at)
      VALUES (
        ${randomUUID()},
        ${userId},
        ${insight.insightType},
        ${insight.insightData},
        ${toTwoDecimals(insight.confidenceScore)},
        ${new Date()}
      )
    `;
  }
};

const trimOldInsights = async (userId: string) => {
  await prisma.$executeRaw`
    DELETE FROM ai_insights
    WHERE user_id = ${userId}
      AND created_at < ${new Date(Date.now() - (90 * 24 * 60 * 60 * 1000))}
  `;
};

const runPredictionsForUser = async (snapshot: UserFeatureSnapshot) => {
  const userId = snapshot.userId;
  if (!userId) return;

  const insights: Omit<AIInsightRecord, 'id' | 'userId' | 'createdAt'>[] = [];
  const totals = (snapshot.featureData.totals ?? {}) as { incomeTotal?: number; expenseTotal?: number };
  const categoryTotals = (snapshot.featureData.categoryTotals ?? {}) as Record<string, number>;

  const incomeTotal = Number(totals.incomeTotal ?? 0);
  const expenseTotal = Number(totals.expenseTotal ?? 0);

  if (incomeTotal > 0 && expenseTotal > (incomeTotal * 0.95)) {
    insights.push({
      insightType: 'overspending_alert',
      insightData: {
        incomeTotal,
        expenseTotal,
        overspendRatio: toTwoDecimals(expenseTotal / incomeTotal),
      },
      confidenceScore: 0.88,
    });
  }

  const topCategoryAmount = categoryTotals[snapshot.topCategory] ?? 0;
  if (expenseTotal > 0 && (topCategoryAmount / expenseTotal) > 0.4) {
    insights.push({
      insightType: 'high_category_concentration',
      insightData: {
        category: snapshot.topCategory,
        spend: toTwoDecimals(topCategoryAmount),
        ratio: toTwoDecimals(topCategoryAmount / expenseTotal),
      },
      confidenceScore: 0.8,
    });
  }

  const recurringCandidates = await buildRecurringCandidates(userId);
  if (recurringCandidates.length > 0) {
    const candidate = recurringCandidates[0]!;
    insights.push({
      insightType: 'recurring_expense_detected',
      insightData: {
        category: candidate.category,
        amount: candidate.amount,
        occurrences: candidate.count,
      },
      confidenceScore: clamp(0.65 + (candidate.count * 0.05), 0.65, 0.95),
    });
  }

  const incomeStdDev = await computeIncomeGapStdDev(userId);
  if (incomeStdDev >= 8) {
    insights.push({
      insightType: 'income_irregularity',
      insightData: {
        gapStdDevDays: toTwoDecimals(incomeStdDev),
      },
      confidenceScore: clamp(0.6 + (incomeStdDev / 40), 0.6, 0.9),
    });
  }

  const recentExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'expense',
      deletedAt: null,
      date: { gte: new Date(Date.now() - (21 * 24 * 60 * 60 * 1000)) },
    },
    select: { amount: true, category: true, date: true },
  });

  const expenseAvg = recentExpenses.length > 0
    ? recentExpenses.reduce((sum, tx) => sum + Number(tx.amount), 0) / recentExpenses.length
    : 0;
  const spike = recentExpenses.find((tx) => Number(tx.amount) > (expenseAvg * 2.5));
  if (spike && expenseAvg > 0) {
    insights.push({
      insightType: 'unusual_spend_spike',
      insightData: {
        amount: toTwoDecimals(Number(spike.amount)),
        category: spike.category,
        date: spike.date.toISOString(),
        baseline: toTwoDecimals(expenseAvg),
      },
      confidenceScore: 0.87,
    });
  }

  const goalInsights = await buildGoalInsights(userId, snapshot);
  insights.push(...goalInsights);

  await trimOldInsights(userId);
  await insertInsights(userId, insights);

  await recordAIEvent(userId, 'predictions_generated', {
    generatedInsights: insights.length,
    riskScore: snapshot.riskScore,
  });
};

const getOrCreateFeatureSnapshot = async (userId: string): Promise<UserFeatureSnapshot> => {
  const rows = await prisma.$queryRaw<Array<{
    userid: string;
    avgspend: number;
    monthlyincome: number;
    savingsrate: number;
    topcategory: string;
    riskscore: number;
    peakday: string;
    featuredata: any;
    updatedat: Date;
  }>>`
    SELECT
      user_id as userid,
      avg_spend as avgspend,
      monthly_income as monthlyincome,
      savings_rate as savingsrate,
      top_category as topcategory,
      risk_score as riskscore,
      peak_day as peakday,
      feature_data_json as featuredata,
      updated_at as updatedat
    FROM user_features
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const existing = rows[0];
  if (existing) {
    return {
      userId: existing.userid,
      avgSpend: Number(existing.avgspend),
      monthlyIncome: Number(existing.monthlyincome),
      savingsRate: Number(existing.savingsrate),
      topCategory: existing.topcategory,
      riskScore: Number(existing.riskscore),
      peakDay: existing.peakday,
      featureData: safeJsonParse<Record<string, unknown>>(existing.featuredata, {}),
      updatedAt: existing.updatedat.toISOString(),
    };
  }

  return buildFeatureSnapshot(userId);
};

const getProcessableUserIds = async () => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['user', 'advisor', 'admin'] }, isApproved: true },
    select: { id: true },
  });
  return users.map((user) => user.id);
};

export const runFeatureEngineeringForAllUsers = async () => {
  await ensureAITables();
  const run = await insertModelRun('feature_engineering');
  const userIds = await getProcessableUserIds();
  let processedUsers = 0;

  try {
    for (const userId of userIds) {
      await buildFeatureSnapshot(userId);
      processedUsers += 1;
    }

    await updateModelRun(run.id, 'completed', processedUsers);
    logger.info('AI feature engineering completed', { processedUsers });
    return { processedUsers };
  } catch (error) {
    await updateModelRun(run.id, 'failed', processedUsers, error instanceof Error ? error.message : 'Unknown failure');
    logger.error('AI feature engineering failed', { error, processedUsers });
    throw error;
  }
};

export const runPredictionEngineForAllUsers = async () => {
  await ensureAITables();
  const run = await insertModelRun('prediction_engine');
  const userIds = await getProcessableUserIds();
  let processedUsers = 0;

  try {
    for (const userId of userIds) {
      const snapshot = await getOrCreateFeatureSnapshot(userId);
      await runPredictionsForUser(snapshot);
      processedUsers += 1;
    }

    await updateModelRun(run.id, 'completed', processedUsers);
    logger.info('AI prediction engine completed', { processedUsers });
    return { processedUsers };
  } catch (error) {
    await updateModelRun(run.id, 'failed', processedUsers, error instanceof Error ? error.message : 'Unknown failure');
    logger.error('AI prediction engine failed', { error, processedUsers });
    throw error;
  }
};

export const getAIOverview = async (): Promise<AIOverview> => {
  await ensureAITables();

  const [usersAnalyzedRow] = await prisma.$queryRaw<Array<{ count: string | number }>>`
    SELECT COUNT(*) as count FROM user_features
  `;

  const [insightsRow] = await prisma.$queryRaw<Array<{ count: string | number }>>`
    SELECT COUNT(*) as count FROM ai_insights
  `;

  const [eventsRow] = await prisma.$queryRaw<Array<{ count: string | number }>>`
    SELECT COUNT(*) as count FROM ai_events
  `;

  const [riskRow] = await prisma.$queryRaw<Array<{ count: string | number }>>`
    SELECT COUNT(*) as count FROM ai_insights
    WHERE insight_type IN ('overspending_alert', 'unusual_spend_spike', 'goal_risk_prediction')
      AND created_at >= ${new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))}
  `;

  const [lastRun] = await prisma.$queryRaw<Array<{ completedat: Date | null }>>`
    SELECT completed_at as completedat
    FROM ai_model_runs
    WHERE run_type = 'prediction_engine' AND status = 'completed'
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return {
    usersAnalyzed: Number(usersAnalyzedRow?.count ?? 0),
    activeModels: 5,
    lastTrainingTime: lastRun?.completedat ? lastRun.completedat.toISOString() : null,
    dataProcessed: Number(eventsRow?.count ?? 0),
    insightsGenerated: Number(insightsRow?.count ?? 0),
    riskAlerts: Number(riskRow?.count ?? 0),
  };
};

export const getAIUserIntelligence = async (limit: number): Promise<AIUserIntelligenceRow[]> => {
  await ensureAITables();

  const rows = await prisma.$queryRaw<Array<{
    userid: string;
    email: string;
    name: string;
    avgspend: number;
    riskscore: number;
    savingsrate: number;
    topcategory: string;
  }>>`
    SELECT
      u.id as userid,
      u.email as email,
      u.name as name,
      COALESCE(f.avg_spend, 0) as avgspend,
      COALESCE(f.risk_score, 0) as riskscore,
      COALESCE(f.savings_rate, 0) as savingsrate,
      COALESCE(f.top_category, 'Uncategorized') as topcategory
    FROM "User" u
    LEFT JOIN user_features f ON f.user_id = u.id
    ORDER BY f.risk_score DESC, f.avg_spend DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    userId: row.userid,
    email: row.email,
    name: row.name,
    spendScore: clamp(toTwoDecimals((Number(row.avgspend) / 1200) * 100), 0, 100),
    riskScore: toTwoDecimals(Number(row.riskscore)),
    savingsRate: toTwoDecimals(Number(row.savingsrate)),
    topCategory: row.topcategory,
    avgSpend: toTwoDecimals(Number(row.avgspend)),
  }));
};

export const getAIInsightsFeed = async (limit: number) => {
  await ensureAITables();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    userid: string;
    useremail: string;
    insighttype: string;
    insightdata: any;
    confidencescore: number;
    createdat: Date;
  }>>`
    SELECT
      i.id,
      i.user_id as userid,
      u.email as useremail,
      i.insight_type as insighttype,
      i.insight_data_json as insightdata,
      i.confidence_score as confidencescore,
      i.created_at as createdat
    FROM ai_insights i
    LEFT JOIN "User" u ON u.id = i.user_id
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    userId: row.userid,
    userEmail: row.useremail,
    insightType: row.insighttype,
    insightData: safeJsonParse<Record<string, unknown>>(row.insightdata, {}),
    confidenceScore: Number(row.confidencescore),
    createdAt: row.createdat.toISOString(),
  }));
};

export const getAIPatternAnalytics = async () => {
  await ensureAITables();

  const categoryRows = await prisma.$queryRaw<Array<{ category: string; users: string | number }>>`
    SELECT top_category as category, COUNT(*) as users
    FROM user_features
    GROUP BY top_category
    ORDER BY users DESC
    LIMIT 8
  `;

  const insightRows = await prisma.$queryRaw<Array<{ insighttype: string; total: string | number }>>`
    SELECT insight_type as insighttype, COUNT(*) as total
    FROM ai_insights
    WHERE created_at >= ${new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))}
    GROUP BY insight_type
    ORDER BY total DESC
  `;

  // PostgreSQL equivalent of strftime('%Y-%m', date) is to_char(date, 'YYYY-MM')
  const monthlyRows = await prisma.$queryRaw<Array<{ month: string; income: number; expense: number }>>`
    SELECT
      to_char(date, 'YYYY-MM') as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
    FROM "Transaction"
    WHERE "deletedAt" IS NULL
      AND date >= ${new Date(Date.now() - (180 * 24 * 60 * 60 * 1000))}
    GROUP BY to_char(date, 'YYYY-MM')
    ORDER BY month ASC
  `;

  return {
    categoryDistribution: categoryRows.map((row) => ({
      category: row.category,
      users: Number(row.users),
    })),
    insightTrends: insightRows.map((row) => ({
      insightType: row.insighttype,
      total: Number(row.total),
    })),
    monthlyGrowth: monthlyRows.map((row) => ({
      month: row.month,
      income: toTwoDecimals(Number(row.income)),
      expense: toTwoDecimals(Number(row.expense)),
      net: toTwoDecimals(Number(row.income) - Number(row.expense)),
    })),
  };
};

export const getAIAccuracyMonitor = async () => {
  await ensureAITables();

  const [totals] = await prisma.$queryRaw<Array<{ total: string | number; avgconfidence: number }>>`
    SELECT COUNT(*) as total, COALESCE(AVG(confidence_score), 0) as avgconfidence
    FROM ai_insights
  `;

  const [highConfidence] = await prisma.$queryRaw<Array<{ total: string | number }>>`
    SELECT COUNT(*) as total FROM ai_insights WHERE confidence_score >= 0.8
  `;

  const [falsePositives] = await prisma.$queryRaw<Array<{ total: string | number }>>`
    SELECT COUNT(*) as total
    FROM ai_events
    WHERE event_type = 'insight_marked_false_positive'
  `;

  const totalInsights = Number(totals?.total ?? 0);
  const high = Number(highConfidence?.total ?? 0);
  const falsePositiveCount = Number(falsePositives?.total ?? 0);

  return {
    totalPredictions: totalInsights,
    averageConfidence: toTwoDecimals(Number(totals?.avgconfidence ?? 0)),
    highConfidenceRate: totalInsights > 0 ? toTwoDecimals((high / totalInsights) * 100) : 0,
    falsePositiveRate: totalInsights > 0 ? toTwoDecimals((falsePositiveCount / totalInsights) * 100) : 0,
    successRate: totalInsights > 0 ? toTwoDecimals(((high - falsePositiveCount) / totalInsights) * 100) : 0,
  };
};

export const getAIRawUserData = async (userId: string) => {
  await ensureAITables();

  const [featureRow] = await prisma.$queryRaw<Array<{
    userid: string;
    avgspend: number;
    monthlyincome: number;
    savingsrate: number;
    topcategory: string;
    riskscore: number;
    peakday: string;
    featuredata: any;
    updatedat: Date;
  }>>`
    SELECT
      user_id as userid,
      avg_spend as avgspend,
      monthly_income as monthlyincome,
      savings_rate as savingsrate,
      top_category as topcategory,
      risk_score as riskscore,
      peak_day as peakday,
      feature_data_json as featuredata,
      updated_at as updatedat
    FROM user_features
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const insightRows = await prisma.$queryRaw<Array<{
    id: string;
    insighttype: string;
    insightdata: any;
    confidencescore: number;
    createdat: Date;
  }>>`
    SELECT
      id,
      insight_type as insighttype,
      insight_data_json as insightdata,
      confidence_score as confidencescore,
      created_at as createdat
    FROM ai_insights
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 30
  `;

  const eventRows = await prisma.$queryRaw<Array<{
    id: string;
    eventtype: string;
    metadata: any;
    createdat: Date;
  }>>`
    SELECT
      id,
      event_type as eventtype,
      metadata_json as metadata,
      created_at as createdat
    FROM ai_events
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 40
  `;

  return {
    features: featureRow ? {
      userId: featureRow.userid,
      avgSpend: Number(featureRow.avgspend),
      monthlyIncome: Number(featureRow.monthlyincome),
      savingsRate: Number(featureRow.savingsrate),
      topCategory: featureRow.topcategory,
      riskScore: Number(featureRow.riskscore),
      peakDay: featureRow.peakday,
      featureData: safeJsonParse<Record<string, unknown>>(featureRow.featuredata, {}),
      updatedAt: featureRow.updatedat.toISOString(),
    } : null,
    insights: insightRows.map((row) => ({
      id: row.id,
      insightType: row.insighttype,
      insightData: safeJsonParse<Record<string, unknown>>(row.insightdata, {}),
      confidenceScore: Number(row.confidencescore),
      createdAt: row.createdat.toISOString(),
    })),
    events: eventRows.map((row) => ({
      id: row.id,
      eventType: row.eventtype,
      metadata: safeJsonParse<Record<string, unknown>>(row.metadata, {}),
      createdAt: row.createdat.toISOString(),
    })),
  };
};

const runEngineCycle = async () => {
  try {
    await runFeatureEngineeringForAllUsers();
    await runPredictionEngineForAllUsers();
  } catch (error) {
    logger.error('AI engine cycle failed', { error });
  }
};

export const startAIBackgroundJobs = () => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (featureInterval || predictionInterval) {
    return;
  }

  void ensureAITables()
    .then(async () => {
      await runEngineCycle();

      featureInterval = setInterval(() => {
        void runFeatureEngineeringForAllUsers().catch((error) => {
          logger.error('Scheduled feature engineering failed', { error });
        });
      }, SIX_HOURS_MS);

      predictionInterval = setInterval(() => {
        void runPredictionEngineForAllUsers().catch((error) => {
          logger.error('Scheduled prediction engine failed', { error });
        });
      }, TWENTY_FOUR_HOURS_MS);

      logger.info('AI background jobs started', {
        featureIntervalHours: 6,
        predictionIntervalHours: 24,
      });
    })
    .catch((error) => {
      logger.error('Failed to start AI background jobs', { error });
    });
};

export const stopAIBackgroundJobs = () => {
  if (featureInterval) {
    clearInterval(featureInterval);
    featureInterval = null;
  }

  if (predictionInterval) {
    clearInterval(predictionInterval);
    predictionInterval = null;
  }
};

export const initializeAIEngine = async () => {
  await ensureAITables();
};
