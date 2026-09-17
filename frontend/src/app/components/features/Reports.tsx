import React, { useMemo, useState } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Share2,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  BarChart3,
  PieChart as PieIcon,
  Sparkles,
  Search,
  X,
  Layers,
  Activity,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Target,
  BadgePercent,
  Landmark,
  PiggyBank,
} from 'lucide-react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadFile, shareFile } from '@/lib/download';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { buildStatementReportInput, buildStatementReportPdf } from '@/lib/statementReportPdf';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { calculateAccountTotalBalance, calculateNetWorth } from '@/lib/financialMath';
import { isClosedInvestment } from '@/lib/investmentUtils';
import { AIInsightsCard } from '@/app/components/shared/AIInsightsCard';
import { cn } from '@/lib/utils';

const chartColors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];

interface ForecastSectionProps {
  transactions: any[];
  accounts: any[];
  currency: string;
  formatCurrency: (v: number) => string;
}

const ForecastSection: React.FC<ForecastSectionProps> = ({ transactions, accounts, currency, formatCurrency }) => {
  const forecastData = useMemo(() => {
    const monthlyNet: number[] = [];
    const monthlyMap = new Map<string, number>();

    transactions.forEach(t => {
      // A transfer moves money between the user's own accounts — counting it as
      // spending projected wealth falling every time they topped up a wallet.
      if (t.type !== 'income' && t.type !== 'expense') return;
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const delta = t.type === 'income' ? Number(t.amount) || 0 : -(Number(t.amount) || 0);
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + delta);
    });

    monthlyMap.forEach(val => monthlyNet.push(val));

    const avgMonthlyNet = monthlyNet.length > 0
      ? monthlyNet.reduce((a, b) => a + b, 0) / monthlyNet.length
      : 0;

    const accountsTotal = (accounts || []).reduce((sum, a) => sum + (Number(a?.balance) || 0), 0);
    const cumulativeNet = monthlyNet.reduce((a, b) => a + b, 0);
    const startValue = accountsTotal !== 0 ? accountsTotal : cumulativeNet;

    const data: Array<{ month: string; Optimistic: number; Conservative: number; Expected: number }> = [];
    const now = new Date();

    data.push({
      month: 'Now',
      Optimistic: startValue,
      Conservative: startValue,
      Expected: startValue,
    });

    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = futureDate.toLocaleDateString('en-US', { month: 'short' });

      // Scale toward the better outcome for optimistic and the worse for
      // conservative; plain ×1.3 / ×0.7 swapped them whenever the net was negative.
      const swing = Math.abs(avgMonthlyNet) * 0.3;
      const expected = startValue + avgMonthlyNet * i;
      const optimistic = startValue + (avgMonthlyNet + swing) * i;
      const conservative = startValue + (avgMonthlyNet - swing) * i;

      data.push({
        month: monthLabel,
        Optimistic: Math.round(optimistic),
        Conservative: Math.round(conservative),
        Expected: Math.round(expected),
      });
    }

    return data;
  }, [transactions, accounts]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 font-medium leading-relaxed">
        Based on your historical spending habits, here is a 6-month prediction of your wealth trajectory:
      </p>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => formatCurrency(Number(val))} />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
              formatter={(value) => [formatCurrency(Number(value)), '']}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
            <Line type="monotone" dataKey="Optimistic" stroke="#10B981" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="Expected" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366F1' }} />
            <Line type="monotone" dataKey="Conservative" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 text-xs font-medium text-indigo-900 flex items-center gap-2">
        <Sparkles size={15} className="text-indigo-600 shrink-0" />
        <span>Keep monthly expenses below average to track closer to the <strong>Optimistic</strong> trajectory.</span>
      </div>
    </div>
  );
};

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type ExportAction = 'download' | 'share' | 'csv' | 'excel' | 'more';
type AnalyticsTab = 'all' | 'cashflow' | 'spending' | 'wealth' | 'transactions';

