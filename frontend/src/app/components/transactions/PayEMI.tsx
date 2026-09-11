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
 icon={<CreditCard size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />

      {loans.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-[28px] sm:rounded-[32px] p-8 text-center">
          <AlertCircle size={40} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-700 font-semibold mb-1">No active EMI loans found</p>
          <p className="text-sm text-slate-400">Create a loan or EMI in Loans section to pay here</p>
        </div>
      ) : (
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
          <form data-testid="pay-emi-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Select EMI Loan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Select EMI Loan <span className="text-red-500">*</span>
              </label>
              <select
                data-testid="pay-emi-select-loan"
                value={selectedLoanId || ''}
                onChange={(e) => setSelectedLoanId(Number(e.target.value) || null)}
                className="w-full px-4 py-3 border border-slate-200 bg-slate-50/50 rounded-2xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none"
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
              <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Loan Name:</span>
                  <span className="font-bold text-slate-900">{selectedLoan.name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Outstanding Balance:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(selectedLoan.outstandingBalance)}</span>
                </div>
                {selectedLoan.emiAmount && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">EMI Amount:</span>
                    <span className="font-bold text-indigo-600">{formatCurrency(selectedLoan.emiAmount)}</span>
                  </div>
                )}
                {selectedLoan.dueDate && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Due Date:</span>
                    <span className="font-bold text-slate-900">
                      {new Date(selectedLoan.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Payment Amount */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={14} className="text-slate-400" />
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <input
                data-testid="pay-emi-enter-amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 border border-slate-200 bg-slate-50/50 rounded-2xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none"
                required
              />
              {selectedLoan && paymentAmount > selectedLoan.outstandingBalance && (
                <p className="text-rose-600 text-xs font-semibold mt-1">
                  Amount exceeds outstanding balance
                </p>
              )}
            </div>

            {/* Payment Date */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" />
                Payment Date
              </label>
              <input
                data-testid="pay-emi-payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 bg-slate-50/50 rounded-2xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none"
                aria-label="Payment date"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Notes (Optional)
              </label>
              <textarea
                data-testid="pay-emi-add-notes-about-this"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this payment"
                rows={3}
                className="w-full px-4 py-3 border border-slate-200 bg-slate-50/50 rounded-2xl text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              data-testid="pay-emi-button"
              type="submit"
              disabled={isProcessing || !selectedLoanId}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-full transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  Record EMI Payment
                </>
              )}
            </button>
          </form>
        </div>
      )}
 </div>
 </CenteredLayout>
 );
};
