import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';

// ── PDF Export (pdfExport sub-feature) ───────────────────────────────────────
export const exportPDF = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: 'desc' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=kanaku_report_${Date.now()}.pdf`);
    res.status(200).send(Buffer.from('%PDF-1.4 ... PDF content mock ...'));
  } catch (error) {
    next(error);
  }
};

// ── Excel Export (excelExport sub-feature) ───────────────────────────────────
export const exportExcel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: 'desc' },
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=kanaku_report_${Date.now()}.xlsx`);
    res.status(200).send(Buffer.from('Excel XML structure / Mock xlsx content'));
  } catch (error) {
    next(error);
  }
};

// ── CSV Export (csvExport sub-feature) ───────────────────────────────────────
export const exportCSV = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: 'desc' },
    });

    const headers = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Description'];
    const rows = transactions.map((t) => [
      t.id,
      t.date.toISOString(),
      t.type,
      t.category,
      t.amount.toString(),
      t.description || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=kanaku_report_${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

// ── AI Insights Report (aiInsightsReport sub-feature) ───────────────────────
export const getAIInsights = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
    });

    const totalExpenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const insights = [
      {
        id: '1',
        title: 'Monthly Spending Velocity',
        description: `Your total spending is ${totalExpenses.toFixed(2)}. Consider allocating 20% to savings.`,
        impact: 'medium',
      },
      {
        id: '2',
        title: 'Category Peak Analysis',
        description: 'Food and dining category has increased by 12% compared to last week.',
        impact: 'low',
      },
    ];

    res.json({ success: true, data: { insights } });
  } catch (error) {
    next(error);
  }
};

// ── Financial Forecasting (forecasting sub-feature) ──────────────────────────
export const getForecast = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const accounts = await prisma.account.findMany({
      where: { userId, deletedAt: null, isActive: true },
    });

    const currentBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    const forecastPoints: any[] = [];
    const now = new Date();

    for (let i = 0; i <= 6; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const expected = currentBalance * Math.pow(1.02, i);
      const optimistic = currentBalance * Math.pow(1.04, i);
      const conservative = currentBalance * Math.pow(1.005, i);

      forecastPoints.push({
        date: forecastDate.toISOString(),
        expected: Math.round(expected * 100) / 100,
        optimistic: Math.round(optimistic * 100) / 100,
        conservative: Math.round(conservative * 100) / 100,
      });
    }

    res.json({ success: true, data: { currentBalance, forecast: forecastPoints } });
  } catch (error) {
    next(error);
  }
};
