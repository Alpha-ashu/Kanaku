import React, { useMemo, useState, useCallback } from 'react';
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
  FileJson2,
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
  ChevronRight,
  ChevronDown,
  Target,
  BadgePercent,
  Landmark,
  PiggyBank,
  FileDown,
  Check,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  Table as TableIcon,
} from 'lucide-react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { downloadFile, shareFile } from '@/lib/download';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { buildStatementReportInput, buildStatementReportPdf } from '@/lib/statementReportPdf';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { calculateAccountTotalBalance, calculateNetWorth } from '@/lib/financialMath';
import { isClosedInvestment } from '@/lib/investmentUtils';
import { AIInsightsCard } from '@/app/components/shared/AIInsightsCard';
import { ReportPdfPreviewModal } from '@/app/components/features/ReportPdfPreviewModal';
import { cn } from '@/lib/utils';

/* ─── Pro Design Tokens ─────────────────────────────────────────────────────── */
const CHART_COLORS = [
  '#6366F1', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#F97316', // Orange
];

const GLASS_CARD = 'bg-white/95 backdrop-blur-xl border border-slate-100/90 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)]';
const GLASS_CARD_ROUNDED = `${GLASS_CARD} rounded-[24px] sm:rounded-[32px]`;

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  borderColor: 'rgba(99, 102, 241, 0.25)',
  borderRadius: '14px',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 600,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
  padding: '10px 14px',
};

/* ─── Forecast Section ─────────────────────────────────────────────────────── */
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
      <p className="font-page-sub text-slate-500 leading-relaxed">
        Based on your historical cash flow, here is a 6-month predictive projection of your net wealth:
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => formatCurrency(Number(val))} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(Number(value)), '']} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
            <Line type="monotone" dataKey="Optimistic" stroke="#10B981" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="Expected" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366F1' }} />
            <Line type="monotone" dataKey="Conservative" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 font-caption text-indigo-900 flex items-center gap-2">
        <Sparkles size={15} className="text-indigo-600 shrink-0" />
        <span>Maintain current savings pacing to achieve the <strong>Optimistic</strong> wealth trajectory.</span>
      </div>
    </div>
  );
};

/* ─── Export Format Card ───────────────────────────────────────────────────── */
interface ExportFormatCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  colorClass: string;
  bgClass: string;
  onClick: () => void;
  isActive?: boolean;
  testId: string;
}

const ExportFormatCard: React.FC<ExportFormatCardProps> = ({
  icon, label, description, colorClass, bgClass, onClick, isActive, testId,
}) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    className={cn(
      'group flex items-center gap-3.5 w-full p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-[0.98]',
      isActive
        ? 'bg-slate-900 border-slate-800 text-white shadow-lg scale-[0.98]'
        : 'bg-white/80 border-slate-200/70 hover:bg-white hover:border-slate-300 hover:shadow-sm'
    )}
  >
    <div className={cn(
      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
      isActive ? 'bg-white/15' : bgClass
    )}>
      <span className={isActive ? 'text-white' : colorClass}>{icon}</span>
    </div>
    <div className="text-left min-w-0">
      <span className={cn(
        'font-card-title block',
        isActive ? 'text-white' : 'text-slate-800'
      )}>{label}</span>
      <span className={cn(
        'font-caption block mt-0.5',
        isActive ? 'text-slate-300' : 'text-slate-400'
      )}>{description}</span>
    </div>
    {isActive && (
      <div className="ml-auto shrink-0">
        <Check size={16} className="text-emerald-400" />
      </div>
    )}
  </button>
);

/* ─── Types ────────────────────────────────────────────────────────────────── */
type TimeRange = 'monthly' | 'weekly' | 'daily' | 'yearly' | 'custom';
type ExportAction = 'download' | 'share' | 'csv' | 'excel' | 'json' | 'more';
type AnalyticsTab = 'all' | 'spending' | 'cashflow' | 'wealth' | 'transactions';

