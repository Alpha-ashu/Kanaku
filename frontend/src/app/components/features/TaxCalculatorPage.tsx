import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ChevronLeft, Calculator } from 'lucide-react';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

const TAX_BRACKETS = {
 'US': {
 2024: {
 single: [
 { min: 0, max: 11000, rate: 0.1 },
 { min: 11000, max: 44725, rate: 0.12 },
 { min: 44725, max: 95375, rate: 0.22 },
 { min: 95375, max: 182100, rate: 0.24 },
 { min: 182100, max: 231250, rate: 0.32 },
 { min: 231250, max: 578125, rate: 0.35 },
 { min: 578125, max: Infinity, rate: 0.37 },
 ],
 married: [
 { min: 0, max: 22000, rate: 0.1 },
 { min: 22000, max: 89075, rate: 0.12 },
 { min: 89075, max: 190750, rate: 0.22 },
 { min: 190750, max: 364200, rate: 0.24 },
 { min: 364200, max: 462500, rate: 0.32 },
 { min: 462500, max: 693750, rate: 0.35 },
 { min: 693750, max: Infinity, rate: 0.37 },
 ],
 },
 },
 'India': {
 2024: {
 standard: [
 { min: 0, max: 300000, rate: 0 },
 { min: 300000, max: 700000, rate: 0.05 },
 { min: 700000, max: 1000000, rate: 0.2 },
 { min: 1000000, max: 1200000, rate: 0.3 },
 { min: 1200000, max: 1500000, rate: 0.3 },
 { min: 1500000, max: Infinity, rate: 0.3 },
 ],
 },
 },
};

interface TaxResult {
 grossIncome: number;
 deductions: number;
 taxableIncome: number;
 estimatedTax: number;
 effectiveRate: number;
 breakdown: Array<{
 bracket: string;
 tax: number;
 }>;
}

