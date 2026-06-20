import React, { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CreditCard, AlertCircle, DollarSign, Calendar } from 'lucide-react';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

export const PayEMI: React.FC = () => {
 const { currency, setCurrentPage } = useApp();
 const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
 const [paymentAmount, setPaymentAmount] = useState<number>(0);
 const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
 const [notes, setNotes] = useState<string>('');
 const [isProcessing, setIsProcessing] = useState(false);

 // Fetch active EMI loans
 const loans = useLiveQuery(
 () => db.loans
 .where('type')
 .equals('emi')
 .and(loan => loan.status === 'active')
 .toArray(),
 []
 ) || [];

 const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
 const activeAccounts = accounts.filter(acc => acc.isActive);

 const selectedLoan = useMemo(
 () => loans.find(l => l.id === selectedLoanId),
 [loans, selectedLoanId]
 );

 const formatCurrency = (amount: number) => {
 return formatCurrencyAmount(amount, currency);
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 if (!selectedLoanId) {
 toast.error('Please select an EMI loan');
 return;
 }

 if (paymentAmount <= 0) {
 toast.error('Payment amount must be greater than 0');
 return;
 }

 if (!selectedLoan) {
 toast.error('Loan not found');
 return;
 }

 if (paymentAmount > selectedLoan.outstandingBalance) {
 toast.error(`Payment cannot exceed outstanding balance of ${formatCurrency(selectedLoan.outstandingBalance)}`);
 return;
 }

 try {
 setIsProcessing(true);

 // Get first active account as payment source
 const paymentAccount = activeAccounts[0];
 if (!paymentAccount) {
 toast.error('No active account found for payment');
 return;
 }

 // Check if there's enough balance
 if (paymentAccount.balance < paymentAmount) {
 toast.error('Insufficient balance in selected account');
 return;
 }

 // Create EMI payment transaction
 await db.loanPayments.add({
 loanId: selectedLoanId,
 amount: paymentAmount,
 accountId: paymentAccount.id as number,
 date: new Date(paymentDate),
 notes: notes || 'EMI Payment',
 });

 // Update loan outstanding balance
 const newBalance = selectedLoan.outstandingBalance - paymentAmount;
 await db.loans.update(selectedLoanId, {
 outstandingBalance: newBalance,
 status: newBalance <= 0 ? 'completed' : 'active',
 });

 await applyAccountBalanceDeltas(new Map([[paymentAccount.id as number, -paymentAmount]]));

 toast.success(`EMI payment of ${formatCurrency(paymentAmount)} recorded successfully`);
 
 // Reset form
 setSelectedLoanId(null);
 setPaymentAmount(0);
 setNotes('');
 
 // Navigate back after short delay
 setTimeout(() => setCurrentPage('dashboard'), 1500);
 } catch (error) {
 console.error('Error recording EMI payment:', error);
 toast.error('Failed to record EMI payment');
 } finally {
 setIsProcessing(false);
 }
 };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 <PageHeader
 title="Pay EMI"
 subtitle="Make scheduled EMI payments"
 icon={<CreditCard size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />

 {loans.length === 0 ? (
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
 <AlertCircle size={40} className="mx-auto text-blue-600 mb-3" />
 <p className="text-gray-600 mb-2">No active EMI loans found</p>
 <p className="text-sm text-gray-500">Create a loan or EMI in Loans section to pay here</p>
 </div>
 ) : (
 <form data-testid="pay-emi-form" onSubmit={handleSubmit} className="space-y-6">
 {/* Select EMI Loan */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Select EMI Loan <span className="text-red-500">*</span>
 </label>
 <select data-testid="pay-emi-select-loan"
 value={selectedLoanId || ''}
 onChange={(e) => setSelectedLoanId(Number(e.target.value) || null)}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 aria-label="Select loan"
 required
 >
 <option data-testid="pay-emi-choose-a-loan" value="">Choose a loan...</option>
 {loans.map(loan => (
 <option data-testid={`pay-emi-outstanding-${loan.id}`} key={loan.id} value={loan.id}>
 {loan.name} - Outstanding: {formatCurrency(loan.outstandingBalance)}
 </option>
 ))}
 </select>
 </div>

 {selectedLoan && (
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
 <div className="flex justify-between items-center">
 <span className="text-gray-600">Loan Name:</span>
 <span className="font-semibold text-gray-900">{selectedLoan.name}</span>
 </div>
 <div className="flex justify-between items-center">
 <span className="text-gray-600">Outstanding Balance:</span>
 <span className="font-semibold text-gray-900">{formatCurrency(selectedLoan.outstandingBalance)}</span>
 </div>
 {selectedLoan.emiAmount && (
 <div className="flex justify-between items-center">
 <span className="text-gray-600">EMI Amount:</span>
 <span className="font-semibold text-blue-600">{formatCurrency(selectedLoan.emiAmount)}</span>
 </div>
 )}
 {selectedLoan.dueDate && (
 <div className="flex justify-between items-center">
 <span className="text-gray-600">Due Date:</span>
 <span className="font-semibold text-gray-900">
 {new Date(selectedLoan.dueDate).toLocaleDateString()}
 </span>
 </div>
 )}
 </div>
 )}

 {/* Payment Amount */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 <DollarSign size={16} className="inline mr-2" />
 Payment Amount <span className="text-red-500">*</span>
 </label>
 <input data-testid="pay-emi-enter-amount"
 type="number"
 step="0.01"
 min="0"
 value={paymentAmount || ''}
 onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
 placeholder="Enter amount"
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 required
 />
 {selectedLoan && paymentAmount > selectedLoan.outstandingBalance && (
 <p className="text-red-600 text-sm mt-1">
 Amount exceeds outstanding balance
 </p>
 )}
 </div>

 {/* Payment Date */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 <Calendar size={16} className="inline mr-2" />
 Payment Date
 </label>
 <input data-testid="pay-emi-payment-date"
 type="date"
 value={paymentDate}
 onChange={(e) => setPaymentDate(e.target.value)}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 aria-label="Payment date"
 />
 </div>

 {/* Notes */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Notes (Optional)
 </label>
 <textarea data-testid="pay-emi-add-notes-about-this"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 placeholder="Add notes about this payment"
 rows={3}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
 />
 </div>

 {/* Submit Button */}
 <button data-testid="pay-emi-button"
 type="submit"
 disabled={isProcessing || !selectedLoanId}
 className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
 >
 {isProcessing ? (
 <>
 <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
 Processing...
 </>
 ) : (
 <>
 <CreditCard size={20} />
 Record EMI Payment
 </>
 )}
 </button>
 </form>
 )}
 </div>
 </CenteredLayout>
 );
};