/* ─── Main Reports Component ──────────────────────────────────────────────── */
export const Reports: React.FC = () => {
  const { transactions, accounts, loans, goals, investments, currency, setCurrentPage } = useApp();
  const canPdf = useSubFeature('reports', 'pdfExport');
  const canCsv = useSubFeature('reports', 'csvExport');
  const canExcel = useSubFeature('reports', 'excelExport');
  const canAiInsights = useSubFeature('reports', 'aiInsightsReport');
  const canForecasting = useSubFeature('reports', 'forecasting');

  // Default custom range to current month
  const defaultCustomDates = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    return {
      start: formatDate(start),
      end: formatDate(now),
    };
  }, []);

  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [customRange, setCustomRange] = useState(defaultCustomDates);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('all');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeExportAction, setActiveExportAction] = useState<ExportAction | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);

  const pulseExportAction = (action: ExportAction) => {
    setActiveExportAction(action);
    window.setTimeout(() => {
      setActiveExportAction((current) => (current === action ? null : current));
    }, 1200);
  };

  const customDaysCount = useMemo(() => {
    if (!customRange.start || !customRange.end) return null;
    const s = new Date(customRange.start);
    const e = new Date(customRange.end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : null;
  }, [customRange.start, customRange.end]);

  const applyCustomPreset = useCallback((type: 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'ytd') => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (type === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    } else if (type === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (type === 'last_30') {
      start = new Date(now.getTime() - 29 * 86400000);
      end = now;
    } else if (type === 'last_90') {
      start = new Date(now.getTime() - 89 * 86400000);
      end = now;
    } else if (type === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
    }

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setTimeRange('custom');
    setCustomRange({
      start: formatDate(start),
      end: formatDate(end),
    });
  }, []);

  const formatCurrency = useCallback((amount: number) => {
    return formatCurrencyAmount(amount, currency);
  }, [currency]);

  /* ─── Date Filtering ──────────────────────────────────────────────────── */
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
      const parsedStart = parseDateInputValue(customRange.start || defaultCustomDates.start);
      const parsedEnd = parseDateInputValue(customRange.end || defaultCustomDates.end);
      if (parsedStart && parsedEnd) {
        start = parsedStart;
        end.setTime(parsedEnd.getTime());
      }
    }

    return { start, end };
  }, [timeRange, customRange, defaultCustomDates]);

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

  /* ─── Computed Stats ──────────────────────────────────────────────────── */
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
    const categories: Record<string, { total: number; count: number }> = {};
    filteredTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        if (!categories[t.category]) {
          categories[t.category] = { total: 0, count: 0 };
        }
        categories[t.category].total += t.amount;
        categories[t.category].count += 1;
      });

    return Object.entries(categories)
      .map(([name, data]) => ({ name, value: data.total, count: data.count }))
      .sort((a, b) => b.value - a.value);
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
      monthYearShort: string;
      income: number;
      expense: number;
      net: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const fullMonth = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const shortMonth = d.toLocaleDateString('en-US', { month: 'short' });
      const monthYearShort = `${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
      const data = monthsMap.get(key) || { income: 0, expense: 0 };
      temp.push({
        key,
        fullMonth,
        shortMonth,
        monthYearShort,
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
      monthYearShort: string;
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
      return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    if (timeRange === 'monthly') {
      return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (timeRange === 'yearly') {
      return new Date().getFullYear().toString();
    }
    const start = parseDateInputValue(customRange.start || defaultCustomDates.start);
    const end = parseDateInputValue(customRange.end || defaultCustomDates.end);
    if (start && end) {
      return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return 'Custom Range';
  }, [timeRange, dateRange.end, customRange, defaultCustomDates]);

  /* ─── Export Functions ────────────────────────────────────────────────── */
  const exportCSV = async () => {
    const now = new Date();
    const headerRows = [
      `# KANAKU Financial Report`,
      `# Period: ${reportPeriodLabel}`,
      `# Generated: ${now.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      `# Currency: ${currency}`,
      `#`,
    ];

    const columnHeaders = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Payment Method'];
    const rows = tableTransactions.map((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      const sign = t.type === 'expense' ? '-' : '+';
      return [
        formatLocalDate(t.date, 'en-US'),
        t.description || t.category || '',
        t.category || '',
        t.type,
        `${sign}${t.amount.toFixed(2)}`,
        account?.name || '',
      ];
    });

    const summaryRows = [
      '',
      '# ─── Summary ───',
      `# Total Income,${summaryStats.totalIncome.toFixed(2)}`,
      `# Total Expenses,${summaryStats.totalExpenses.toFixed(2)}`,
      `# Net Savings,${summaryStats.netSavings.toFixed(2)}`,
      `# Savings Rate,${summaryStats.savingsRate.toFixed(1)}%`,
    ];

    const csvLines = [
      ...headerRows,
      columnHeaders.map((cell) => `"${cell}"`).join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ...summaryRows,
    ];

    const csv = csvLines.join('\n');

    await downloadFile({
      filename: `kanaku-report-${reportPeriodLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      data: csv,
      shareTitle: 'KANAKU Financial Report (CSV)',
    });
  };

  const exportExcel = async () => {
    const now = new Date();
    const rows = tableTransactions.map((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      const sign = t.type === 'expense' ? '-' : '+';
      return [
        formatLocalDate(t.date, 'en-US'),
        t.description || t.category || '',
        t.category || '',
        t.type,
        `${sign}${t.amount.toFixed(2)}`,
        account?.name || '',
      ];
    });

    const catRows = expenseBreakdown.map((cat) => {
      const pct = summaryStats.totalExpenses > 0 ? ((cat.value / summaryStats.totalExpenses) * 100).toFixed(1) : '0.0';
      return [cat.name, formatCurrency(cat.value), `${pct}%`];
    });

    const monthRows = monthlyTimeline.map((m) => [
      m.fullMonth,
      formatCurrency(m.income),
      formatCurrency(m.expense),
      formatCurrency(m.net),
    ]);

    const thStyle = 'style="background-color:#0f172a;color:#ffffff;font-weight:bold;padding:10px 14px;font-size:13px;border:1px solid #334155;text-align:left"';
    const tdStyle = 'style="padding:8px 14px;font-size:12px;border:1px solid #e2e8f0;color:#1e293b"';
    const tdAltStyle = 'style="padding:8px 14px;font-size:12px;border:1px solid #e2e8f0;color:#1e293b;background-color:#f8fafc"';
    const sectionStyle = 'style="font-size:16px;font-weight:bold;color:#0f172a;padding:24px 0 8px 0;border-bottom:2px solid #6366f1"';
    const metaStyle = 'style="font-size:11px;color:#64748b;padding:2px 0"';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial,sans-serif;margin:20px">
      <h1 style="font-size:22px;color:#0f172a;margin-bottom:4px">KANAKU Financial Report</h1>
      <p ${metaStyle}>Period: ${reportPeriodLabel}</p>
      <p ${metaStyle}>Generated: ${now.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      <p ${metaStyle}>Currency: ${currency}</p>

      <h2 ${sectionStyle}>Financial Summary</h2>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr>
          <td ${tdStyle}><strong>Total Income</strong></td><td ${tdStyle}>${formatCurrency(summaryStats.totalIncome)}</td>
          <td ${tdStyle}><strong>Total Expenses</strong></td><td ${tdStyle}>${formatCurrency(summaryStats.totalExpenses)}</td>
        </tr>
        <tr>
          <td ${tdAltStyle}><strong>Net Savings</strong></td><td ${tdAltStyle}>${formatCurrency(summaryStats.netSavings)}</td>
          <td ${tdAltStyle}><strong>Savings Rate</strong></td><td ${tdAltStyle}>${summaryStats.savingsRate.toFixed(1)}%</td>
        </tr>
      </table>

      <h2 ${sectionStyle}>Category Breakdown</h2>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><th ${thStyle}>Category</th><th ${thStyle}>Amount</th><th ${thStyle}>Percentage</th></tr>
        ${catRows.map((r, i) => `<tr>${r.map((c) => `<td ${i % 2 === 0 ? tdStyle : tdAltStyle}>${c}</td>`).join('')}</tr>`).join('')}
      </table>

      <h2 ${sectionStyle}>Monthly Trend</h2>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><th ${thStyle}>Month</th><th ${thStyle}>Income</th><th ${thStyle}>Expense</th><th ${thStyle}>Net</th></tr>
        ${monthRows.map((r, i) => `<tr>${r.map((c) => `<td ${i % 2 === 0 ? tdStyle : tdAltStyle}>${c}</td>`).join('')}</tr>`).join('')}
      </table>

      <h2 ${sectionStyle}>Transaction Statement</h2>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><th ${thStyle}>Date</th><th ${thStyle}>Description</th><th ${thStyle}>Category</th><th ${thStyle}>Type</th><th ${thStyle}>Amount</th><th ${thStyle}>Account</th></tr>
        ${rows.map((r, i) => `<tr>${r.map((c) => `<td ${i % 2 === 0 ? tdStyle : tdAltStyle}>${c}</td>`).join('')}</tr>`).join('')}
      </table>

      <p style="font-size:10px;color:#94a3b8;margin-top:30px;border-top:1px solid #e2e8f0;padding-top:10px">
        Generated by KANAKU • Financial Operating System &bull; Confidential Financial Report
      </p>
    </body></html>`;

    await downloadFile({
      filename: `kanaku-report-${reportPeriodLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.xls`,
      mimeType: 'application/vnd.ms-excel',
      data: html,
      shareTitle: 'KANAKU Financial Report (Excel)',
    });
  };

  const exportJSON = async () => {
    const now = new Date();
    const jsonData = {
      report: {
        title: 'KANAKU Financial Report',
        period: reportPeriodLabel,
        generatedAt: now.toISOString(),
        currency: currency,
      },
      summary: {
        totalIncome: summaryStats.totalIncome,
        totalExpenses: summaryStats.totalExpenses,
        netSavings: summaryStats.netSavings,
        savingsRate: Number(summaryStats.savingsRate.toFixed(2)),
        netWorth: authoritativeNetWorth,
        liquidBalance: totalAccountBalance,
        investmentValue: totalInvestmentValue,
        totalBorrowed,
        totalLent,
      },
      categoryBreakdown: expenseBreakdown.map((cat) => ({
        category: cat.name,
        amount: cat.value,
        percentage: summaryStats.totalExpenses > 0
          ? Number(((cat.value / summaryStats.totalExpenses) * 100).toFixed(2))
          : 0,
      })),
      monthlyTrend: monthlyTimeline.map((m) => ({
        month: m.fullMonth,
        income: m.income,
        expense: m.expense,
        net: m.net,
        netWorth: m.netWorth,
      })),
      transactions: tableTransactions.map((t) => {
        const account = accounts.find((a) => a.id === t.accountId);
        return {
          date: formatLocalDate(t.date, 'en-US'),
          description: t.description || '',
          category: t.category || '',
          type: t.type,
          amount: t.amount,
          account: account?.name || '',
        };
      }),
    };

    const jsonStr = JSON.stringify(jsonData, null, 2);

    await downloadFile({
      filename: `kanaku-report-${reportPeriodLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.json`,
      mimeType: 'application/json',
      data: jsonStr,
      shareTitle: 'KANAKU Financial Report (JSON)',
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

  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const openPdfPreview = async () => {
    setIsGeneratingPdf(true);
    setShowPdfPreview(true);
    try {
      const pdfBlob = await generateReportPdfBlob();
      setPreviewPdfBlob(pdfBlob);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate PDF report');
      setShowPdfPreview(false);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadPDF = async () => {
    const pdfBlob = await generateReportPdfBlob();
    await downloadFile({
      filename: `kanaku-report-${reportPeriodLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      data: pdfBlob,
      preferShare: false,
      shareTitle: 'KANAKU Financial Report',
    });
  };

  const sharePDF = async () => {
    const pdfBlob = await generateReportPdfBlob();
    const shared = await shareFile({
      filename: `kanaku-report-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      data: pdfBlob,
      shareTitle: 'KANAKU Financial Report',
    });
    if (shared === 'cancelled') {
      await downloadFile({
        filename: `kanaku-report-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        data: pdfBlob,
        preferShare: false,
        shareTitle: 'KANAKU Financial Report',
      });
    }
  };

  /* ─── Navigation Tabs Config ─────────────────────────────────────────── */
  const tabs: Array<{
    id: AnalyticsTab;
    label: string;
    mobileLabel: string;
    tinyLabel: string;
    ariaLabel: string;
    icon: React.ReactNode;
  }> = [
    { id: 'all', label: 'Overview', mobileLabel: 'All', tinyLabel: 'All', ariaLabel: 'Overview view', icon: <Layers size={13} /> },
    { id: 'spending', label: 'Spending', mobileLabel: 'Spend', tinyLabel: 'Spend', ariaLabel: 'Spending breakdown view', icon: <PieIcon size={13} /> },
    { id: 'cashflow', label: 'Cash Flow', mobileLabel: 'Flow', tinyLabel: 'Flow', ariaLabel: 'Cash flow comparison view', icon: <BarChart3 size={13} /> },
    { id: 'wealth', label: 'Balance Sheet', mobileLabel: 'Balance', tinyLabel: 'Assets', ariaLabel: 'Balance sheet and net worth view', icon: <Sparkles size={13} /> },
    { id: 'transactions', label: 'Statement', mobileLabel: 'Ledger', tinyLabel: 'Ledger', ariaLabel: 'Transaction statement ledger view', icon: <FileText size={13} /> },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
      document.getElementById(`report-tab-${tabs[nextIndex].id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prevIndex].id);
      document.getElementById(`report-tab-${tabs[prevIndex].id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveTab(tabs[0].id);
      document.getElementById(`report-tab-${tabs[0].id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveTab(tabs[tabs.length - 1].id);
      document.getElementById(`report-tab-${tabs[tabs.length - 1].id}`)?.focus();
    }
  };

  /* ─── Render ──────────────────────────────────────────────────────────── */
  return (
    <CenteredLayout>
      <div className="space-y-4 sm:space-y-6 pb-44 sm:pb-48">

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 1. TOP HEADER: Navigation, Title, Quick Actions                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between gap-2.5 pt-1">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go to dashboard"
              title="Go to dashboard"
              data-testid="reports-go-back-button"
            >
              <ArrowLeft size={17} className="text-slate-700" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">
                  Financial Reports
                </h1>
                <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase tracking-wider">
                  <Activity size={10} /> Live
                </span>
              </div>
              <p className="font-page-sub flex items-center gap-1.5 truncate mt-0.5">
                <Calendar size={12} className="text-slate-400 shrink-0" />
                <span className="truncate">Period: <strong className="text-slate-700 font-semibold">{reportPeriodLabel}</strong></span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => setShowExportPanel(true)}
              data-testid="reports-export-toggle"
              aria-label="Export Options"
              className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-full font-bold text-xs bg-[#18181B] text-white hover:bg-black active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileDown size={14} className="stroke-[2.5]" />
              <span>Export</span>
            </Button>

            {canPdf && (
              <Button
                onClick={() => { pulseExportAction('share'); void sharePDF(); }}
                data-testid="reports-share-button"
                aria-label="Share Report"
                title="Share Report"
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white text-slate-700 hover:text-slate-900 border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <Share2 size={15} />
              </Button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 2. ADAPTIVE TIME HORIZON SELECTOR (Fits 100% On All Device Sizes)    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-1.5 shadow-xs">
          <div className="flex items-center justify-between gap-1 w-full text-center">
            {[
              { id: 'monthly', label: '30 Days' },
              { id: 'weekly', label: 'Week' },
              { id: 'daily', label: 'Today' },
              { id: 'yearly', label: 'Year' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => {
              const isActive = timeRange === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`reports-range-${p.id}`}
                  onClick={() => {
                    setTimeRange(p.id as TimeRange);
                    setShowFilterDrawer(p.id === 'custom');
                  }}
                  className={cn(
                    'flex-1 py-1.5 px-0.5 sm:px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center active:scale-95',
                    isActive
                      ? 'bg-[#18181B] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Pickers Drawer (Smooth collapsible) */}
          <AnimatePresence>
            {(showFilterDrawer || timeRange === 'custom') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden pt-3 mt-2.5 border-t border-slate-100/90"
              >
                <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 space-y-3">
                  {/* Sub-Header: Label & Duration Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Calendar size={13} className="text-indigo-600 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 tracking-tight shrink-0">
                        Custom Range
                      </span>
                    </div>
                    {customDaysCount !== null && (
                      <span className="shrink-0 whitespace-nowrap text-2xs font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {customDaysCount} {customDaysCount === 1 ? 'Day' : 'Days'}
                      </span>
                    )}
                  </div>

                  {/* 2-Column Balanced Inputs (Start Date & End Date) */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Start Date */}
                    <div className="space-y-1 min-w-0">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block truncate">
                        From
                      </label>
                      <div className="relative flex items-center bg-white rounded-xl border border-slate-200/80 px-2 py-1.5 shadow-2xs hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
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
                          className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-slate-800 focus:outline-none cursor-pointer p-0 min-w-0 tracking-tight [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:p-0"
                        />
                      </div>
                    </div>

                    {/* End Date */}
                    <div className="space-y-1 min-w-0">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block truncate">
                        To
                      </label>
                      <div className="relative flex items-center bg-white rounded-xl border border-slate-200/80 px-2 py-1.5 shadow-2xs hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
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
                          className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-slate-800 focus:outline-none cursor-pointer p-0 min-w-0 tracking-tight [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:p-0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preset Shortcuts & Apply Action */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
                      {[
                        { label: 'This Month', type: 'this_month' as const },
                        { label: 'Last Month', type: 'last_month' as const },
                        { label: '30D', type: 'last_30' as const },
                        { label: '90D', type: 'last_90' as const },
                        { label: 'YTD', type: 'ytd' as const },
                      ].map((preset) => (
                        <button
                          key={preset.type}
                          type="button"
                          onClick={() => applyCustomPreset(preset.type)}
                          className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:scale-95 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      data-testid="reports-custom-apply-button"
                      onClick={() => setShowFilterDrawer(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#18181B] text-white hover:bg-black active:scale-95 transition-all flex items-center gap-1 shadow-xs cursor-pointer shrink-0 ml-auto"
                    >
                      <Check size={12} className="stroke-[3]" />
                      <span>Apply</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 3. SEGMENTED NAVIGATION TABS (Accessible 5-Column Grid, Zero Overflow) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div
          role="tablist"
          aria-label="Financial Report Sections"
          aria-orientation="horizontal"
          className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-1 shadow-xs"
        >
          <div className="grid grid-cols-5 gap-1 w-full text-center">
            {tabs.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`report-tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`report-tabpanel-${tab.id}`}
                  aria-label={tab.ariaLabel}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`reports-tab-${tab.id}`}
                  className={cn(
                    'flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-0.5 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer truncate active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                    isActive
                      ? 'bg-[#18181B] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  )}
                >
                  <span className={cn('shrink-0 transition-colors', isActive ? 'text-indigo-400' : 'text-slate-400')}>
                    {tab.icon}
                  </span>
                  <span className="hidden sm:inline truncate">{tab.label}</span>
                  <span className="sm:hidden truncate">{tab.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 4. EXECUTIVE SUMMARY HERO & KPI CARDS (Proper Shape & Proportion)   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Card
          data-testid="reports-card-14"
          variant="default"
          className={cn(GLASS_CARD_ROUNDED, 'p-3.5 sm:p-5 relative overflow-hidden')}
        >
          {/* Subtle Ambient Background Gradient Accents */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-50/60 to-purple-50/30 blur-2xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-gradient-to-tr from-emerald-50/50 to-teal-50/30 blur-2xl" />

          <div className="relative z-10 space-y-3.5 sm:space-y-4">
            {/* Top row: Section Header with Surplus/Deficit badge & Period Pill */}
            <div className="flex items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  summaryStats.netSavings >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                )} />
                <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight truncate">
                  Executive Summary
                </h3>
                <span className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0',
                  summaryStats.netSavings >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                )}>
                  {summaryStats.netSavings >= 0 ? 'Surplus' : 'Deficit'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100/90 border border-slate-200/60 text-[10px] sm:text-[11px] font-bold text-slate-600">
                <Calendar size={11} className="text-slate-400 shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-none">{reportPeriodLabel}</span>
              </div>
            </div>

            {/* Two Balanced Primary Metric Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {/* Box 1: Net Cash Flow */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Net Cash Flow
                  </span>
                  <span className={cn(
                    'text-2xs font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider',
                    summaryStats.netSavings >= 0 ? 'bg-emerald-100/80 text-emerald-700' : 'bg-rose-100/80 text-rose-700'
                  )}>
                    {summaryStats.netSavings >= 0 ? 'Positive' : 'Negative'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className={cn(
                    'text-lg sm:text-xl md:text-2xl font-black tracking-tight tabular-nums',
                    summaryStats.netSavings >= 0 ? 'text-slate-900' : 'text-rose-600'
                  )}>
                    {summaryStats.netSavings >= 0 ? '+' : ''}{formatCurrency(summaryStats.netSavings)}
                  </h2>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                  Savings rate: <strong className="text-slate-800 font-bold">{summaryStats.savingsRate.toFixed(1)}%</strong> this period
                </p>
              </div>

              {/* Box 2: Total Net Worth */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-indigo-600 shrink-0" />
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Total Net Worth
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                    <span className="text-emerald-600 font-bold">Liquid: {formatCurrencyAmount(totalAccountBalance, currency, { notation: 'compact', maximumFractionDigits: 1 })}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-indigo-600 font-bold">Inv: {formatCurrencyAmount(totalInvestmentValue, currency, { notation: 'compact', maximumFractionDigits: 1 })}</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight tabular-nums">
                    {formatCurrency(authoritativeNetWorth)}
                  </h2>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                  Liquid funds + investment portfolio valuation
                </p>
              </div>
            </div>

            {/* 4-Metric Integrated KPI Ribbon (Clean Rectangular Card Shapes) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-0.5">
              {/* Total Income */}
              <div
                data-testid="reports-card"
                className="p-2.5 sm:p-3 rounded-xl bg-white/90 border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[68px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Income</span>
                  <div className="w-4 h-4 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <ArrowDownLeft size={10} />
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(summaryStats.totalIncome)}</p>
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                  <TrendingUp size={9} />
                  <span>Inflow</span>
                </div>
              </div>

              {/* Total Expenses */}
              <div
                data-testid="reports-card-2"
                className="p-2.5 sm:p-3 rounded-xl bg-white/90 border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[68px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expenses</span>
                  <div className="w-4 h-4 rounded bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <ArrowUpRight size={10} />
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(summaryStats.totalExpenses)}</p>
                <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                  <TrendingDown size={9} />
                  <span>Outflow</span>
                </div>
              </div>

              {/* Net Savings */}
              <div
                data-testid="reports-card-3"
                className="p-2.5 sm:p-3 rounded-xl bg-white/90 border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[68px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Savings</span>
                  <div className="w-4 h-4 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <PiggyBank size={10} />
                  </div>
                </div>
                <p className={cn(
                  'text-xs sm:text-sm font-black tabular-nums tracking-tight my-0.5',
                  summaryStats.netSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {summaryStats.netSavings >= 0 ? '+' : ''}{formatCurrency(summaryStats.netSavings)}
                </p>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <span>Retained</span>
                </div>
              </div>

              {/* Savings Rate */}
              <div
                data-testid="reports-card-4"
                className="p-2.5 sm:p-3 rounded-xl bg-white/90 border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[68px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate</span>
                  <div className="w-4 h-4 rounded bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <BadgePercent size={10} />
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{summaryStats.savingsRate.toFixed(1)}%</p>
                <div className="flex items-center gap-1 text-[10px] font-bold text-purple-600">
                  <Activity size={9} />
                  <span>Efficiency</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 5. VIEW: OVERVIEW / CORE GRAPHS & TABLES                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === 'all' || activeTab === 'spending') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* 2-Column Analytics Grid: Donut Pie Chart + Dual-Bar Cash Flow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

              {/* 🍩 GRAPH 1: Category Spending Donut Chart */}
              <Card
                data-testid="reports-card-7"
                variant="default"
                className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
              >
                <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Category Distribution</span>
                    <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight mt-0.5 truncate">Spending Breakdown</h3>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
                    {expenseBreakdown.length} Categories
                  </span>
                </div>

                {/* Donut Visualization */}
                <div className="relative h-[220px] sm:h-[240px] w-full flex items-center justify-center">
                  {expenseBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-400 font-page-sub">
                      <PieIcon size={32} className="opacity-30 mb-2" />
                      <span>No expenses recorded for this period</span>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expenseBreakdown}
                            dataKey="value"
                            nameKey="name"
                            startAngle={90}
                            endAngle={-270}
                            innerRadius={68}
                            outerRadius={96}
                            paddingAngle={3}
                            cornerRadius={6}
                            cx="50%"
                            cy="50%"
                            isAnimationActive
                            animationDuration={800}
                          >
                            {expenseBreakdown.map((entry, index) => (
                              <Cell key={`cell-overview-${entry.name}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v)), 'Spent']} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Centered Donut Label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Spent</span>
                        <span className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">{formatCurrency(summaryStats.totalExpenses)}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">{expenseBreakdown.length} active categories</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Interactive Category Breakdown Badges */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  {expenseBreakdown.slice(0, 4).map((cat, idx) => {
                    const pct = summaryStats.totalExpenses > 0 ? Math.round((cat.value / summaryStats.totalExpenses) * 100) : 0;
                    return (
                      <div key={cat.name} className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="font-bold text-slate-800 truncate">{cat.name}</span>
                          <span className="font-caption text-slate-400">({cat.count} txns)</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-2xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">{pct}%</span>
                          <span className="font-bold text-slate-900">{formatCurrency(cat.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 📊 GRAPH 2: Monthly Inflow vs Outflow Dual-Bar Chart */}
              <Card
                data-testid="reports-card-9"
                variant="default"
                className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
              >
                <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cash Flow Comparison</span>
                    <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight mt-0.5 truncate">Monthly Inflow vs Outflow</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-2xs sm:text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> In</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Out</span>
                  </div>
                </div>

                <div className="h-[220px] sm:h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reversedMonthlyTimeline} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="shortMonth" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', maximumFractionDigits: 0 })}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val, name) => [formatCurrency(Number(val)), name === 'income' ? 'Inflow' : 'Outflow']} />
                      <Bar dataKey="income" name="income" fill="#10B981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expense" name="expense" fill="#EF4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-caption text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-500" />
                    <span>Inflow vs Outflow 6-month history</span>
                  </span>
                  <span className="text-slate-400 font-medium">Peak: {reversedMonthlyTimeline.find((m) => m.expense === maxMonthlyExpense)?.shortMonth || '-'}</span>
                </div>
              </Card>
            </div>

            {/* 📋 TABLE 1: Outflow Leaderboard & Category Progress Table */}
            <Card
              data-testid="reports-card-8"
              variant="default"
              className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
            >
              <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 leading-snug">
                    <TableIcon size={14} className="text-indigo-600 shrink-0" />
                    <span className="truncate">Category Leaderboard</span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Ranked spending categories with allocation</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  Pacing
                </span>
              </div>

              {expenseBreakdown.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-page-sub">No expenses recorded for this range.</div>
              ) : (
                <div className="space-y-3 pt-1">
                  {expenseBreakdown.map((cat, idx) => {
                    const totalExp = summaryStats.totalExpenses || 1;
                    const percent = Math.min(100, Math.round((cat.value / totalExp) * 100));
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <div key={cat.name} className="space-y-1.5 p-2.5 rounded-xl hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="font-bold text-slate-900 truncate">{cat.name}</span>
                            <span className="font-caption text-slate-400">({cat.count} txns)</span>
                          </div>
                          <div className="flex items-center gap-2.5 text-right shrink-0">
                            <span className="text-2xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">{percent}%</span>
                            <span className="font-bold text-slate-900">{formatCurrency(cat.value)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: color }}
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

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 6. VIEW: CASH FLOW & TRENDS                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === 'all' || activeTab === 'cashflow') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* 📈 GRAPH 3 & 4: Cumulative Savings Growth Area + Income/Expense Ratio */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Savings Growth Area Chart */}
              <Card
                data-testid="reports-card-10"
                variant="default"
                className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-3')}
              >
                <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 leading-snug">
                      <TrendingUp size={14} className="text-purple-600 shrink-0" />
                      <span className="truncate">Cumulative Savings Curve</span>
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Daily net capital retained in period</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50">
                    Net Trend
                  </span>
                </div>

                {savingsGrowth.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 font-page-sub">No savings trend available.</div>
                ) : (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer key={timeRange} width="100%" height="100%">
                      <AreaChart data={savingsGrowth} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                        <YAxis
                          orientation="right"
                          stroke="#94a3b8"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(Number(value)), 'Savings']} />
                        <Area type="monotone" dataKey="savings" stroke="#8B5CF6" strokeWidth={2.5} fillOpacity={1} fill="url(#savingsGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Income vs Expense Ratio Chart */}
              <Card
                data-testid="reports-card-11"
                variant="default"
                className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-3')}
              >
                <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 leading-snug">
                      <Activity size={14} className="text-indigo-600 shrink-0" />
                      <span className="truncate">Income vs Expense Ratio</span>
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Total volume ratio in selected period</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                    Ratio
                  </span>
                </div>

                <div className="h-[220px] w-full">
                  <ResponsiveContainer key={timeRange} width="100%" height="100%">
                    <BarChart data={incomeExpenseData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(Number(value)), 'Total']} />
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

            {/* 📋 TABLE 2: Monthly Cash Flow Financial Table */}
            <Card
              variant="default"
              className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-3')}
            >
              <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight truncate">Monthly Cash Flow Statement</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Past 6 months cash flow breakdown</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  Past 6 Months
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {monthlyTimeline.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-2.5 px-1 rounded-xl hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-slate-700">
                      {item.monthYearShort}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs sm:text-sm text-emerald-600 font-semibold">+{formatCurrency(item.income)}</span>
                      <span className="text-xs sm:text-sm text-rose-600 font-semibold">-{formatCurrency(item.expense)}</span>
                      <span className={cn(
                        'text-xs sm:text-sm font-bold min-w-[75px] text-right',
                        item.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      )}>
                        {item.net >= 0 ? '+' : ''}{formatCurrency(item.net)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 7. VIEW: BALANCE SHEET & NET WORTH                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === 'all' || activeTab === 'wealth') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* Net Worth Area Chart */}
            <Card
              data-testid="reports-card-10"
              variant="default"
              className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
            >
              <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trajectory</span>
                  <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight mt-0.5 truncate">Historical Net Worth</h3>
                </div>
                <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/50">
                  Portfolio
                </span>
              </div>

              <div className="h-[220px] sm:h-[250px] w-full">
                <ResponsiveContainer key={timeRange} width="100%" height="100%">
                  <AreaChart data={reversedMonthlyTimeline} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
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
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => formatCurrencyAmount(Number(val), currency, { notation: 'compact', maximumFractionDigits: 0 })}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(Number(value)), 'Net Worth']} />
                    <Area type="monotone" dataKey="netWorth" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#netWorthGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Portfolio Breakdown */}
            <Card
              data-testid="reports-card-13"
              variant="default"
              className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
            >
              <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 leading-snug">
                    <Target size={14} className="text-indigo-600 shrink-0" />
                    <span className="truncate">Balance Sheet & Capital Allocation</span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-tight truncate">
                    Positioning across liquid cash, debt, goals, and capital
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  Assets
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Liquid Cash</span>
                    <Wallet size={13} className="text-emerald-500 shrink-0" />
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(totalAccountBalance)}</p>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Bank & Cash</span>
                </div>

                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Debt</span>
                    <Landmark size={13} className="text-rose-500 shrink-0" />
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(summaryStats.totalDebt)}</p>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Loans & EMIs</span>
                </div>

                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Goals Funded</span>
                    <Target size={13} className="text-purple-500 shrink-0" />
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(summaryStats.totalGoalsProgress)}</p>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Allocated savings</span>
                </div>

                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all flex flex-col justify-between min-h-[72px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Investments</span>
                    <TrendingUp size={13} className="text-indigo-500 shrink-0" />
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums tracking-tight my-0.5">{formatCurrency(summaryStats.totalInvested)}</p>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Invested capital</span>
                </div>
              </div>
            </Card>

            {/* AI Insights & 6-Month Forecasting */}
            {(canAiInsights || canForecasting) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {canAiInsights && (
                  <Card
                    data-testid="reports-card-5"
                    variant="default"
                    className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 overflow-hidden flex flex-col space-y-3')}
                  >
                    <div className="flex items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                      <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 min-w-0 truncate">
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse shrink-0" />
                        <span className="truncate">AI Financial Intelligence</span>
                      </h3>
                      <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50">
                        Smart Insights
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
                    className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-3')}
                  >
                    <div className="flex items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                      <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 min-w-0 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="truncate">6-Month Wealth Trajectory</span>
                      </h3>
                      <span className="shrink-0 whitespace-nowrap text-2xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                        Projection
                      </span>
                    </div>
                    <ForecastSection transactions={transactions} accounts={accounts} currency={currency} formatCurrency={formatCurrency} />
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 8. VIEW: STATEMENT LEDGER TABLE (Full Transaction Statement)        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(activeTab === 'all' || activeTab === 'transactions') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card
              data-testid="reports-card-12"
              variant="default"
              className={cn(GLASS_CARD_ROUNDED, 'p-4 sm:p-6 space-y-4')}
            >
              {/* Header & Quick Export */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100/90 pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 truncate">
                    <FileText size={14} className="text-indigo-600 shrink-0" />
                    <span className="truncate">Official Statement Ledger</span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                    Showing {tableTransactions.length} of {filteredTransactions.length} transactions for {reportPeriodLabel}.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {canPdf && (
                    <Button
                      data-testid="reports-download-pdf"
                      onClick={() => void openPdfPreview()}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold bg-[#18181B] text-white hover:bg-black shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                    >
                      <Download size={12} /> PDF
                    </Button>
                  )}
                  {canCsv && (
                    <Button
                      data-testid="reports-export-csv"
                      onClick={exportCSV}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold bg-white/80 border border-slate-200/70 text-slate-800 hover:bg-white shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                    >
                      <FileText size={12} className="text-indigo-600" /> CSV
                    </Button>
                  )}
                  {canExcel && (
                    <Button
                      data-testid="reports-export-excel"
                      onClick={exportExcel}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold bg-white/80 border border-slate-200/70 text-slate-800 hover:bg-white shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                    >
                      <FileSpreadsheet size={12} className="text-emerald-600" /> Excel
                    </Button>
                  )}
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                    className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200/70 rounded-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
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
                    className="w-full sm:w-auto appearance-none pl-3.5 pr-8 py-2 bg-slate-50 border border-slate-200/70 rounded-full text-xs sm:text-sm font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option data-testid="reports-all-categories" value="all">All Categories</option>
                    {categoryOptions.map((category) => (
                      <option data-testid={`reports-option-${category}`} key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Responsive Transactions: Mobile Card List (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {tableTransactions.map((t, index) => {
                  const account = accounts.find((a) => a.id === t.accountId);
                  const rowKey = t.id ?? t.remoteId ?? `${toLocalDateKey(t.date) || 'row'}-${index}`;
                  const isIncome = t.type === 'income';
                  return (
                    <div key={rowKey} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold',
                          isIncome ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                        )}>
                          {isIncome ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {t.description || t.category}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 font-caption text-slate-400">
                            <span className="whitespace-nowrap shrink-0">{formatLocalDate(t.date, 'en-US')}</span>
                            <span>•</span>
                            <span className="truncate">{account?.name || t.category}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          'text-xs sm:text-sm font-bold',
                          isIncome ? 'text-emerald-600' : 'text-slate-900'
                        )}>
                          {isIncome ? '+' : '-'}{formatCurrency(t.amount)}
                        </p>
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider whitespace-nowrap',
                          isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        )}>
                          {t.category}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {tableTransactions.length === 0 && (
                  <div className="py-12 text-center text-slate-400 font-page-sub">
                    No transactions found matching your filter criteria.
                  </div>
                )}
              </div>

              {/* Desktop View Table (>= md) */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100 shadow-xs">
                <table data-testid="reports-table" className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-2xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Description & Category</th>
                      <th className="text-left py-3 px-4">Type</th>
                      <th className="text-right py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4">Account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {tableTransactions.map((t, index) => {
                      const account = accounts.find((a) => a.id === t.accountId);
                      const rowKey = t.id ?? t.remoteId ?? `${toLocalDateKey(t.date) || 'row'}-${index}`;
                      const isIncome = t.type === 'income';
                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-xs sm:text-sm font-semibold text-slate-600">
                            {formatLocalDate(t.date, 'en-US')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[200px] sm:max-w-[300px]">
                                {t.description || t.category}
                              </span>
                              <span className="font-caption text-slate-400">{t.category}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider whitespace-nowrap',
                              isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            )}>
                              {t.type}
                            </span>
                          </td>
                          <td className={cn(
                            'py-3 px-4 text-right font-bold text-xs sm:text-sm whitespace-nowrap',
                            isIncome ? 'text-emerald-600' : 'text-rose-600'
                          )}>
                            {isIncome ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-slate-600 font-medium">
                              <Wallet size={13} className="text-slate-400" />
                              {account?.name || '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {tableTransactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-slate-400 font-page-sub">
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

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 9. EXPORT MODAL OVERLAY                                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showExportPanel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowExportPanel(false)}
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className={cn(GLASS_CARD_ROUNDED, 'relative z-10 w-full max-w-lg p-5 sm:p-6 bg-white/95 shadow-2xl border border-white/80')}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100/90">
                  <div>
                    <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 tracking-tight truncate">Export Financial Report</h3>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Select your preferred export document format</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowExportPanel(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-4">
                  {canPdf && (
                    <ExportFormatCard
                      testId="reports-download-pdf-button"
                      icon={<Download size={18} />}
                      label="PDF Statement"
                      description="Formatted executive document with charts & tables"
                      colorClass="text-rose-600"
                      bgClass="bg-rose-50"
                      onClick={() => { pulseExportAction('download'); void openPdfPreview(); setShowExportPanel(false); }}
                      isActive={activeExportAction === 'download'}
                    />
                  )}
                  {canExcel && (
                    <ExportFormatCard
                      testId="reports-export-excel-button"
                      icon={<FileSpreadsheet size={18} />}
                      label="Excel Workbook"
                      description="Multi-tab spreadsheet with summary & categories"
                      colorClass="text-emerald-600"
                      bgClass="bg-emerald-50"
                      onClick={() => { pulseExportAction('excel'); void exportExcel(); setShowExportPanel(false); }}
                      isActive={activeExportAction === 'excel'}
                    />
                  )}
                  {canCsv && (
                    <ExportFormatCard
                      testId="reports-export-csv-button"
                      icon={<FileText size={18} />}
                      label="CSV File"
                      description="Comma-separated values for database & sheet import"
                      colorClass="text-indigo-600"
                      bgClass="bg-indigo-50"
                      onClick={() => { pulseExportAction('csv'); void exportCSV(); setShowExportPanel(false); }}
                      isActive={activeExportAction === 'csv'}
                    />
                  )}
                  <ExportFormatCard
                    testId="reports-export-json-button"
                    icon={<FileJson2 size={18} />}
                    label="JSON Data"
                    description="Structured data for developers & custom integrations"
                    colorClass="text-amber-600"
                    bgClass="bg-amber-50"
                    onClick={() => { pulseExportAction('json'); void exportJSON(); setShowExportPanel(false); }}
                    isActive={activeExportAction === 'json'}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Report PDF Preview Modal */}
      <ReportPdfPreviewModal
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false);
          setPreviewPdfBlob(null);
        }}
        pdfBlob={previewPdfBlob}
        isLoading={isGeneratingPdf}
        filename={`kanaku-report-${reportPeriodLabel.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`}
        title="Financial Statement Report"
        periodLabel={reportPeriodLabel}
      />
    </CenteredLayout>
  );
};