export const TaxCalculator: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
 const { currency, setCurrentPage } = useApp();
 const [year, setYear] = useState(2024);
 const [country, setCountry] = useState('India');
 const [filingStatus, setFilingStatus] = useState('standard');
 const [totalIncome, setTotalIncome] = useState(0);
 const [deductions, setDeductions] = useState(0);
 const [taxResult, setTaxResult] = useState<TaxResult | null>(null);

 const transactions = useLiveQuery(() => db.transactions.toArray(), []) || [];

 // Auto-calculate income from transactions
 useEffect(() => {
 const currentYear = new Date().getFullYear();
 if (year === currentYear) {
 const incomeSum = transactions
 .filter((t) => t.type === 'income' && new Date(t.date).getFullYear() === year)
 .reduce((sum, t) => sum + (t.amount || 0), 0);
 setTotalIncome(incomeSum);
 }
 }, [transactions, year]);

 const calculateTax = () => {
 const yearBrackets = TAX_BRACKETS[country as keyof typeof TAX_BRACKETS]?.[year as keyof typeof TAX_BRACKETS[keyof typeof TAX_BRACKETS]] as any;
 const brackets = yearBrackets?.[filingStatus];

 if (!brackets) {
 toast.error('Tax brackets not available for selected options');
 return;
 }

 const taxableIncome = Math.max(0, totalIncome - deductions);
 let estimatedTax = 0;
 const breakdown: Array<{ bracket: string; tax: number; }> = [];

 for (const bracket of brackets) {
 const incomeBracketMin = Math.max(bracket.min, 0);
 const incomeBracketMax = Math.min(bracket.max, taxableIncome);

 if (incomeBracketMin < incomeBracketMax) {
 const taxInBracket = (incomeBracketMax - incomeBracketMin) * bracket.rate;
 estimatedTax += taxInBracket;
 breakdown.push({
 bracket: `${country === 'India' ? '' : '$'}${incomeBracketMin.toLocaleString()} - ${incomeBracketMax.toLocaleString()} @ ${(bracket.rate * 100).toFixed(0)}%`,
 tax: taxInBracket,
 });
 }
 }

 const effectiveRate = taxableIncome > 0 ? (estimatedTax / taxableIncome) * 100 : 0;

 setTaxResult({
 grossIncome: totalIncome,
 deductions,
 taxableIncome,
 estimatedTax,
 effectiveRate,
 breakdown,
 });

 toast.success('Tax calculated successfully');
 };

 const handleBack = () => {
 if (onBack) {
 onBack();
 } else {
 setCurrentPage('settings');
 }
 };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

 return (
 <div className="w-full min-h-screen overflow-x-hidden bg-white">
 <div className="max-w-[1400px] mx-auto pb-32 lg:pb-24 w-full">
 <div className="px-4 lg:px-8 pt-6 lg:pt-10 pb-4 lg:pb-6">
 <PageHeader 
 title="Tax Calculator" 
 subtitle="Estimate your tax liability" 
 icon={<Calculator size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />
 </div>
 <div className="px-4 lg:px-8 space-y-6">
 {/* Main Content */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Input Form */}
 <div className="lg:col-span-2 space-y-6">
 <div className="bg-white rounded-2xl border border-gray-200 p-8">
 <form onSubmit={(e) => { e.preventDefault(); calculateTax(); }} className="space-y-6">
 {/* Year Selection */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Financial Year
 </label>
 <select
 value={year}
 onChange={(e) => setYear(parseInt(e.target.value))}
 className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
 aria-label="Select tax year"
 >
 {[2024, 2023, 2022, 2021].map((y) => (
 <option key={y} value={y}>{y}</option>
 ))}
 </select>
 </div>

 {/* Country Selection */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Country
 </label>
 <select
 value={country}
 onChange={(e) => {
 setCountry(e.target.value);
 setFilingStatus(e.target.value === 'India' ? 'standard' : 'single');
 }}
 className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
 aria-label="Select country"
 >
 <option value="India">India</option>
 <option value="US">United States</option>
 </select>
 </div>

 {/* Filing Status */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Filing Status
 </label>
 <select
 value={filingStatus}
 onChange={(e) => setFilingStatus(e.target.value)}
 className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
 aria-label="Select filing status"
 >
 {country === 'India' ? (
 <option value="standard">Standard</option>
 ) : (
 <>
 <option value="single">Single</option>
 <option value="married">Married Filing Jointly</option>
 </>
 )}
 </select>
 </div>

 {/* Total Income */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Total Income
 </label>
 <div className="flex items-center">
 <span className="text-gray-600 mr-3 text-lg">{currency}</span>
 <input
 type="number"
 step="0.01"
 value={totalIncome || ''}
 onChange={(e) => setTotalIncome(parseFloat(e.target.value) || 0)}
 placeholder="0.00"
 className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
 />
 </div>
 <p className="text-xs text-gray-500 mt-2">Auto-populated from income transactions</p>
 </div>

 {/* Deductions */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Deductions
 </label>
 <div className="flex items-center">
 <span className="text-gray-600 mr-3 text-lg">{currency}</span>
 <input
 type="number"
 step="0.01"
 value={deductions || ''}
 onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
 placeholder="0.00"
 className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
 />
 </div>
 </div>

 {/* Buttons */}
 <div className="flex gap-4 pt-6">
 <button
 type="button"
 onClick={handleBack}
 className="flex-1 px-6 py-3 border-2 border-gray-200 rounded-xl hover:bg-white transition-colors font-medium text-gray-700"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium"
 >
 Calculate Tax
 </button>
 </div>
 </form>
 </div>
 </div>

 {/* Results Panel */}
 <div className="space-y-4">
 {taxResult ? (
 <>
 {/* Summary Cards */}
 <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl p-6 text-white">
 <p className="text-sm opacity-90 mb-1 font-medium">Estimated Tax</p>
 <p className="text-4xl font-bold">{formatCurrency(taxResult.estimatedTax)}</p>
 <p className="text-sm opacity-75 mt-2">Effective Rate: {taxResult.effectiveRate.toFixed(2)}%</p>
 </div>

 <div className="bg-white rounded-2xl border border-gray-200 p-6">
 <h3 className="font-semibold text-gray-900 mb-4">Breakdown</h3>
 <div className="space-y-2 max-h-80 overflow-y-auto">
 {taxResult.breakdown.map((item, idx) => (
 <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg">
 <span className="text-xs text-gray-600">{item.bracket}</span>
 <span className="font-semibold text-gray-900">{formatCurrency(item.tax)}</span>
 </div>
 ))}
 </div>
 </div>

 <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
 <div className="space-y-3">
 <div className="flex justify-between text-sm">
 <span className="text-gray-600">Gross Income:</span>
 <span className="font-medium">{formatCurrency(taxResult.grossIncome)}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-gray-600">Deductions:</span>
 <span className="font-medium">{formatCurrency(taxResult.deductions)}</span>
 </div>
 <div className="border-t border-green-200 pt-3 flex justify-between text-sm">
 <span className="text-gray-700 font-medium">Taxable Income:</span>
 <span className="font-bold text-green-700">{formatCurrency(taxResult.taxableIncome)}</span>
 </div>
 </div>
 </div>
 </>
 ) : (
 <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200 h-64 flex items-center justify-center">
 <p className="text-center text-gray-500 font-medium">
 Fill in your income details and click"Calculate Tax" to see results
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};

export default TaxCalculator;


