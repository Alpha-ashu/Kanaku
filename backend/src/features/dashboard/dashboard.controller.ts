import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma, prismaRead } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { AppError } from '../../utils/AppError';

/**
 * GET /api/v1/dashboard/summary
 * Returns monthly spending, category breakdown, account totals, recent transactions.
 * Query params: month (YYYY-MM, defaults to current month)
 */
export const getDashboardSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const monthParam = req.query.month as string | undefined;

    const now = new Date();
    const year = monthParam ? parseInt(monthParam.slice(0, 4), 10) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam.slice(5, 7), 10) - 1 : now.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // All dashboard queries are read-only — route to replica for scale
    const [monthlyTotals, categoryBreakdown, accounts, recentTransactions] = await Promise.all([
      // 1. Monthly income vs expense totals
      prismaRead.$queryRaw<{ type: string; _sum: number }[]>`
        SELECT type, COALESCE(SUM(amount), 0) as "_sum"
        FROM "Transaction"
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND date >= ${startOfMonth}
          AND date <= ${endOfMonth}
          AND type IN ('income', 'expense')
        GROUP BY type
      `,

      // 2. Category breakdown for expenses this month (top 15)
      prismaRead.$queryRaw<{ category: string; total: number; count: number }[]>`
        SELECT category,
               COALESCE(SUM(amount), 0)::float as total,
               COUNT(*)::int as count
        FROM "Transaction"
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND type = 'expense'
          AND date >= ${startOfMonth}
          AND date <= ${endOfMonth}
        GROUP BY category
        ORDER BY total DESC
        LIMIT 15
      `,

      // 3. Account balances
      prismaRead.account.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: { id: true, name: true, type: true, balance: true, currency: true },
        orderBy: { name: 'asc' },
      }),

      // 4. Last 5 transactions
      prismaRead.transaction.findMany({
        where: { userId, deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true, type: true, amount: true, category: true,
          description: true, merchant: true, date: true,
          account: { select: { name: true } },
        },
      }),
    ]);

    const income = monthlyTotals.find((r) => r.type === 'income')?._sum ?? 0;
    const expense = monthlyTotals.find((r) => r.type === 'expense')?._sum ?? 0;
    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    res.json({
      success: true,
      data: {
        period: { year, month: month + 1 },
        monthlySpending: { income: Number(income), expense: Number(expense), net: Number(income) - Number(expense) },
        categoryBreakdown: categoryBreakdown.map((c) => ({
          category: c.category,
          total: Number(c.total),
          count: Number(c.count),
        })),
        accounts,
        totalBalance,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/dashboard/cashflow
 * Monthly cashflow for the last N months (default 6).
 * Query params: months (number, 1-24)
 */
export const getCashflow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const monthsBack = Math.min(24, Math.max(1, parseInt(req.query.months as string || '6', 10)));

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);

    const rows = await prisma.$queryRaw<{ month: string; type: string; total: number }[]>`
      SELECT TO_CHAR(date, 'YYYY-MM') as month,
             type,
             COALESCE(SUM(amount), 0)::float as total
      FROM "Transaction"
      WHERE "userId" = ${userId}
        AND "deletedAt" IS NULL
        AND type IN ('income', 'expense')
        AND date >= ${startDate}
      GROUP BY TO_CHAR(date, 'YYYY-MM'), type
      ORDER BY month
    `;

    // Pivot into { month, income, expense, net }
    const monthMap = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const entry = monthMap.get(row.month) ?? { income: 0, expense: 0 };
      if (row.type === 'income') entry.income = Number(row.total);
      if (row.type === 'expense') entry.expense = Number(row.total);
      monthMap.set(row.month, entry);
    }

    const cashflow = Array.from(monthMap.entries()).map(([month, v]) => ({
      month,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    res.json({ success: true, data: cashflow });
  } catch (error) {
    next(error);
  }
};
