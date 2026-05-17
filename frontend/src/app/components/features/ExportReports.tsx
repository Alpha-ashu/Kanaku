import React, { useState, useMemo } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { Download, FileJson, FileText, FileSpreadsheet, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFile, shareFile } from '@/lib/download';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { buildStatementReportInput, buildStatementReportPdf } from '@/lib/statementReportPdf';

interface ExportOptions {
 dataType: 'transactions' | 'accounts' | 'loans' | 'goals' | 'investments' | 'all';
 format: 'csv' | 'json' | 'pdf';
 dateRange: 'all' | 'year' | 'month' | 'custom';
 startDate?: Date;
 endDate?: Date;
}

export const ExportReports: React.FC = () => {
 const { transactions, accounts, loans, goals, investments, currency, setCurrentPage } = useApp();
 const [exportOptions, setExportOptions] = useState<ExportOptions>({
 dataType: 'transactions',
 format: 'csv',
 dateRange: 'all',
 });
 const [isExporting, setIsExporting] = useState(false);

 const reportPeriodLabel = useMemo(() => {
 if (exportOptions.dateRange === 'all') return 'All Records';
 if (exportOptions.dateRange === 'year') return 'This Year';
 if (exportOptions.dateRange === 'month') return 'This Month';
 if (exportOptions.startDate && exportOptions.endDate) {
 return `${exportOptions.startDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} - ${exportOptions.endDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
 }
 return 'Custom Range';
 }, [exportOptions.dateRange, exportOptions.startDate, exportOptions.endDate]);

 const stats = useMemo(() => {
 const totalExpenses = transactions
 .filter((t) => t.type === 'expense')
 .reduce((sum, t) => sum + t.amount, 0);

 const totalIncome = transactions
 .filter((t) => t.type === 'income')
 .reduce((sum, t) => sum + t.amount, 0);

 const totalLoans = loans.filter((l) => l.status === 'active').length;
 const totalGoals = goals.length;
 const totalInvestments = investments.length;

 return {
 totalExpenses,
 totalIncome,
 totalLoans,
 totalGoals,
 totalInvestments,
 totalAccounts: accounts.length,
 };
 }, [transactions, accounts, loans, goals, investments]);

 const getFilteredData = () => {
 let filteredTransactions = [...transactions];

 // Apply date range filter
 if (exportOptions.dateRange !== 'all' && exportOptions.dateRange !== 'custom') {
 const now = new Date();
 let startDate = new Date();

 if (exportOptions.dateRange === 'month') {
 startDate = new Date(now.getFullYear(), now.getMonth(), 1);
 } else if (exportOptions.dateRange === 'year') {
 startDate = new Date(now.getFullYear(), 0, 1);
 }

 const startKey = toLocalDateKey(startDate);
 filteredTransactions = filteredTransactions.filter((t) => {
 const itemKey = toLocalDateKey(t.date);
 return !!startKey && !!itemKey && itemKey >= startKey;
 });
 } else if (exportOptions.dateRange === 'custom' && exportOptions.startDate && exportOptions.endDate) {
 const startKey = toLocalDateKey(exportOptions.startDate);
 const endKey = toLocalDateKey(exportOptions.endDate);
 filteredTransactions = filteredTransactions.filter((t) => {
 const itemKey = toLocalDateKey(t.date);
 return !!startKey && !!endKey && !!itemKey && itemKey >= startKey && itemKey <= endKey;
 });
 }

 return filteredTransactions;
 };

 const exportToCSV = async () => {
 const data = getFilteredData();
 let csvContent = '';

 // Add headers
 if (exportOptions.dataType === 'transactions' || exportOptions.dataType === 'all') {
 csvContent += 'Date,Type,Description,Category,Amount,Account\n';
 data.forEach((t) => {
 const account = accounts.find((a) => a.id === t.accountId);
 csvContent += `"${formatLocalDate(t.date, 'en-US')}","${t.type}","${t.description}","${t.category}",${t.amount},"${account?.name}"\n`;
 });
 }

 if (exportOptions.dataType === 'accounts' || exportOptions.dataType === 'all') {
 csvContent += '\nAccount,Type,Balance\n';
 accounts.forEach((a) => {
 csvContent += `"${a.name}","${a.type}",${a.balance}\n`;
 });
 }

 if (exportOptions.dataType === 'loans' || exportOptions.dataType === 'all') {
 csvContent += '\nLoan Name,Type,Principal,Outstanding,Status\n';
 loans.forEach((l) => {
 csvContent += `"${l.name}","${l.type}",${l.principalAmount},${l.outstandingBalance},"${l.status}"\n`;
 });
 }

 const filename = `export-${exportOptions.dataType}-${Date.now()}.csv`;
 const result = await downloadFile({
 filename,
 mimeType: 'text/csv;charset=utf-8',
 data: csvContent,
 shareTitle: 'Export data',
 });

 if (result !== 'cancelled') {
 toast.success('Data exported as CSV');
 }
 };

 const exportToJSON = async () => {
 const exportData: Record<string, any> = {
 exportDate: new Date().toISOString(),
 dataType: exportOptions.dataType,
 };

 if (exportOptions.dataType === 'transactions' || exportOptions.dataType === 'all') {
 exportData.transactions = getFilteredData();
 }

 if (exportOptions.dataType === 'accounts' || exportOptions.dataType === 'all') {
 exportData.accounts = accounts;
 }

 if (exportOptions.dataType === 'loans' || exportOptions.dataType === 'all') {
 exportData.loans = loans;
 }

 if (exportOptions.dataType === 'goals' || exportOptions.dataType === 'all') {
 exportData.goals = goals;
 }

 if (exportOptions.dataType === 'investments' || exportOptions.dataType === 'all') {
 exportData.investments = investments;
 }

 const jsonString = JSON.stringify(exportData, null, 2);
 const filename = `export-${exportOptions.dataType}-${Date.now()}.json`;
 const result = await downloadFile({
 filename,
 mimeType: 'application/json',
 data: jsonString,
 shareTitle: 'Export data',
 });

 if (result !== 'cancelled') {
 toast.success('Data exported as JSON');
 }
 };

 const buildPdfBlob = async () => {
 const filteredTransactions = getFilteredData();
 return buildStatementReportPdf(buildStatementReportInput({
 reportPeriod: reportPeriodLabel,
 generatedAt: new Date(),
 currencyCode: currency,
 transactions: filteredTransactions,
 accounts,
 loans,
 goals,
 investments,
 }));
 };

 const exportToPDF = async () => {
 const pdfBlob = await buildPdfBlob();
 const filename = `finance-report-${Date.now()}.pdf`;
 const result = await downloadFile({
 filename,
 mimeType: 'application/pdf',
 data: pdfBlob,
 preferShare: false,
 shareTitle: 'Finance Report',
 });

 if (result !== 'cancelled') {
 toast.success('PDF downloaded');
 }
 };

 const sharePdfReport = async () => {
 const pdfBlob = await buildPdfBlob();
 const filename = `finance-report-${Date.now()}.pdf`;
 const shared = await shareFile({
 filename,
 mimeType: 'application/pdf',
 data: pdfBlob,
 shareTitle: 'Finance Report',
 });

 if (shared === 'shared') {
 toast.success('Report shared');
 return;
 }

 await downloadFile({
 filename,
 mimeType: 'application/pdf',
 data: pdfBlob,
 preferShare: false,
 shareTitle: 'Finance Report',
 });
 toast.info('Share unavailable, downloaded instead');
 };

 const handleExport = async () => {
 setIsExporting(true);
 try {
 if (exportOptions.format === 'csv') {
 await exportToCSV();
 } else if (exportOptions.format === 'json') {
 await exportToJSON();
 } else if (exportOptions.format === 'pdf') {
 await exportToPDF();
 }
 } catch (error) {
 console.error('Export error:', error);
 toast.error('Failed to export data');
 } finally {
 setIsExporting(false);
 }
 };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 <PageHeader
 title="Export & Reports"
 subtitle="Export your financial data in multiple formats"
 icon={<Download size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />

 {/* Stats Overview */}
 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Total Transactions</p>
 <p className="text-2xl font-bold text-gray-900 mt-1">{transactions.length}</p>
 </div>
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Total Income</p>
 <p className="text-2xl font-bold text-green-600 mt-1">
 {currency} {stats.totalIncome.toFixed(2)}
 </p>
 </div>
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Total Expenses</p>
 <p className="text-2xl font-bold text-red-600 mt-1">
 {currency} {stats.totalExpenses.toFixed(2)}
 </p>
 </div>
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Accounts</p>
 <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalAccounts}</p>
 </div>
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Active Loans</p>
 <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalLoans}</p>
 </div>
 <div className="bg-white p-4 rounded-lg border border-gray-200">
 <p className="text-sm text-gray-600">Goals</p>
 <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalGoals}</p>
 </div>
 </div>

 {/* Export Configuration */}
 <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
 <h3 className="text-lg font-semibold text-gray-900">Export Configuration</h3>

 {/* Data Type Selection */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-3">
 What data would you like to export?
 </label>
 <div className="grid grid-cols-2 gap-3">
 {[
 { value: 'transactions', label: 'Transactions' },
 { value: 'accounts', label: 'Accounts' },
 { value: 'loans', label: 'Loans' },
 { value: 'goals', label: 'Goals' },
 { value: 'investments', label: 'Investments' },
 { value: 'all', label: 'All Data' },
 ].map((option) => (
 <button
 key={option.value}
 onClick={() =>
 setExportOptions({
 ...exportOptions,
 dataType: option.value as any,
 })
 }
 className={`p-3 rounded-lg border-2 transition-all font-medium ${
 exportOptions.dataType === option.value
 ? 'border-blue-500 bg-blue-50 text-blue-600'
 : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
 }`}
 aria-label={`Export ${option.label} data`}
 title={`Export ${option.label} data`}
 >
 {option.label}
 </button>
 ))}
 </div>
 </div>

 {/* Format Selection */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-3">
 File format
 </label>
 <div className="grid grid-cols-3 gap-3">
 {[
 { value: 'csv', label: 'CSV', icon: <FileSpreadsheet size={20} /> },
 { value: 'json', label: 'JSON', icon: <FileJson size={20} /> },
 { value: 'pdf', label: 'PDF', icon: <FileText size={20} /> },
 ].map((option) => (
 <button
 key={option.value}
 onClick={() =>
 setExportOptions({
 ...exportOptions,
 format: option.value as any,
 })
 }
 className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
 exportOptions.format === option.value
 ? 'border-blue-500 bg-blue-50 text-blue-600'
 : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
 }`}
 aria-label={`Select ${option.label} format`}
 title={`Select ${option.label} format`}
 >
 {option.icon}
 <span className="text-sm font-medium">{option.label}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Date Range Selection */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-3">
 Date range
 </label>
 <div className="grid grid-cols-2 gap-3">
 {[
 { value: 'all', label: 'All records' },
 { value: 'year', label: 'This year' },
 { value: 'month', label: 'This month' },
 { value: 'custom', label: 'Custom range' },
 ].map((option) => (
 <button
 key={option.value}
 onClick={() =>
 setExportOptions({
 ...exportOptions,
 dateRange: option.value as any,
 })
 }
 className={`p-3 rounded-lg border-2 transition-all font-medium ${
 exportOptions.dateRange === option.value
 ? 'border-blue-500 bg-blue-50 text-blue-600'
 : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
 }`}
 aria-label={`Select ${option.label} date range`}
 title={`Select ${option.label} date range`}
 >
 {option.label}
 </button>
 ))}
 </div>
 </div>

 {/* Custom Date Range */}
 {exportOptions.dateRange === 'custom' && (
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="export-start-date" className="block text-sm font-medium text-gray-700 mb-2">
 Start date
 </label>
 <input
 id="export-start-date"
 type="date"
 value={exportOptions.startDate ? toLocalDateKey(exportOptions.startDate) ?? '' : ''}
 onChange={(e) =>
 setExportOptions({
 ...exportOptions,
 startDate: parseDateInputValue(e.target.value) ?? undefined,
 })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Start date"
 title="Start date"
 placeholder="Select start date"
 />
 </div>
 <div>
 <label htmlFor="export-end-date" className="block text-sm font-medium text-gray-700 mb-2">
 End date
 </label>
 <input
 id="export-end-date"
 type="date"
 value={exportOptions.endDate ? toLocalDateKey(exportOptions.endDate) ?? '' : ''}
 onChange={(e) =>
 setExportOptions({
 ...exportOptions,
 endDate: parseDateInputValue(e.target.value) ?? undefined,
 })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="End date"
 title="End date"
 placeholder="Select end date"
 />
 </div>
 </div>
 )}

 {/* Export Button */}
 <button
 onClick={handleExport}
 disabled={isExporting}
 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
 aria-label={`Export as ${exportOptions.format.toUpperCase()}`}
 title={`Export as ${exportOptions.format.toUpperCase()}`}
 >
 <Download size={20} />
 {isExporting
 ? 'Exporting...'
 : exportOptions.format === 'pdf'
 ? 'Download PDF'
 : `Export as ${exportOptions.format.toUpperCase()}`}
 </button>

 {exportOptions.format === 'pdf' && (
 <button
 onClick={sharePdfReport}
 disabled={isExporting}
 className="w-full py-3 bg-white text-blue-700 rounded-lg border border-blue-300 hover:bg-blue-50 disabled:bg-gray-100 font-medium transition-colors flex items-center justify-center gap-2"
 aria-label="Share report"
 title="Share report"
 >
 <Share2 size={20} />
 Share Report
 </button>
 )}
 </div>

 {/* Export Information */}
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
 <h4 className="font-semibold text-blue-900">About your export:</h4>
 <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
 <li>CSV: Best for spreadsheet applications like Excel</li>
 <li>JSON: Best for data portability and integration with other apps</li>
 <li>PDF: Statement style report with charts, summaries and transactions</li>
 <li>All your data is exported locally and never sent to external servers</li>
 </ul>
 </div>
 </div>
 </CenteredLayout>
 );
};

