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
} from 'recharts';
import { Calendar, Download, FileSpreadsheet, FileText, MoreHorizontal, Share2, TrendingUp } from 'lucide-react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion } from 'framer-motion';
import { downloadFile, shareFile } from '@/lib/download';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { buildStatementReportInput, buildStatementReportPdf } from '@/lib/statementReportPdf';
import { AIInsightsCard } from '@/app/components/shared/AIInsightsCard';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

const chartColors = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#22C55E', '#0EA5E9', '#F97316'];

const ForecastSection: React.FC<{ transactions: any[]; accounts: any[]; currency: string; formatCurrency: (v: number) => string }> = ({ transactions, accounts, currency, formatCurrency }) => {
  const forecastData = useMemo(() => {
    const monthlyNet: number[] = [];
    const monthlyMap = new Map<string, number>();

    transactions.forEach(t => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const delta = t.type === 'income' ? t.amount : -t.amount;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + delta);
    });

    monthlyMap.forEach(val => monthlyNet.push(val));

    // Average monthly net cash flow drives the projection slope. With no
    // history there is nothing to project from, so the slope is flat (0).
    const avgMonthlyNet = monthlyNet.length > 0
      ? monthlyNet.reduce((a, b) => a + b, 0) / monthlyNet.length
      : 0;

    // Starting baseline = the user's real current net worth (sum of account
    // balances). Falls back to the cumulative net of all transactions when no
    // account balances are available, so the chart always reflects real data.
    const accountsTotal = (accounts || []).reduce((sum, a) => sum + (Number(a?.balance) || 0), 0);
    const cumulativeNet = monthlyNet.reduce((a, b) => a + b, 0);
    const startValue = accountsTotal !== 0 ? accountsTotal : cumulativeNet;

    const data: Array<{ month: string; Optimistic: number; Conservative: number; Expected: number }> = [];
    const now = new Date();
    
    data.push({
      month: 'Now',
      'Optimistic': startValue,
      'Conservative': startValue,
      'Expected': startValue,
    });
    
    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = futureDate.toLocaleDateString('en-US', { month: 'short' });
      
      const expected = startValue + avgMonthlyNet * i;
      const optimistic = startValue + (avgMonthlyNet * 1.3) * i;
      const conservative = startValue + (avgMonthlyNet * 0.7) * i;
      
      data.push({
        month: monthLabel,
        'Optimistic': Math.round(optimistic),
        'Conservative': Math.round(conservative),
        'Expected': Math.round(expected),
      });
    }
    
    return data;
  }, [transactions, accounts]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 font-medium leading-relaxed">
        Based on your historical spending habits, here is a 6-month prediction of your wealth trajectory:
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} />
            <YAxis stroke="#9ca3af" fontSize={11} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Optimistic" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            <Line type="monotone" dataKey="Expected" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Conservative" stroke="#EF4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-[11px] font-medium text-blue-800">
        ⚡ <strong>Insight:</strong> Keep your monthly expenses below average to track closer to the <strong>Optimistic</strong> trajectory.
      </div>
    </div>
  );
};

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type ExportAction = 'download' | 'share' | 'csv' | 'excel' | 'more';