export const Reports: React.FC = () => {
  const { transactions, accounts, loans, goals, investments, currency, setCurrentPage } = useApp();
  const canPdf = useSubFeature('reports', 'pdfExport');
  const canCsv = useSubFeature('reports', 'csvExport');
  const canExcel = useSubFeature('reports', 'excelExport');
  const canAiInsights = useSubFeature('reports', 'aiInsightsReport');
  const canForecasting = useSubFeature('reports', 'forecasting');

  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('spending');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeExportAction, setActiveExportAction] = useState<ExportAction | null>(null);

  const pulseExportAction = (action: ExportAction) => {
    setActiveExportAction(action);
    window.setTimeout(() => {
      setActiveExportAction((current) => (current === action ? null : current));
    }, 900);
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const dateRange = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    let start: Date | null = null;

    if (timeRange === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === 'weekly') {
      const temp = new Date(now);
      temp.setDate(now.getDate() - 6);
      start = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
    } else if (timeRange === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'yearly') {
      start = new Date(now.getFullYear(), 0, 1);
    } else if (timeRange === 'custom') {
      const parsedStart = parseDateInputValue(customRange.start);
      const parsedEnd = parseDateInputValue(customRange.end);
      if (parsedStart && parsedEnd) {
        start = parsedStart;
        end.setTime(parsedEnd.getTime());
      }
    }

    return { start, end };
  }, [timeRange, customRange]);

  const filteredTransactions = useMemo(() => {
    if (!dateRange.start) return transactions;

    const startKey = toLocalDateKey(dateRange.start);
    const endKey = toLocalDateKey(dateRange.end);
    if (!startKey || !endKey) return transactions;

    return transactions.filter((t) => {
      const key = toLocalDateKey(t.date);
      return !!key && key >= startKey && key <= endKey;
    });
  }, [transactions, dateRange]);

  const summaryStats = useMemo(() => {
    const totalIncome = filteredTransactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = filteredTransactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    const totalDebt = loans.filter((l) => l.status === 'active').reduce((sum, l) => sum + l.outstandingBalance, 0);
    const totalGoalsProgress = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalInvested = investments.reduce((sum, i) => sum + i.totalInvested, 0);

    return {
      totalIncome,
      totalExpenses,
      netSavings,
      savingsRate,
      totalDebt,
      totalGoalsProgress,
      totalInvested,
    };
  }, [filteredTransactions, loans, goals, investments]);

  const totalAccountBalance = useMemo(() => calculateAccountTotalBalance(accounts), [accounts]);

  const totalInvestmentValue = useMemo(() => {
    return investments
      .filter((i) => !i.deletedAt && !isClosedInvestment(i))
      .reduce((sum, i) => sum + (Number(i.currentValue ?? i.totalInvested ?? 0)), 0);
  }, [investments]);

  const totalBorrowed = useMemo(() => {
    return loans.filter((l) => !l.deletedAt && (l.type === 'borrowed' || l.type === 'emi' || !l.type) && l.status === 'active')
      .reduce((sum, l) => sum + Number(l.outstandingBalance ?? l.principalAmount ?? 0), 0);
  }, [loans]);

  const totalLent = useMemo(() => {
    return loans.filter((l) => !l.deletedAt && l.type === 'lent' && l.status === 'active')
      .reduce((sum, l) => sum + Number(l.outstandingBalance ?? l.principalAmount ?? 0), 0);
  }, [loans]);

  const authoritativeNetWorth = useMemo(() => {
    return calculateNetWorth({
      accountBalance: totalAccountBalance,
      investmentValue: totalInvestmentValue,
      totalLent: totalLent,
      totalBorrowed: totalBorrowed,
    });
  }, [totalAccountBalance, totalInvestmentValue, totalLent, totalBorrowed]);

  const expenseBreakdown = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const cashFlowMonthly = useMemo(() => {
    const monthlyMap = new Map<string, { income: number; expense: number }>();
    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { income: 0, expense: 0 });
      }
      const bucket = monthlyMap.get(key)!;
      if (t.type === 'income') bucket.income += t.amount;
      if (t.type === 'expense') bucket.expense += t.amount;
    });

    return Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        const [year, month] = key.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return {
          month: label,
          income: value.income,
          expense: value.expense,
          net: value.income - value.expense,
        };
      });
  }, [filteredTransactions]);

  const monthlyTimeline = useMemo(() => {
    const now = new Date();
    const monthsMap = new Map<string, { income: number; expense: number }>();
    transactions.forEach((t) => {
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthsMap.has(key)) {
        monthsMap.set(key, { income: 0, expense: 0 });
      }
      const b = monthsMap.get(key)!;
      if (t.type === 'income') b.income += t.amount;
      if (t.type === 'expense') b.expense += t.amount;
    });

    const temp: Array<{
      key: string;
      fullMonth: string;
      shortMonth: string;
      income: number;
      expense: number;
      net: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const fullMonth = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const shortMonth = d.toLocaleDateString('en-US', { month: 'short' });
      const data = monthsMap.get(key) || { income: 0, expense: 0 };
      temp.push({
        key,
        fullMonth,
        shortMonth,
        income: data.income,
        expense: data.expense,
        net: data.income - data.expense,
      });
    }

    let runningNW = authoritativeNetWorth;
    const result: Array<{
      key: string;
      fullMonth: string;
      shortMonth: string;
      income: number;
      expense: number;
      net: number;
      netWorth: number;
    }> = [];

    for (let i = 0; i < temp.length; i++) {
      const item = temp[i];
      result.push({
        ...item,
        netWorth: Math.max(0, runningNW),
      });
      runningNW -= item.net;
    }

    return result;
  }, [transactions, authoritativeNetWorth]);

  const reversedMonthlyTimeline = useMemo(() => [...monthlyTimeline].reverse(), [monthlyTimeline]);

  const maxMonthlyExpense = useMemo(() => {
    return Math.max(...monthlyTimeline.map((m) => m.expense), 1);
  }, [monthlyTimeline]);

  const savingsGrowth = useMemo(() => {
    if (!dateRange.start) return [];
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const netByDay = new Map<string, number>();

    filteredTransactions.forEach((t) => {
      const key = toLocalDateKey(t.date);
      if (!key) return;
      const delta = t.type === 'income' ? t.amount : -t.amount;
      netByDay.set(key, (netByDay.get(key) || 0) + delta);
    });

    const data: Array<{ date: string; savings: number }> = [];
    let running = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = toLocalDateKey(cursor);
      if (key) {
        running += netByDay.get(key) || 0;
        data.push({
          date: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          savings: running,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return data;
  }, [filteredTransactions, dateRange]);

  const incomeExpenseData = useMemo(() => ([
    { name: 'Income', value: summaryStats.totalIncome },
    { name: 'Expense', value: summaryStats.totalExpenses },
  ]), [summaryStats.totalIncome, summaryStats.totalExpenses]);

  const categoryOptions = useMemo(() => {
    const categories = new Set(filteredTransactions.map((t) => t.category));
    return Array.from(categories).sort();
  }, [filteredTransactions]);

  const tableTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return filteredTransactions
      .filter((t) => (categoryFilter === 'all' ? true : t.category === categoryFilter))
      .filter((t) => {
        if (!query) return true;
        return [t.description, t.category, t.type, t.merchant]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredTransactions, searchQuery, categoryFilter]);

  const reportPeriodLabel = useMemo(() => {
    if (timeRange === 'daily') {
      return new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (timeRange === 'weekly') {
      const end = dateRange.end;
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    if (timeRange === 'monthly') {
      return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (timeRange === 'yearly') {
      return new Date().getFullYear().toString();
    }
    const start = parseDateInputValue(customRange.start);
    const end = parseDateInputValue(customRange.end);
    if (start && end) {
      return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return 'Custom Range';
  }, [timeRange, dateRange.end, customRange]);

  const exportCSV = async () => {
    const header = ['Date', 'Category', 'Type', 'Amount', 'Payment Method', 'Description'];
    const rows = tableTransactions.map((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      return [
        formatLocalDate(t.date, 'en-US'),
        t.category,
        t.type,
        t.amount.toString(),
        account?.name || '',
        t.description || '',
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    await downloadFile({
      filename: `report-${Date.now()}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      data: csv,
      shareTitle: 'Reports CSV',
    });
  };

  const exportExcel = async () => {
    const header = ['Date', 'Category', 'Type', 'Amount', 'Payment Method', 'Description'];
    const rows = tableTransactions.map((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      return [
        formatLocalDate(t.date, 'en-US'),
        t.category,
        t.type,
        t.amount.toString(),
        account?.name || '',
        t.description || '',
      ];
    });

    const table = [header, ...rows]
      .map((row) => `<tr>${row.map((cell) => `<td>${String(cell)}</td>`).join('')}</tr>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><table>${table}</table></body></html>`;

    await downloadFile({
      filename: `report-${Date.now()}.xls`,
      mimeType: 'application/vnd.ms-excel',
      data: html,
      shareTitle: 'Reports Excel',
    });
  };

  const generateReportPdfBlob = async () => buildStatementReportPdf(buildStatementReportInput({
    reportPeriod: reportPeriodLabel,
    generatedAt: new Date(),
    currencyCode: currency,
    transactions: tableTransactions,
    accounts,
    loans,
    goals,
    investments,
  }));

  const downloadPDF = async () => {
    const pdfBlob = await generateReportPdfBlob();
    await downloadFile({
      filename: `finance-report-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      data: pdfBlob,
      preferShare: false,
      shareTitle: 'Finance Report',
    });
  };

  const sharePDF = async () => {
    const pdfBlob = await generateReportPdfBlob();
    const shared = await shareFile({
      filename: `finance-report-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      data: pdfBlob,
      shareTitle: 'Finance Report',
    });
    if (shared === 'cancelled') {
      await downloadFile({
        filename: `finance-report-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        data: pdfBlob,
        preferShare: false,
        shareTitle: 'Finance Report',
      });
    }
  };

  const tabs: Array<{ id: AnalyticsTab; label: string; icon: React.ReactNode }> = [
    { id: 'wealth', label: 'Net Worth', icon: <Sparkles size={14} /> },
    { id: 'spending', label: 'Total Spending', icon: <PieIcon size={14} /> },
    { id: 'cashflow', label: 'Spending by Month', icon: <BarChart3 size={14} /> },
    { id: 'all', label: 'All Insights', icon: <Layers size={14} /> },
    { id: 'transactions', label: 'Statement Ledger', icon: <FileText size={14} /> },
  ];

  return (
    <CenteredLayout>
      <div className="space-y-6 sm:space-y-8 pb-32">
        {/* Top Header & Unified Export Command Center */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="w-10 h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go to dashboard"
              title="Go to dashboard"
              data-testid="reports-go-back-button"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
                  Reports & Analytics
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase tracking-wider">
                  <Activity size={10} /> Live
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
                <Calendar size={12} />
                <span>Period: <strong>{reportPeriodLabel}</strong></span>
              </p>
            </div>
          </div>

          {/* Grouped Export Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 shrink-0">
            {canPdf && (
              <Button
                onClick={() => {
                  pulseExportAction('download');
                  void downloadPDF();
                }}
                data-testid="reports-download-pdf-button"
                aria-label="Download PDF Statement"
                title="Download PDF Statement"
                className={cn(
                  'h-9 sm:h-10 px-3.5 sm:px-4 rounded-full font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap',
                  activeExportAction === 'download'
                    ? 'bg-slate-900 text-white ring-2 ring-indigo-500/20'
                    : 'bg-[#18181B] hover:bg-black text-white shadow-sm'
                )}
              >
                <Download size={14} className="stroke-[2.5]" />
                <span>Download PDF</span>
              </Button>
            )}

            {canExcel && (
              <Button
                onClick={() => {
                  pulseExportAction('excel');
                  void exportExcel();
                }}
                data-testid="reports-export-excel-button"
                aria-label="Export Excel"
                title="Export Excel"
                className={cn(
                  'h-9 sm:h-10 px-3 sm:px-3.5 rounded-full font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border shadow-2xs whitespace-nowrap',
                  activeExportAction === 'excel'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200/80 hover:bg-slate-50'
                )}
              >
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            )}

            {canCsv && (
              <Button
                onClick={() => {
                  pulseExportAction('csv');
                  void exportCSV();
                }}
                data-testid="reports-export-csv-button"
                aria-label="Export CSV"
                title="Export CSV"
                className={cn(
                  'h-9 sm:h-10 px-3 sm:px-3.5 rounded-full font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border shadow-2xs whitespace-nowrap',
                  activeExportAction === 'csv'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200/80 hover:bg-slate-50'
                )}
              >
                <FileText size={14} className="text-indigo-600" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
            )}

            {canPdf && (
              <Button
                onClick={() => {
                  pulseExportAction('share');
                  void sharePDF();
                }}
                data-testid="reports-share-button"
                aria-label="Share Report"
                title="Share Report"
                className={cn(
                  'h-9 sm:h-10 px-3 sm:px-3.5 rounded-full font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border shadow-2xs whitespace-nowrap',
                  activeExportAction === 'share'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200/80 hover:bg-slate-50'
                )}
              >
                <Share2 size={14} />
                <span className="hidden sm:inline">Share</span>
              </Button>
            )}

            <Button
              onClick={() => {
                pulseExportAction('more');
                setCurrentPage('export-reports');
              }}
              data-testid="reports-more-export-button"
              aria-label="More Options"
              title="More Export Options"
              className="h-9 sm:h-10 px-3 rounded-full font-bold text-xs bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <MoreHorizontal size={15} />
            </Button>
          </div>
        </div>

        {/* Reference-Styled Top Breakdown & Controls Card (Matching Reference Screen 2 & 3) */}
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100/90 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-auto text-left">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-display">
              {activeTab === 'wealth'
                ? 'Net Worth'
                : activeTab === 'cashflow'
                ? 'Spending by Month'
                : activeTab === 'spending'
                ? 'Total Spending'
                : activeTab === 'transactions'
                ? 'Statement Ledger'
                : 'Spending'}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Financial intelligence & categorical breakdown
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
            {/* Breakdown Pill Selector */}
            <div className="flex-1 sm:flex-initial bg-slate-100/80 rounded-2xl p-2 sm:px-3.5 sm:py-2 border border-slate-200/60 flex flex-col justify-center min-w-[130px]">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 leading-none mb-1">
                Breakdown
              </span>
              <div className="relative">
                <select
                  value={activeTab === 'cashflow' ? 'monthly' : activeTab === 'wealth' ? 'networth' : activeTab === 'transactions' ? 'transactions' : activeTab === 'all' ? 'all' : 'categories'}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'monthly') setActiveTab('cashflow');
                    else if (v === 'networth') setActiveTab('wealth');
                    else if (v === 'transactions') setActiveTab('transactions');
                    else if (v === 'all') setActiveTab('all');
                    else setActiveTab('spending');
                  }}
                  className="w-full appearance-none bg-transparent text-xs font-black text-slate-800 pr-5 focus:outline-none cursor-pointer"
                >
                  <option value="categories">Categories</option>
                  <option value="monthly">Monthly</option>
                  <option value="networth">Net Worth</option>
                  <option value="all">All Insights</option>
                  <option value="transactions">Ledger</option>
                </select>
                <ChevronDown size={13} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Date Range Pill Selector */}
            <div className="flex-1 sm:flex-initial bg-slate-100/80 rounded-2xl p-2 sm:px-3.5 sm:py-2 border border-slate-200/60 flex flex-col justify-center min-w-[130px]">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 leading-none mb-1">
                Date Range
              </span>
              <div className="relative">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  className="w-full appearance-none bg-transparent text-xs font-black text-slate-800 pr-5 focus:outline-none cursor-pointer"
                >
                  <option value="monthly">Last 30 days</option>
                  <option value="weekly">This Week</option>
                  <option value="daily">Today</option>
                  <option value="yearly">This Year</option>
                  <option value="custom">Custom Range</option>
                </select>
                <ChevronDown size={13} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Custom Range & Filter Drawer */}
        {(showFilterDrawer || timeRange === 'custom') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 sm:p-5 bg-white rounded-[24px] border border-slate-100 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Filter Range & Options</span>
              <button
                type="button"
                onClick={() => setShowFilterDrawer(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xs font-bold uppercase text-slate-400">From</span>
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) => {
                    setTimeRange('custom');
                    setCustomRange((prev) => ({ ...prev, start: e.target.value }));
                  }}
                  data-testid="reports-custom-start-input"
                  aria-label="Custom report start date"
                  title="Custom report start date"
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-bold uppercase text-slate-400">To</span>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) => {
                    setTimeRange('custom');
                    setCustomRange((prev) => ({ ...prev, end: e.target.value }));
                  }}
                  data-testid="reports-custom-end-input"
                  aria-label="Custom report end date"
                  title="Custom report end date"
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              {/* Presets */}
              <div className="flex items-center gap-1">
                {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    type="button"
                    data-testid={`reports-range-${range}`}
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-2xs font-bold capitalize transition-all cursor-pointer',
                      timeRange === range
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Section Navigation Tabs */}
        <div className="flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap active:scale-95 select-none border',
                  isActive
                    ? 'bg-[#18181B] text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 hover:bg-slate-50'
                )}
              >
                <span className={cn('transition-colors', isActive ? 'text-indigo-400' : 'text-slate-400')}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ============================================================ */}
        {/* VIEW 1: TOTAL SPENDING (Matching Reference Screen 2) */}
        {/* ============================================================ */}
        {activeTab === 'spending' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Screen 2 Main Card: Total Spending & Semi-Circular Radial Arc Gauge */}
            <Card
              data-testid="reports-card-7"
              variant="default"
              className="p-5 sm:p-7 bg-white rounded-[28px] sm:rounded-[36px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              {/* Header Row: Amount + Date on left, Filter on right */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">
                    {formatCurrency(summaryStats.totalExpenses)}
                  </p>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    {reportPeriodLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterDrawer((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
                >
                  <span>Filter</span>
                  <SlidersHorizontal size={13} className="text-slate-500" />
                </button>
              </div>

              {/* Semi-Circular Radial Arc Gauge Donut Chart */}
              {expenseBreakdown.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs font-medium">No expenses recorded for this range.</div>
              ) : (
                <div className="h-[210px] sm:h-[230px] w-full flex items-center justify-center relative -my-2">
                  <ResponsiveContainer key={timeRange} width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        dataKey="value"
                        nameKey="name"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={75}
                        outerRadius={112}
                        paddingAngle={4}
                        cornerRadius={8}
                        cx="50%"
                        cy="82%"
                        isAnimationActive
                        animationDuration={800}
                      >
                        {expenseBreakdown.map((entry, index) => (
                          <Cell key={`cell-${entry.name}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
                        formatter={(value) => [formatCurrency(Number(value)), 'Spent']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Categories Breakdown List matching Screen 2 */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Categories</h4>
                  <span className="text-2xs font-semibold text-slate-400">{expenseBreakdown.length} categories</span>
                </div>
                <div className="space-y-2.5">
                  {expenseBreakdown.slice(0, 6).map((cat, idx) => (
                    <div key={cat.name} className="flex items-center justify-between py-1.5 px-1 text-xs sm:text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                        />
                        <span className="font-semibold text-slate-700 truncate">{cat.name}</span>
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Bottom Card: Month Breakdown matching Screen 2 */}
            <Card
              variant="default"
              className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Month</h3>
                <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Outflows</span>
              </div>
              <div className="divide-y divide-slate-100/80">
                {monthlyTimeline.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-3.5 px-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                      {item.fullMonth}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {formatCurrency(item.expense)}
                      </span>
                      <ChevronRight size={15} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Category Ranked Bars (Outflow Leaderboard) */}
            <Card
              data-testid="reports-card-8"
              variant="default"
              className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 size={16} className="text-purple-600" />
                  Top Spending Categories
                </h3>
                <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/50">
                  Outflow Leaderboard
                </span>
              </div>

              {expenseBreakdown.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs font-medium">No expenses found for this range.</div>
              ) : (
                <div className="space-y-3.5 pt-1">
                  {expenseBreakdown.slice(0, 6).map((cat, idx) => {
                    const totalExp = summaryStats.totalExpenses || 1;
                    const percent = Math.min(100, Math.round((cat.value / totalExp) * 100));
                    const color = chartColors[idx % chartColors.length];
                    return (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="font-bold text-slate-800 truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            <span className="text-slate-400 font-semibold">{percent}%</span>
                            <span className="font-bold text-slate-900">{formatCurrency(cat.value)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: SPENDING BY MONTH (Matching Reference Screen 3) */}
        {/* ============================================================ */}
        {activeTab === 'cashflow' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Screen 3 Main Card: Vertical Bar Chart */}
            <Card
              data-testid="reports-card-9"
              variant="default"
              className="p-5 sm:p-7 bg-white rounded-[28px] sm:rounded-[36px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              {/* Header Row: Amount + Date on left, Filter on right */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">
                    {formatCurrency(summaryStats.totalExpenses)}
                  </p>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    {reportPeriodLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterDrawer((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
                >
                  <span>Filter</span>
                  <SlidersHorizontal size={13} className="text-slate-500" />
                </button>
              </div>

              {/* Vertical Bar Chart with Rounded Bars */}
              <div className="h-[240px] sm:h-[260px] w-full">
                <ResponsiveContainer key={timeRange} width="100%" height="100%">
                  <BarChart data={reversedMonthlyTimeline} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="shortMonth" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      orientation="right"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', maximumFractionDigits: 0 })}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
                      formatter={(value) => [formatCurrency(Number(value)), 'Expense']}
                    />
                    <Bar dataKey="expense" radius={[12, 12, 12, 12]} isAnimationActive animationDuration={800}>
                      {reversedMonthlyTimeline.map((entry) => {
                        const isPeak = entry.expense === maxMonthlyExpense;
                        return (
                          <Cell
                            key={`cell-${entry.key}`}
                            fill={isPeak ? '#6366F1' : '#E2E8F0'}
                            className="hover:opacity-85 transition-opacity"
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend below bar chart matching Screen 3 */}
              <div className="flex flex-wrap items-center justify-center gap-5 pt-2 text-2xs font-semibold text-slate-600 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]" />
                  <span>Peak Spending Month</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                  <span>Other Months</span>
                </div>
              </div>
            </Card>

            {/* Bottom Card: Month Breakdown matching Screen 3 */}
            <Card
              variant="default"
              className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Month</h3>
                <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Outflows</span>
              </div>
              <div className="divide-y divide-slate-100/80">
                {monthlyTimeline.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-3 px-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                      {item.fullMonth}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {formatCurrency(item.expense)}
                      </span>
                      <ChevronRight size={15} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Two Side-by-Side Trend Cards: Savings Growth & Income vs Expense */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card
                data-testid="reports-card-10"
                variant="default"
                className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp size={16} className="text-purple-600" />
                      Cumulative Savings Growth
                    </h3>
                    <p className="text-2xs text-slate-400">Day-by-day accumulation during period.</p>
                  </div>
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50">
                    Net Trend
                  </span>
                </div>

                {savingsGrowth.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-medium">No savings trend available.</div>
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer key={timeRange} width="100%" height="100%">
                      <AreaChart data={savingsGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                        <YAxis
                          orientation="right"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
                          formatter={(value) => [formatCurrency(Number(value)), 'Savings']}
                        />
                        <Area type="monotone" dataKey="savings" stroke="#8B5CF6" strokeWidth={2.5} fillOpacity={1} fill="url(#savingsGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card
                data-testid="reports-card-11"
                variant="default"
                className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                      <Activity size={16} className="text-indigo-600" />
                      Income vs. Expense
                    </h3>
                    <p className="text-2xs text-slate-400">Total volume ratio in selected period.</p>
                  </div>
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    Ratio
                  </span>
                </div>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer key={timeRange} width="100%" height="100%">
                    <BarChart data={incomeExpenseData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
                        formatter={(value) => [formatCurrency(Number(value)), 'Total']}
                      />
                      <Bar dataKey="value" fill="#18181B" radius={[8, 8, 0, 0]} isAnimationActive animationBegin={0} animationDuration={800}>
                        {incomeExpenseData.map((entry) => (
                          <Cell key={entry.name} fill={entry.name === 'Income' ? '#10B981' : '#EF4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* VIEW 3: NET WORTH (Matching Reference Screen 1) */}
        {/* ============================================================ */}
        {activeTab === 'wealth' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Screen 1 Main Card: Net Worth & Smooth Area Curve */}
            <Card
              data-testid="reports-card-10"
              variant="default"
              className="p-5 sm:p-7 bg-white rounded-[28px] sm:rounded-[36px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              {/* Header Row: Net Worth + Date on left, Filter on right */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">
                    {formatCurrency(authoritativeNetWorth)}
                  </p>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    {reportPeriodLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterDrawer((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
                >
                  <span>Filter</span>
                  <SlidersHorizontal size={13} className="text-slate-500" />
                </button>
              </div>

              {/* Smooth Area Trend Chart */}
              <div className="h-[240px] sm:h-[260px] w-full">
                <ResponsiveContainer key={timeRange} width="100%" height="100%">
                  <AreaChart data={reversedMonthlyTimeline} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="shortMonth" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      orientation="right"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', maximumFractionDigits: 0 })}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '16px', color: '#fff', fontSize: '12px' }}
                      formatter={(value) => [formatCurrency(Number(value)), 'Net Worth']}
                    />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      stroke="#6366F1"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#netWorthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Bottom Card: Month Breakdown matching Screen 1 */}
            <Card
              variant="default"
              className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Month</h3>
                <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Cumulative Valuation</span>
              </div>
              <div className="divide-y divide-slate-100/80">
                {monthlyTimeline.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-3.5 px-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                      {item.fullMonth}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {formatCurrency(item.netWorth)}
                      </span>
                      <ChevronRight size={15} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Financial Health Summary Cards */}
            <Card
              data-testid="reports-card-13"
              variant="default"
              className="p-5 sm:p-7 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <Target size={16} className="text-indigo-600" />
                    Portfolio & Asset Breakdown
                  </h3>
                  <p className="text-2xs text-slate-400">Positioning across debt, goals, and capital.</p>
                </div>
                <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Asset Summary
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Total Active Debt</span>
                    <Landmark size={14} className="text-rose-500" />
                  </div>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(summaryStats.totalDebt)}</p>
                  <span className="text-3xs text-slate-400 block font-medium">Loans & EMIs</span>
                </div>

                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Goals Progress</span>
                    <Target size={14} className="text-emerald-500" />
                  </div>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(summaryStats.totalGoalsProgress)}</p>
                  <span className="text-3xs text-slate-400 block font-medium">Funded targets</span>
                </div>

                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Total Invested</span>
                    <TrendingUp size={14} className="text-indigo-500" />
                  </div>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(summaryStats.totalInvested)}</p>
                  <span className="text-3xs text-slate-400 block font-medium">Invested principal</span>
                </div>
              </div>
            </Card>

            {/* Smart Forecasting & AI Insights Cards */}
            {(canAiInsights || canForecasting) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {canAiInsights && (
                  <Card
                    data-testid="reports-card-5"
                    variant="default"
                    className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden flex flex-col space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                        AI Intelligence Insights
                      </h3>
                      <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50">
                        Smart Engine
                      </span>
                    </div>
                    <div className="flex-1">
                      <AIInsightsCard compact />
                    </div>
                  </Card>
                )}

                {canForecasting && (
                  <Card
                    data-testid="reports-card-6"
                    variant="default"
                    className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden flex flex-col space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Smart Financial Forecasting
                      </h3>
                      <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                        6-Month Outlook
                      </span>
                    </div>
                    <div className="flex-1">
                      <ForecastSection transactions={transactions} accounts={accounts} currency={currency} formatCurrency={formatCurrency} />
                    </div>
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* VIEW 4: ALL INSIGHTS (Comprehensive Dashboard) */}
        {/* ============================================================ */}
        {activeTab === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Executive Hero Card: Net Worth & Financial Overview */}
            <div
              data-testid="reports-card-14"
              className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 shadow-[0_20px_50px_-10px_rgba(15,23,42,0.3)] border border-white/10"
            >
              <div className="absolute -top-24 -right-24 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-2xs sm:text-xs font-bold uppercase tracking-widest text-indigo-200/90">
                        Authoritative Net Worth
                      </span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white font-display">
                      {formatCurrency(authoritativeNetWorth)}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-2xs text-slate-300 font-medium">
                      <span className="bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1">
                        <Wallet size={11} className="text-emerald-400" /> Liquid: {formatCurrency(totalAccountBalance)}
                      </span>
                      <span className="bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1">
                        <TrendingUp size={11} className="text-indigo-400" /> Investments: {formatCurrency(totalInvestmentValue)}
                      </span>
                      {totalBorrowed > 0 && (
                        <span className="bg-rose-500/20 text-rose-200 px-2.5 py-1 rounded-full border border-rose-500/30 flex items-center gap-1">
                          <TrendingDown size={11} /> Debt: -{formatCurrency(totalBorrowed)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 min-w-[180px] sm:text-right">
                    <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">
                      Period Net Savings
                    </span>
                    <span className={cn(
                      'text-xl sm:text-2xl font-black tracking-tight block mt-1',
                      summaryStats.netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {summaryStats.netSavings >= 0 ? '+' : ''}{formatCurrency(summaryStats.netSavings)}
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1.5',
                      summaryStats.netSavings >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    )}>
                      {summaryStats.netSavings >= 0 ? 'Surplus' : 'Deficit'} ({summaryStats.savingsRate.toFixed(1)}% saved)
                    </span>
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div data-testid="reports-card" className="bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-slate-400">Total Income</span>
                      <ArrowDownLeft size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-black tracking-tight text-white">{formatCurrency(summaryStats.totalIncome)}</p>
                    <span className="text-3xs text-emerald-400 font-medium block">Cash in</span>
                  </div>

                  <div data-testid="reports-card-2" className="bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-slate-400">Total Expenses</span>
                      <ArrowUpRight size={14} className="text-rose-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-black tracking-tight text-white">{formatCurrency(summaryStats.totalExpenses)}</p>
                    <span className="text-3xs text-rose-400 font-medium block">Outflow</span>
                  </div>

                  <div data-testid="reports-card-3" className="bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-slate-400">Total Savings</span>
                      <PiggyBank size={14} className="text-purple-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-black tracking-tight text-white">{formatCurrency(summaryStats.netSavings)}</p>
                    <span className="text-3xs text-purple-400 font-medium block">Retained</span>
                  </div>

                  <div data-testid="reports-card-4" className="bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-slate-400">Savings Rate</span>
                      <BadgePercent size={14} className="text-indigo-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-black tracking-tight text-white">{summaryStats.savingsRate.toFixed(1)}%</p>
                    <span className="text-3xs text-indigo-400 font-medium block">Efficiency</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tri-Card Visual Grid (Screen 1, 2, 3 Reference Layouts side-by-side) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Spending Arc Donut Card */}
              <Card
                variant="default"
                className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Spending</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(summaryStats.totalExpenses)}</p>
                  </div>
                  <span className="text-2xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Gauge</span>
                </div>

                <div className="h-[180px] w-full flex items-center justify-center -my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        dataKey="value"
                        nameKey="name"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        cornerRadius={6}
                        cx="50%"
                        cy="80%"
                      >
                        {expenseBreakdown.map((entry, index) => (
                          <Cell key={`cell-all-${entry.name}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [formatCurrency(Number(v)), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                  {expenseBreakdown.slice(0, 3).map((cat, idx) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[idx % chartColors.length] }} />
                        <span className="font-semibold text-slate-700 truncate">{cat.name}</span>
                      </div>
                      <span className="font-bold text-slate-900">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Monthly Spending Bar Chart Card */}
              <Card
                variant="default"
                className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Spending by Month</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(summaryStats.totalExpenses)}</p>
                  </div>
                  <span className="text-2xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Timeline</span>
                </div>

                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reversedMonthlyTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="shortMonth" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', maximumFractionDigits: 0 })}
                      />
                      <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Outflow']} />
                      <Bar dataKey="expense" radius={[8, 8, 8, 8]}>
                        {reversedMonthlyTimeline.map((entry) => (
                          <Cell
                            key={`cell-all-bar-${entry.key}`}
                            fill={entry.expense === maxMonthlyExpense ? '#6366F1' : '#E2E8F0'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Smart Forecasting & AI Insights Cards */}
            {(canAiInsights || canForecasting) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {canAiInsights && (
                  <Card
                    data-testid="reports-card-5"
                    variant="default"
                    className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden flex flex-col space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                        AI Intelligence Insights
                      </h3>
                      <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50">
                        Smart Engine
                      </span>
                    </div>
                    <div className="flex-1">
                      <AIInsightsCard compact />
                    </div>
                  </Card>
                )}

                {canForecasting && (
                  <Card
                    data-testid="reports-card-6"
                    variant="default"
                    className="p-5 sm:p-6 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden flex flex-col space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Smart Financial Forecasting
                      </h3>
                      <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                        6-Month Outlook
                      </span>
                    </div>
                    <div className="flex-1">
                      <ForecastSection transactions={transactions} accounts={accounts} currency={currency} formatCurrency={formatCurrency} />
                    </div>
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* 4. Statement Ledger (Transactions Table) */}
        {(activeTab === 'all' || activeTab === 'transactions') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card
              data-testid="reports-card-12"
              variant="default"
              className="p-5 sm:p-7 bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-5"
            >
              {/* Header & Quick Export */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-indigo-600" />
                    Statement Ledger
                  </h3>
                  <p className="text-xs text-slate-400">
                    Showing {tableTransactions.length} of {filteredTransactions.length} transactions for this period.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canPdf && (
                    <Button
                      data-testid="reports-download-pdf"
                      onClick={() => void downloadPDF()}
                      className="rounded-full px-3.5 py-1.5 text-xs bg-[#18181B] text-white hover:bg-black shadow-xs font-bold cursor-pointer"
                    >
                      <Download size={13} className="mr-1.5" /> PDF Statement
                    </Button>
                  )}
                  {canCsv && (
                    <Button
                      data-testid="reports-export-csv"
                      onClick={exportCSV}
                      className="rounded-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-2xs font-bold cursor-pointer"
                    >
                      <FileText size={13} className="mr-1.5 text-indigo-600" /> CSV
                    </Button>
                  )}
                  {canExcel && (
                    <Button
                      data-testid="reports-export-excel"
                      onClick={exportExcel}
                      className="rounded-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-2xs font-bold cursor-pointer"
                    >
                      <FileSpreadsheet size={13} className="mr-1.5 text-emerald-600" /> Excel
                    </Button>
                  )}
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                  <input
                    data-testid="reports-search-transactions"
                    id="reports-search-transactions"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search description, category, merchant..."
                    aria-label="Search transactions"
                    title="Search transactions"
                    className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200/80 rounded-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <select
                    data-testid="reports-filter-transactions-by-category"
                    id="reports-category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter transactions by category"
                    title="Filter transactions by category"
                    className="w-full sm:w-auto appearance-none pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200/80 rounded-full text-xs sm:text-sm font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                  >
                    <option data-testid="reports-all-categories" value="all">All Categories</option>
                    {categoryOptions.map((category) => (
                      <option data-testid={`reports-option-${category}`} key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <ChevronRight size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-2xs">
                <table data-testid="reports-table" className="w-full text-sm">
                  <thead className="bg-slate-50/90 text-slate-500 text-2xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Description & Category</th>
                      <th className="text-left py-3 px-4">Type</th>
                      <th className="text-right py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4">Account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableTransactions.map((t, index) => {
                      const account = accounts.find((a) => a.id === t.accountId);
                      const rowKey = t.id ?? t.remoteId ?? `${toLocalDateKey(t.date) || 'row'}-${index}`;
                      const isIncome = t.type === 'income';
                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {formatLocalDate(t.date, 'en-US')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-xs truncate max-w-[200px] sm:max-w-[300px]">
                                {t.description || t.category}
                              </span>
                              <span className="text-3xs text-slate-400 font-medium">{t.category}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider',
                              isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            )}>
                              {t.type}
                            </span>
                          </td>
                          <td className={cn(
                            'py-3 px-4 text-right font-black text-xs sm:text-sm whitespace-nowrap',
                            isIncome ? 'text-emerald-600' : 'text-rose-600'
                          )}>
                            {isIncome ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium">
                              <Wallet size={12} className="text-slate-400" />
                              {account?.name || '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {tableTransactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-medium">
                          No transactions found matching your filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </CenteredLayout>
  );
};
