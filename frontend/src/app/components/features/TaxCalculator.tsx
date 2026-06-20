import React, { useState, useEffect } from 'react';
import { db } from '@/lib/database';
import { calculateTax, TAX_BRACKETS, STANDARD_DEDUCTIONS } from '@/lib/expenseCategories';
import { toast } from 'sonner';
import { Calculator } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Transaction } from '@/lib/database';

interface TaxCalculatorProps {
 isOpen: boolean;
 onClose: () => void;
 currency: string;
}

export const TaxCalculator: React.FC<TaxCalculatorProps> = ({
 isOpen,
 onClose,
 currency,
}) => {
 const [formData, setFormData] = useState({
 year: new Date().getFullYear(),
 totalIncome: 0,
 deductions: 0,
 country: 'india',
 filingStatus: 'singleFiler',
 });

 const [taxResult, setTaxResult] = useState<any>(null);

 const transactions = useLiveQuery(() => db.transactions.toArray(), []) || [];

 // Calculate income from transactions
 useEffect(() => {
 const yearStart = new Date(formData.year, 0, 1);
 const yearEnd = new Date(formData.year, 11, 31);

 const incomeTransactions = transactions.filter((t: Transaction) => {
 const date = new Date(t.date);
 return (
 t.type === 'income' &&
 date >= yearStart &&
 date <= yearEnd
 );
 });

 const totalIncome = incomeTransactions.reduce((sum: number, t: Transaction) => sum + t.amount, 0);
 setFormData((prev) => ({ ...prev, totalIncome }));
 }, [transactions, formData.year]);

 const handleCalculate = async () => {
 try {
 const result = calculateTax(
 formData.totalIncome,
 formData.country,
 formData.filingStatus
 );

 const standardDeduction =
 STANDARD_DEDUCTIONS[formData.country as keyof typeof STANDARD_DEDUCTIONS][
 formData.filingStatus as keyof typeof STANDARD_DEDUCTIONS.india
 ] || 0;

 const totalDeductions = formData.deductions + standardDeduction;
 const finalTaxableIncome = Math.max(0, formData.totalIncome - totalDeductions);

 // Recalculate with custom deductions
 let finalTax = 0;
 const brackets = TAX_BRACKETS[formData.country as keyof typeof TAX_BRACKETS];

 if (brackets) {
 const bracketsArray = Array.isArray(brackets) ? brackets : Object.values(brackets);
 for (const bracket of bracketsArray) {
 if (finalTaxableIncome > bracket.min) {
 const incomeInBracket = Math.min(finalTaxableIncome, bracket.max) - bracket.min;
 finalTax += incomeInBracket * bracket.rate;
 }
 }
 }

 const effectiveRate = formData.totalIncome > 0 ? (finalTax / formData.totalIncome) * 100 : 0;

 setTaxResult({
 grossIncome: formData.totalIncome,
 standardDeduction,
 customDeductions: formData.deductions,
 totalDeductions,
 taxableIncome: finalTaxableIncome,
 estimatedTax: finalTax,
 effectiveRate: effectiveRate.toFixed(2),
 afterTaxIncome: formData.totalIncome - finalTax,
 });

 // Save calculation
 await db.taxCalculations.add({
 year: formData.year,
 totalIncome: formData.totalIncome,
 totalExpense: 0,
 netProfit: formData.totalIncome,
 taxableIncome: finalTaxableIncome,
 estimatedTax: finalTax,
 taxRate: effectiveRate,
 deductions: totalDeductions,
 currency,
 createdAt: new Date(),
 });

 toast.success('Tax calculation saved');
 } catch (error) {
 console.error('Tax calculation failed:', error);
 toast.error('Calculation failed');
 }
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
 <div className="bg-white rounded-xl p-6 w-full max-w-md my-8">
 <div className="flex items-center gap-2 mb-4">
 <Calculator className="text-blue-600" size={24} />
 <h3 className="text-xl font-bold">Tax Calculator</h3>
 </div>

 <div className="space-y-4">
 {/* Year */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Tax Year
 </label>
 <input data-testid="tax-calculator-input"
 type="number"
 value={formData.year}
 onChange={(e) =>
 setFormData({ ...formData, year: parseInt(e.target.value) })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>

 {/* Country */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Country
 </label>
 <select data-testid="tax-calculator-select"
 value={formData.country}
 onChange={(e) =>
 setFormData({ ...formData, country: e.target.value })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option data-testid="tax-calculator-india" value="india">India</option>
 <option data-testid="tax-calculator-usa" value="usa">USA</option>
 </select>
 </div>

 {/* Filing Status */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Filing Status
 </label>
 <select data-testid="tax-calculator-select-2"
 value={formData.filingStatus}
 onChange={(e) =>
 setFormData({ ...formData, filingStatus: e.target.value })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option data-testid="tax-calculator-single" value="singleFiler">Single</option>
 <option data-testid="tax-calculator-married-filing-jointly" value="marriedFiler">Married Filing Jointly</option>
 <option data-testid="tax-calculator-head-of-household" value="headOfHousehold">Head of Household</option>
 <option data-testid="tax-calculator-senior-citizen" value="seniorCitizen">Senior Citizen</option>
 </select>
 </div>

 {/* Total Income (Auto-calculated but Editable) */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Total Income
 </label>
 <div className="flex items-center">
 <span className="text-gray-600 mr-2">{currency}</span>
 <input data-testid="tax-calculator-input-2"
 type="number"
 step="0.01"
 value={formData.totalIncome}
 onChange={(e) =>
 setFormData({ ...formData, totalIncome: parseFloat(e.target.value) || 0 })
 }
 className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 <p className="text-xs text-gray-500 mt-1">Auto-calculated from income transactions, or edit manually</p>
 </div>

 {/* Additional Deductions */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Additional Deductions
 </label>
 <div className="flex items-center">
 <span className="text-gray-600 mr-2">{currency}</span>
 <input data-testid="tax-calculator-medical-education-charity-etc"
 type="number"
 step="0.01"
 value={formData.deductions}
 onChange={(e) =>
 setFormData({ ...formData, deductions: parseFloat(e.target.value) || 0 })
 }
 className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Medical, education, charity, etc."
 />
 </div>
 </div>

 {/* Calculate Button */}
 <button data-testid="tax-calculator-calculate-tax"
 onClick={handleCalculate}
 className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
 >
 Calculate Tax
 </button>

 {/* Results */}
 {taxResult && (
 <div className="mt-6 p-4 bg-blue-50 rounded-lg space-y-3">
 <h4 className="font-semibold text-gray-900">Tax Calculation Results</h4>
 <div className="space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-gray-600">Gross Income:</span>
 <span className="font-medium">
 {currency} {taxResult.grossIncome.toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600">Total Deductions:</span>
 <span className="font-medium">
 {currency} {taxResult.totalDeductions.toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between border-t pt-2">
 <span className="text-gray-600">Taxable Income:</span>
 <span className="font-medium">
 {currency} {taxResult.taxableIncome.toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between border-t pt-2">
 <span className="text-gray-600">Estimated Tax:</span>
 <span className="font-medium text-red-600">
 {currency} {taxResult.estimatedTax.toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600">Effective Tax Rate:</span>
 <span className="font-medium">{taxResult.effectiveRate}%</span>
 </div>
 <div className="flex justify-between bg-green-50 p-2 rounded border-t pt-2">
 <span className="text-gray-900 font-semibold">After-Tax Income:</span>
 <span className="font-bold text-green-600">
 {currency} {taxResult.afterTaxIncome.toFixed(2)}
 </span>
 </div>
 </div>
 </div>
 )}

 {/* Close Button */}
 <button data-testid="tax-calculator-close"
 onClick={onClose}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 );
};