export const Reports: React.FC = () => {
 const { transactions, accounts, loans, goals, investments, currency, setCurrentPage } = useApp();
 const canPdf = useSubFeature('reports', 'pdfExport');
 const canCsv = useSubFeature('reports', 'csvExport');
 const canExcel = useSubFeature('reports', 'excelExport');
 const canAiInsights = useSubFeature('reports', 'aiInsightsReport');
 const canForecasting = useSubFeature('reports', 'forecasting');
 const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
 const [customRange, setCustomRange] = useState({ start: '', end: '' });
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
 return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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
 return `${start.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Reports & Analytics</h1>
 </div>
 <div className="flex flex-wrap gap-2">
 {canPdf && (
 <Button
 onClick={() => {
 pulseExportAction('download');
 void downloadPDF();
 }}
 data-testid="reports-download-pdf-button"
 aria-label="Download PDF"
 title="Download PDF"
 className={`shadow-lg h-11 px-4 rounded-2xl font-semibold transition-all active:scale-95 flex items-center gap-2 ${
 activeExportAction === 'download' 
 ? 'bg-gray-900 text-white ring-2 ring-offset-2 ring-gray-900/20' 
 : 'bg-white text-gray-900 border border-gray-100 hover:bg-gray-50'
 }`}
 >
 <Download size={18} />
 <span className="hidden sm:inline">Download PDF</span>
 </Button>
 )}
 {canPdf && (
 <Button
 onClick={() => {
 pulseExportAction('share');
 void sharePDF();
 }}
 data-testid="reports-share-button"
 aria-label="Share report"
 title="Share report"
 className={`shadow-lg h-11 px-4 rounded-2xl font-semibold transition-all active:scale-95 flex items-center gap-2 ${
 activeExportAction === 'share'
 ? 'bg-gray-900 text-white ring-2 ring-offset-2 ring-gray-900/20'
 : 'bg-white text-gray-900 border border-gray-100 hover:bg-gray-50'
 }`}
 >
 <Share2 size={18} />
 <span className="hidden sm:inline">Share Report</span>
 </Button>
 )}
 {canCsv && (
 <Button
 onClick={() => {
 pulseExportAction('csv');
 void exportCSV();
 }}
 data-testid="reports-export-csv-button"
 aria-label="Export report as CSV"
 title="Export CSV"
 className={`shadow-lg h-11 px-4 rounded-2xl font-semibold transition-all active:scale-95 flex items-center gap-2 ${
 activeExportAction === 'csv'
 ? 'bg-gray-900 text-white ring-2 ring-offset-2 ring-gray-900/20'
 : 'bg-white text-gray-900 border border-gray-100 hover:bg-gray-50'
 }`}
 >
 <FileText size={18} />
 <span className="hidden sm:inline">Export CSV</span>
 </Button>
 )}
 {canExcel && (
 <Button
 onClick={() => {
 pulseExportAction('excel');
 void exportExcel();
 }}
 data-testid="reports-export-excel-button"
 aria-label="Export report as Excel"
 title="Export Excel"
 className={`shadow-lg h-11 px-4 rounded-2xl font-semibold transition-all active:scale-95 flex items-center gap-2 ${
 activeExportAction === 'excel'
 ? 'bg-gray-900 text-white ring-2 ring-offset-2 ring-gray-900/20'
 : 'bg-white text-gray-900 border border-gray-100 hover:bg-gray-50'
 }`}
 >
 <FileSpreadsheet size={18} />
 <span className="hidden sm:inline">Export Excel</span>
 </Button>
 )}
 <Button
 onClick={() => {
 pulseExportAction('more');
 setCurrentPage('export-reports');
 }}
 data-testid="reports-more-export-button"
 aria-label="Open more export options"
 title="More Export Options"
 className={`shadow-lg h-11 px-4 rounded-2xl font-semibold transition-all active:scale-95 flex items-center gap-2 ${
 activeExportAction === 'more'
 ? 'bg-gray-900 text-white ring-2 ring-offset-2 ring-gray-900/20'
 : 'bg-white text-gray-900 border border-gray-100 hover:bg-gray-50'
 }`}
 >
 <MoreHorizontal size={18} />
 <span className="hidden sm:inline">More</span>
 </Button>
 </div>
 </div>

 <div className="flex flex-col gap-3">
 <div className="flex flex-wrap items-center gap-2">
 {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as TimeRange[]).map((range) => (
 <button
 key={range}
 data-testid={`reports-range-${range}`}
 onClick={() => setTimeRange(range)}
 className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
 timeRange === range
 ? 'bg-black text-white shadow-sm'
 : 'text-gray-600 hover:bg-gray-100'
 }`}
 >
 {range === 'daily' && 'Daily'}
 {range === 'weekly' && 'Weekly'}
 {range === 'monthly' && 'Monthly'}
 {range === 'yearly' && 'Yearly'}
 {range === 'custom' && 'Custom'}
 </button>
 ))}
 </div>
 {timeRange === 'custom' && (
 <div className="flex flex-wrap gap-3">
 <div className="flex items-center gap-2">
 <Calendar size={16} className="text-gray-500" />
 <input
 type="date"
 value={customRange.start}
 onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
 data-testid="reports-custom-start-input"
 aria-label="Custom report start date"
 title="Custom report start date"
 className="px-3 py-2 border border-gray-200 rounded-lg"
 />
 </div>
 <div className="flex items-center gap-2">
 <Calendar size={16} className="text-gray-500" />
 <input
 type="date"
 value={customRange.end}
 onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
 data-testid="reports-custom-end-input"
 aria-label="Custom report end date"
 title="Custom report end date"
 className="px-3 py-2 border border-gray-200 rounded-lg"
 />
 </div>
 </div>
 )}
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
 <Card variant="glass" className="p-4 sm:p-6">
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Income</p>
 <p className="text-xl sm:text-2xl font-display font-bold text-green-600">{formatCurrency(summaryStats.totalIncome)}</p>
 </Card>
 </motion.div>
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
 <Card variant="glass" className="p-4 sm:p-6">
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Expenses</p>
 <p className="text-xl sm:text-2xl font-display font-bold text-red-600">{formatCurrency(summaryStats.totalExpenses)}</p>
 </Card>
 </motion.div>
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
 <Card variant="glass" className="p-4 sm:p-6">
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Savings</p>
 <p className={`text-xl sm:text-2xl font-display font-bold ${summaryStats.netSavings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {formatCurrency(summaryStats.netSavings)}
 </p>
 </Card>
 </motion.div>
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
 <Card variant="glass" className="p-4 sm:p-6">
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Savings Rate</p>
 <p className={`text-xl sm:text-2xl font-display font-bold ${summaryStats.savingsRate >= 20 ? 'text-green-600' : 'text-orange-600'}`}>
 {summaryStats.savingsRate.toFixed(1)}%
 </p>
 </Card>
 </motion.div>
 </div>

  {/* Advanced Reports Section */}
  {(canAiInsights || canForecasting) && (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {canAiInsights && (
        <Card variant="glass" className="p-6 overflow-hidden flex flex-col">
          <h3 className="text-lg font-display font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            AI Intelligence Insights
          </h3>
          <div className="flex-1">
            <AIInsightsCard compact />
          </div>
        </Card>
      )}
      {canForecasting && (
        <Card variant="glass" className="p-6 overflow-hidden flex flex-col">
          <h3 className="text-lg font-display font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Smart Financial Forecasting
          </h3>
          <div className="flex-1">
            <ForecastSection transactions={transactions} accounts={accounts} currency={currency} formatCurrency={formatCurrency} />
          </div>
        </Card>
      )}
    </div>
  )}

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Expense Breakdown</h3>
 {expenseBreakdown.length === 0 ? (
 <p className="text-sm text-gray-500">No expenses found for this range.</p>
 ) : (
 <ResponsiveContainer width="100%" height={280}>
 <PieChart>
 <Pie data={expenseBreakdown} dataKey="value" nameKey="name" outerRadius={100}>
 {expenseBreakdown.map((entry, index) => (
 <Cell key={`cell-${entry.name}`} fill={chartColors[index % chartColors.length]} />
 ))}
 </Pie>
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 )}
 </Card>

 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Category-wise Spending</h3>
 {expenseBreakdown.length === 0 ? (
 <p className="text-sm text-gray-500">No expenses found for this range.</p>
 ) : (
 <ResponsiveContainer width="100%" height={280}>
 <BarChart data={expenseBreakdown.slice(0, 8)}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="name" angle={-20} textAnchor="end" height={70} stroke="#9ca3af" />
 <YAxis stroke="#9ca3af" />
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 <Bar dataKey="value" fill="#111827" radius={[8, 8, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}
 </Card>
 </div>

 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Monthly Cash Flow</h3>
 {cashFlowMonthly.length === 0 ? (
 <p className="text-sm text-gray-500">No cash flow data available.</p>
 ) : (
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={cashFlowMonthly}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="month" stroke="#9ca3af" />
 <YAxis stroke="#9ca3af" />
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 <Legend />
 <Bar dataKey="income" fill="#10B981" name="Income" radius={[6, 6, 0, 0]} />
 <Bar dataKey="expense" fill="#EF4444" name="Expense" radius={[6, 6, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Savings Growth</h3>
 {savingsGrowth.length === 0 ? (
 <p className="text-sm text-gray-500">No savings data available.</p>
 ) : (
 <ResponsiveContainer width="100%" height={280}>
 <LineChart data={savingsGrowth}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="date" stroke="#9ca3af" />
 <YAxis stroke="#9ca3af" />
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 <Line type="monotone" dataKey="savings" stroke="#2563EB" strokeWidth={2.5} />
 </LineChart>
 </ResponsiveContainer>
 )}
 </Card>

 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Income vs Expense</h3>
 <ResponsiveContainer width="100%" height={280}>
 <BarChart data={incomeExpenseData}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="name" stroke="#9ca3af" />
 <YAxis stroke="#9ca3af" />
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 <Bar dataKey="value" fill="#0F172A" radius={[8, 8, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </Card>
 </div>

 <Card variant="glass" className="p-6">
 <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
 <div>
 <h3 className="text-lg font-display font-bold text-gray-900">Transactions</h3>
 <p className="text-sm text-gray-500">Search and filter detailed activity.</p>
 </div>
 <div className="flex flex-wrap gap-2">
 {canPdf && <Button onClick={() => void downloadPDF()} className="rounded-full px-4 py-2 text-xs bg-black text-white hover:bg-gray-900">Download PDF</Button>}
 {canCsv && <Button onClick={exportCSV} className="rounded-full px-4 py-2 text-xs bg-white border border-gray-200 text-gray-900 hover:bg-gray-50">Export CSV</Button>}
 {canExcel && <Button onClick={exportExcel} className="rounded-full px-4 py-2 text-xs bg-white border border-gray-200 text-gray-900 hover:bg-gray-50">Export Excel</Button>}
 </div>
 </div>

 <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
 <label htmlFor="reports-search-transactions" className="sr-only">Search transactions</label>
 <input
 id="reports-search-transactions"
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search transactions"
 aria-label="Search transactions"
 title="Search transactions"
 className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
 />
 <label htmlFor="reports-category-filter" className="sr-only">Filter transactions by category</label>
 <select
 id="reports-category-filter"
 value={categoryFilter}
 onChange={(e) => setCategoryFilter(e.target.value)}
 aria-label="Filter transactions by category"
 title="Filter transactions by category"
 className="px-3 py-2 border border-gray-200 rounded-lg"
 >
 <option value="all">All Categories</option>
 {categoryOptions.map((category) => (
 <option key={category} value={category}>{category}</option>
 ))}
 </select>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-white text-gray-600">
 <tr>
 <th className="text-left p-3">Date</th>
 <th className="text-left p-3">Category</th>
 <th className="text-left p-3">Type</th>
 <th className="text-right p-3">Amount</th>
 <th className="text-left p-3">Payment Method</th>
 </tr>
 </thead>
 <tbody>
 {tableTransactions.map((t, index) => {
 const account = accounts.find((a) => a.id === t.accountId);
 const rowKey = t.id ?? t.remoteId ?? `${toLocalDateKey(t.date) || 'row'}-${index}`;
 return (
 <tr key={rowKey} className="border-b border-gray-100">
 <td className="p-3 whitespace-nowrap">{formatLocalDate(t.date, 'en-US')}</td>
 <td className="p-3">{t.category}</td>
 <td className="p-3 capitalize">{t.type}</td>
 <td className={`p-3 text-right font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
 {formatCurrency(t.amount)}
 </td>
 <td className="p-3">{account?.name || '-'}</td>
 </tr>
 );
 })}
 {tableTransactions.length === 0 && (
 <tr>
 <td colSpan={5} className="p-6 text-center text-gray-500">No transactions found.</td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Financial Summary</h3>
 <div className="space-y-3">
 <div className="p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors">
 <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Active Debt</p>
 <p className="text-xl font-display font-bold text-gray-900 mt-1">{formatCurrency(summaryStats.totalDebt)}</p>
 </div>
 <div className="p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors">
 <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Goals Progress</p>
 <p className="text-xl font-display font-bold text-gray-900 mt-1">{formatCurrency(summaryStats.totalGoalsProgress)}</p>
 </div>
 <div className="p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors">
 <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Invested</p>
 <p className="text-xl font-display font-bold text-gray-900 mt-1">{formatCurrency(summaryStats.totalInvested)}</p>
 </div>
 </div>
 </Card>

 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Net Worth Snapshot</h3>
 <div className="p-5 bg-black/5 rounded-2xl border border-black/10">
 <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Net Worth</p>
 <p className="text-2xl font-display font-bold text-gray-900 mt-2">
 {formatCurrency(
 accounts.reduce((sum, a) => sum + a.balance, 0) +
 summaryStats.totalGoalsProgress +
 summaryStats.totalInvested -
 summaryStats.totalDebt
 )}
 </p>
 <p className="text-xs text-gray-500 mt-2">Includes assets, goals, investments, and liabilities.</p>
 </div>
 </Card>
 </div>
 </div>
 </CenteredLayout>
 );
};
