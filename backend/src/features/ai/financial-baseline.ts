/**
 * Financial baseline resolver for AI agents.
 *
 * AI agents historically derived income purely from transaction history.
 * For a brand-new user (no transactions yet) this produced misleading
 * insights (income = 0 → health score 20, DTI 1.00, savings 0%). This
 * helper provides a single source of truth that falls back to the user's
 * DECLARED profile income (onboarding salary) and current account balances
 * so insights reflect the user's real financial picture from day one.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';

export type IncomeSource = 'transactions' | 'declared' | 'none';

export interface FinancialBaseline {
  /** Best available monthly income (transactions preferred, else declared). */
  monthlyIncome: number;
  /** Where `monthlyIncome` came from. */
  incomeSource: IncomeSource;
  /** Monthly income observed from the last 30 days of income transactions. */
  transactionMonthlyIncome: number;
  /** Monthly income declared during onboarding (profile / salary). */
  declaredMonthlyIncome: number;
  /** Sum of balances across the user's active, non-deleted accounts. */
  totalBalance: number;
}

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const dateRangeStart = (daysBack: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d;
};

/**
 * Resolve the declared monthly income from the profiles table (monthly)
 * or the User.salary column (annual → /12).
 */
const getDeclaredMonthlyIncome = async (userId: string): Promise<number> => {
  try {
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { monthly_income: true, annual_income: true },
    });
    if (profile?.monthly_income != null) {
      const monthly = toNum(profile.monthly_income);
      if (monthly > 0) return monthly;
    }
    if (profile?.annual_income != null) {
      const annual = toNum(profile.annual_income);
      if (annual > 0) return annual / 12;
    }
  } catch (error) {
    logger.warn('[financialBaseline] profiles lookup failed', { userId });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { salary: true },
    });
    if (user?.salary != null) {
      const annual = toNum(user.salary);
      if (annual > 0) return annual / 12;
    }
  } catch (error) {
    logger.warn('[financialBaseline] user lookup failed', { userId });
  }

  return 0;
};

/** Sum of balances across the user's active, non-deleted accounts. */
const getTotalAccountBalance = async (userId: string): Promise<number> => {
  try {
    const agg = await prisma.account.aggregate({
      where: { userId, isActive: true, deletedAt: null },
      _sum: { balance: true },
    });
    return toNum(agg._sum?.balance ?? 0);
  } catch (error) {
    logger.warn('[financialBaseline] account balance lookup failed', { userId });
    return 0;
  }
};

/** Monthly income observed from the last 30 days of income transactions. */
const getTransactionMonthlyIncome = async (userId: string): Promise<number> => {
  try {
    const agg = await prisma.transaction.aggregate({
      where: { userId, type: 'income', deletedAt: null, date: { gte: dateRangeStart(30) } },
      _sum: { amount: true },
    });
    return toNum(agg._sum?.amount ?? 0);
  } catch (error) {
    logger.warn('[financialBaseline] income transaction lookup failed', { userId });
    return 0;
  }
};

/**
 * Build a complete financial baseline for a user. Transaction-observed
 * income takes precedence (it's ground truth); when absent we fall back to
 * the declared onboarding income so insights are still meaningful.
 */
export const getFinancialBaseline = async (userId: string): Promise<FinancialBaseline> => {
  const [transactionMonthlyIncome, declaredMonthlyIncome, totalBalance] = await Promise.all([
    getTransactionMonthlyIncome(userId),
    getDeclaredMonthlyIncome(userId),
    getTotalAccountBalance(userId),
  ]);

  let monthlyIncome = 0;
  let incomeSource: IncomeSource = 'none';
  if (transactionMonthlyIncome > 0) {
    monthlyIncome = transactionMonthlyIncome;
    incomeSource = 'transactions';
  } else if (declaredMonthlyIncome > 0) {
    monthlyIncome = declaredMonthlyIncome;
    incomeSource = 'declared';
  }

  return {
    monthlyIncome,
    incomeSource,
    transactionMonthlyIncome,
    declaredMonthlyIncome,
    totalBalance,
  };
};

