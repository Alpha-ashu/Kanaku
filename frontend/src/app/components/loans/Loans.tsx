import React, { useState, useMemo } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, DollarSign, TrendingUp, AlertCircle, Edit2, Trash2, Home, Users, ScanLine, Paperclip, ChevronDown, ExternalLink, FileText, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';

const isOpenLoan = (loan: { status?: string; outstandingBalance: number }) =>
 loan.outstandingBalance > 0 && loan.status !== 'completed';

const getLoanStatusFromDueDate = (dueDate?: Date | string, outstandingBalance?: number) => {
 if ((outstandingBalance ?? 0) <= 0) return 'completed' as const;
 if (!dueDate) return 'active' as const;

 const date = new Date(dueDate);
 const today = new Date();
 const dueKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
 const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

 return dueKey < todayKey ? 'overdue' as const : 'active' as const;
};

const getEffectiveLoanStatus = (loan: { dueDate?: Date | string; outstandingBalance: number }) =>
 getLoanStatusFromDueDate(loan.dueDate, loan.outstandingBalance);

export const Loans: React.FC = () => {
 const { loans, currency, accounts, setCurrentPage } = useApp();
 const canBorrow = useSubFeature('loans', 'borrowMoney');
 const canLend = useSubFeature('loans', 'lendMoney');
 const canDelete = useSubFeature('loans', 'loanSettlement');
 const canAddLoan = canBorrow || canLend;
 const loanPayments = useLiveQuery(() => db.loanPayments.toArray(), []) || [];
 const [showPaymentModal, setShowPaymentModal] = useState<number | null>(null);
 const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
 const [editFormData, setEditFormData] = useState<any>({});
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [loanToDelete, setLoanToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [showBillListForLoan, setShowBillListForLoan] = useState<number | null>(null);

 const handleViewBill = async (loanId: number) => {
 const paymentsWithBills = loanPayments.filter(p => p.loanId === loanId && p.documentId);
 if (paymentsWithBills.length === 0) {
 toast.error('No bills found for this loan');
 return;
 }
 
 if (paymentsWithBills.length === 1) {
 const doc = await db.documents.get(paymentsWithBills[0].documentId!);
 if (doc?.fileData) {
 const url = URL.createObjectURL(doc.fileData);
 window.open(url, '_blank');
 } else {
 toast.error('Bill file not found');
 }
 } else {
 setShowBillListForLoan(loanId);
 }
 };

 const openBill = async (docId: number) => {
 const doc = await db.documents.get(docId);
 if (doc?.fileData) {
 const url = URL.createObjectURL(doc.fileData);
 window.open(url, '_blank');
 } else {
 toast.error('Bill file not found');
 }
 };

 const loanStats = useMemo(() => {
 const borrowed = loans.filter(l => l.type === 'borrowed' && isOpenLoan(l));
 const lent = loans.filter(l => l.type === 'lent' && isOpenLoan(l));
 const emis = loans.filter(l => l.type === 'emi' && isOpenLoan(l));

 return {
 totalBorrowed: borrowed.reduce((sum, l) => sum + l.outstandingBalance, 0),
 totalLent: lent.reduce((sum, l) => sum + l.outstandingBalance, 0),
 totalEMI: emis.reduce((sum, l) => sum + (l.emiAmount || 0), 0),
 overdueCount: loans.filter(l => isOpenLoan(l) && getLoanStatusFromDueDate(l.dueDate, l.outstandingBalance) === 'overdue').length,
 };
 }, [loans]);

 const formatCurrency = (amount: number) => {
  return formatCurrencyAmount(amount, currency);
 };

 const formatShortDate = (value?: Date | string) => {
 if (!value) return '';
 const parsed = new Date(value);
 if (Number.isNaN(parsed.getTime())) return '';
 return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
 };

 const latestPaymentByLoan = useMemo(() => {
 const map = new Map<number, Date>();
 loanPayments.forEach((payment) => {
 if (!payment.loanId || !payment.date) return;
 const paymentDate = new Date(payment.date);
 if (Number.isNaN(paymentDate.getTime())) return;
 const existing = map.get(payment.loanId);
 if (!existing || paymentDate > existing) {
 map.set(payment.loanId, paymentDate);
 }
 });
 return map;
 }, [loanPayments]);

 const completionDateByLoan = useMemo(() => {
 const map = new Map<number, Date>();
 loans.forEach((loan) => {
 if (!loan.id) return;
 if (getEffectiveLoanStatus(loan) !== 'completed') return;
 const lastPayment = latestPaymentByLoan.get(loan.id);
 if (lastPayment) map.set(loan.id, lastPayment);
 });
 return map;
 }, [loans, latestPaymentByLoan]);

 const getLoanStatusColor = (loan: any) => {
 const status = getEffectiveLoanStatus(loan);
 if (status === 'completed') return 'bg-green-100 text-green-700';
 if (status === 'overdue') return 'bg-red-100 text-red-700';
 return 'bg-black/10 text-gray-900';
 };

 const handleEditClick = (loan: any) => {
 setEditingLoanId(loan.id);
 setEditFormData({ ...loan });
 };

 const handleSaveEdit = async () => {
 if (!editingLoanId) return;
 try {
 const nextStatus = getLoanStatusFromDueDate(editFormData.dueDate, editFormData.outstandingBalance);
 await db.loans.update(editingLoanId, {
 name: editFormData.name,
 principalAmount: editFormData.principalAmount,
 outstandingBalance: editFormData.outstandingBalance,
 interestRate: editFormData.interestRate,
 emiAmount: editFormData.emiAmount,
 dueDate: editFormData.dueDate ? new Date(editFormData.dueDate) : undefined,
 status: nextStatus,
 });
 setEditingLoanId(null);
 toast.success('Loan updated successfully');
 } catch (error) {
 console.error('Failed to update loan:', error);
 toast.error('Failed to update loan');
 }
 };

 const handleDeleteLoan = (loanId: number, loanName: string) => {
 setLoanToDelete({ id: loanId, name: loanName });
 setDeleteModalOpen(true);
 };

 const confirmDeleteLoan = async () => {
 if (!loanToDelete) return;
 setIsDeleting(true);
 try {
 await db.loans.delete(loanToDelete.id);
 toast.success('Loan deleted successfully');
 setDeleteModalOpen(false);
 setLoanToDelete(null);
 } catch (error) {
 console.error('Failed to delete loan:', error);
 toast.error('Failed to delete loan');
 } finally {
 setIsDeleting(false);
 }
 };

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Loans & EMIs</h1>
 </div>
 {canAddLoan && (
 <Button
 onClick={() => {
 localStorage.setItem('quickFormType', 'expense');
 localStorage.setItem('quickExpenseMode', 'loan');
 localStorage.setItem('quickBackPage', 'loans');
 setCurrentPage('add-loan');
 }}
 data-testid="loans-add-loan-button"
 className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-6 rounded-2xl font-bold flex items-center gap-2"
 >
 <Plus size={18} />
 <span>Add Loan</span>
 </Button>
 )}
 </div>

 {/* Stats */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
 <Card data-testid="loans-card" variant="glass" className="p-4 sm:p-6 relative overflow-hidden group border-none bg-white shadow-xl shadow-slate-200/50">
 <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all duration-500" />
 <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-rose-500/5 rounded-full blur-xl" />
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-600 rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-lg shadow-red-200">
 <Home className="text-white sm:w-5 sm:h-5" size={18} />
 </div>
 <p className="text-slate-400 font-black mb-1 text-[10px] uppercase tracking-[0.2em]">Total Borrowed</p>
 <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
 {formatCurrency(loanStats.totalBorrowed)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
 <Card data-testid="loans-card-2" variant="glass" className="p-6 relative overflow-hidden group border-none bg-white shadow-xl shadow-slate-200/50">
 <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500" />
 <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-green-500/5 rounded-full blur-xl" />
 <div className="relative z-10">
 <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
 <Users className="text-white" size={20} />
 </div>
 <p className="text-slate-400 font-black mb-1 text-[10px] uppercase tracking-[0.2em]">Total Lent</p>
 <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
 {formatCurrency(loanStats.totalLent)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
 <Card data-testid="loans-card-3" variant="glass" className="p-6 relative overflow-hidden group border-none bg-white shadow-xl shadow-slate-200/50">
 <div className="absolute -top-12 -right-12 w-32 h-32 bg-slate-500/10 rounded-full blur-2xl group-hover:bg-slate-500/20 transition-all duration-500" />
 <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-slate-500/5 rounded-full blur-xl" />
 <div className="relative z-10">
 <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-slate-200">
 <TrendingUp className="text-white" size={20} />
 </div>
 <p className="text-slate-400 font-black mb-1 text-[10px] uppercase tracking-[0.2em]">Monthly EMI</p>
 <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
 {formatCurrency(loanStats.totalEMI)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
 <Card data-testid="loans-card-4" variant="mesh-red" className="p-6 relative overflow-hidden group border-none shadow-xl shadow-red-200/40">
 <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
 <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-xl" />
 <div className="relative z-10">
 <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-white/10">
 <AlertCircle className="text-white" size={20} />
 </div>
 <p className="text-white/80 font-black mb-1 text-[10px] uppercase tracking-[0.2em]">Overdue</p>
 <h3 className="text-3xl font-black text-white tracking-tighter">
 {loanStats.overdueCount}
 </h3>
 </div>
 </Card>
 </motion.div>
 </div>

 {loanStats.overdueCount > 0 && (
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
 <Card data-testid="loans-card-5" variant="glass" className="p-4 flex items-start gap-3 border-2 border-red-200">
 <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={20} />
 <div>
 <p className="font-display font-bold text-red-900">Overdue Payments</p>
 <p className="text-sm text-red-700 mt-1">
 You have {loanStats.overdueCount} overdue payment{loanStats.overdueCount > 1 ? 's' : ''}. Please make payments to avoid penalties.
 </p>
 </div>
 </Card>
 </motion.div>
 )}

 {/* Loans Grid */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {['borrowed', 'lent', 'emi'].map((type, idx) => (
 <motion.div key={type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
 <Card data-testid={`loans-card-6-${type}`} variant="glass" className="p-6">
 <h3 className="text-xl font-display font-bold text-gray-900 mb-4 capitalize">{type === 'emi' ? 'EMI Loans' : `${type} Loans`}</h3>
 <div className="space-y-3">
 {loans
 .filter(l => l.type === type && isOpenLoan(l))
 .map(loan => {
 const effectiveStatus = getEffectiveLoanStatus(loan);
 return (
 <motion.div key={loan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
 <div className="flex items-start justify-between mb-3">
 <div className="flex-1">
 <h4 className="font-display font-bold text-gray-900 text-sm">{loan.name}</h4>
 {loan.contactPerson && (
 <p className="text-xs text-gray-500 mt-1">{loan.contactPerson}</p>
 )}
 </div>
 <div className="flex items-center gap-2">
 {canAddLoan && (
 <button
 onClick={() => handleEditClick(loan)}
 data-testid={`loans-edit-button-${loan.id}`}
 className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
 title="Edit loan"
 >
 <Edit2 size={14} />
 </button>
 )}
 {canDelete && (
 <button
 onClick={() => handleDeleteLoan(loan.id!, loan.name)}
 data-testid={`loans-delete-button-${loan.id}`}
 className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-600"
 title="Delete loan"
 >
 <Trash2 size={14} />
 </button>
 )}
 <span className={cn("px-2 py-0.5 text-xs font-bold rounded-full", getLoanStatusColor(loan))}>
 {effectiveStatus}
 </span>
 </div>
 </div>
 
 {editingLoanId === loan.id ? (
 <div className="space-y-2 mb-3">
 <input
 type="text"
 value={editFormData.name}
 onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
 placeholder="Loan name"
 aria-label="Loan name"
 data-testid="loans-edit-name-input"
 className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <input
 type="number"
 value={editFormData.principalAmount}
 onChange={(e) => setEditFormData({ ...editFormData, principalAmount: parseFloat(e.target.value) })}
 placeholder="Principal amount"
 aria-label="Principal amount"
 data-testid="loans-edit-principal-input"
 className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <input
 type="number"
 value={editFormData.outstandingBalance}
 onChange={(e) => setEditFormData({ ...editFormData, outstandingBalance: parseFloat(e.target.value) })}
 placeholder="Outstanding balance"
 aria-label="Outstanding balance"
 data-testid="loans-edit-outstanding-input"
 className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 {editFormData.emiAmount !== undefined && (
 <input
 type="number"
 value={editFormData.emiAmount}
 onChange={(e) => setEditFormData({ ...editFormData, emiAmount: parseFloat(e.target.value) })}
 placeholder="EMI amount"
 aria-label="EMI amount"
 data-testid="loans-edit-emi-input"
 className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 )}
 <input
 type="date"
 value={editFormData.dueDate ? new Date(editFormData.dueDate).toISOString().split('T')[0] : ''}
 onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
 aria-label="Due date"
 title="Due date"
 data-testid="loans-edit-due-date-input"
 className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <div className="flex gap-2">
 <button
 onClick={handleSaveEdit}
 data-testid="loans-edit-save-button"
 className="flex-1 px-2 py-1 bg-black text-white rounded-lg text-xs font-bold hover:bg-gray-900"
 >
 Save
 </button>
 <button
 onClick={() => setEditingLoanId(null)}
 data-testid="loans-edit-cancel-button"
 className="flex-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200"
 >
 Cancel
 </button>
 </div>
 </div>
 ) : (
 <>
 <div className="grid grid-cols-2 gap-3 mb-3">
 <div>
 <p className="text-xs text-gray-500 font-medium">Principal</p>
 <p className="font-display font-bold text-gray-900 text-sm">{formatCurrency(loan.principalAmount)}</p>
 </div>
 <div>
 <p className="text-xs text-gray-500 font-medium">Outstanding</p>
 <p className="font-display font-bold text-gray-900 text-sm">{formatCurrency(loan.outstandingBalance)}</p>
 </div>
 {loan.emiAmount && (
 <div>
 <p className="text-xs text-gray-500 font-medium">EMI Amount</p>
 <p className="font-display font-bold text-gray-900 text-sm">{formatCurrency(loan.emiAmount)}</p>
 </div>
 )}
 {loan.dueDate && (
 <div>
 <p className="text-xs text-gray-500 font-medium">Due Date</p>
 <p className="font-display font-bold text-gray-900 text-sm">
 {new Date(loan.dueDate).toLocaleDateString()}
 </p>
 </div>
 )}
 </div>

 <progress
 className="w-full h-2 mb-3 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-black"
 value={Math.max(0, loan.principalAmount - loan.outstandingBalance)}
 max={Math.max(1, loan.principalAmount)}
 aria-label="Loan repayment progress"
 />

 <div className="mb-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
 <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Payment Info</p>
 <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
 <span>
 Last paid: {loan.id && latestPaymentByLoan.get(loan.id)
 ? formatShortDate(latestPaymentByLoan.get(loan.id))
 : 'No payment yet'}
 </span>
 {loan.id && completionDateByLoan.get(loan.id) && (
 <span className="font-semibold text-green-700">
 Completed on: {formatShortDate(completionDateByLoan.get(loan.id))}
 </span>
 )}
 </div>
 </div>

 <div className="flex gap-2">
 <button
 onClick={() => setShowPaymentModal(loan.id!)}
 data-testid={`loans-make-payment-button-${loan.id}`}
 className="flex-1 px-4 py-2.5 bg-black text-white rounded-xl hover:bg-gray-900 transition-all text-xs font-black uppercase tracking-widest shadow-sm active:scale-95"
 >
 Make Payment
 </button>
 {loanPayments.some(p => p.loanId === loan.id && p.documentId) && (
 <button
 onClick={() => handleViewBill(loan.id!)}
 data-testid={`loans-view-bill-button-${loan.id}`}
 className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-xs font-black uppercase tracking-widest shadow-sm flex items-center gap-2"
 title="View Bills"
 >
 <FileText size={14} />
 View Bill
 </button>
 )}
 </div>
 </>
 )}
 </motion.div>
 );
 })}
 {loans.filter(l => l.type === type && isOpenLoan(l)).length === 0 && (
 <p className="text-gray-500 text-center py-8 text-sm">No open {type} loans</p>
 )}
 </div>
 </Card>
 </motion.div>
 ))}
 </div>
 {/* Completed History Section */}
 {loans.some(l => !isOpenLoan(l)) && (
 <div className="space-y-6 pt-10 border-t border-gray-100">
 <div className="flex items-center justify-between px-2">
 <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Completed History</h2>
 </div>
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {['borrowed', 'lent', 'emi'].map((type) => {
 const completedLoans = loans.filter(l => l.type === type && !isOpenLoan(l));
 if (completedLoans.length === 0) return null;
 return (
 <div key={type} className="space-y-4">
 <div className="flex items-center gap-2 px-2">
 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
 <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">{type === 'emi' ? 'EMI' : type}</h3>
 </div>
 <div className="space-y-3">
 {completedLoans.map(loan => (
 <div key={loan.id} className="bg-white/50 border border-gray-100 rounded-xl p-4 shadow-sm grayscale hover:grayscale-0 transition-all">
 <div className="flex items-start justify-between mb-3">
 <div className="flex-1">
 <h4 className="font-display font-bold text-gray-500 text-sm line-through decoration-gray-300">{loan.name}</h4>
 <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded-lg">Settled</span>
 </div>
 {canDelete && (
 <button data-testid={`loans-delete-record-${loan.id}`}
 onClick={() => handleDeleteLoan(loan.id!, loan.name)}
 className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-300 hover:text-red-600"
 title="Delete record"
 >
 <Trash2 size={14} />
 </button>
 )}
 </div>
 <div className="flex items-center justify-between mt-auto">
 <p className="text-[10px] font-bold text-gray-400 uppercase">Paid: {formatCurrency(loan.principalAmount)}</p>
 {loanPayments.some(p => p.loanId === loan.id && p.documentId) && (
 <button data-testid={`loans-view-bill-${loan.id}`}
 onClick={() => handleViewBill(loan.id!)}
 className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm"
 >
 <FileText size={12} />
 View Bill
 </button>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {showBillListForLoan && (
 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
 <div className="p-6">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Payment Bills</h3>
 <button data-testid="loans-button" onClick={() => setShowBillListForLoan(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
 </div>
 <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
 {loanPayments
 .filter(p => p.loanId === showBillListForLoan && p.documentId)
 .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
 .map(p => (
 <button data-testid={`loans-button-2-${p.id}`}
 key={p.id}
 onClick={() => openBill(p.documentId!)}
 className="w-full flex items-center justify-between p-3 bg-white hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-gray-200 group text-left"
 >
 <div>
 <p className="text-[10px] font-black text-gray-900 uppercase tracking-tight">
 {new Date(p.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
 </p>
 <p className="text-[9px] font-bold text-gray-400 uppercase">{formatCurrency(p.amount)}</p>
 </div>
 <ExternalLink size={14} className="text-gray-300 group-hover:text-indigo-600 transition-colors" />
 </button>
 ))}
 </div>
 </div>
 </div>
 </div>
 )}

 {showPaymentModal && (
 <PaymentModal
 loanId={showPaymentModal}
 accounts={accounts}
 onClose={() => setShowPaymentModal(null)}
 />
 )}

 <DeleteConfirmModal
 isOpen={deleteModalOpen}
 title="Delete Loan"
 message="This loan record will be permanently deleted. All payment history will be lost."
 itemName={loanToDelete?.name}
 isLoading={isDeleting}
 onConfirm={confirmDeleteLoan}
 onCancel={() => {
 setDeleteModalOpen(false);
 setLoanToDelete(null);
 }}
 />
 </div>
 </CenteredLayout>
 );
};

interface PaymentModalProps {
 loanId: number;
 accounts: any[];
 onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ loanId, accounts, onClose }) => {
 const [amount, setAmount] = useState(0);
 const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
 const [notes, setNotes] = useState('');
 const [showScanner, setShowScanner] = useState(false);
 const [scannerMode, setScannerMode] = useState<'scan' | 'attachment' | null>(null);
 const [documentId, setDocumentId] = useState<number | null>(null);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 const loan = await db.loans.get(loanId);
 if (!loan) return;

 await db.loanPayments.add({
 loanId,
 amount,
 accountId,
 date: new Date(),
 notes,
 documentId: documentId || undefined
 });

 const newOutstanding = Math.max(0, loan.outstandingBalance - amount);
 await db.loans.update(loanId, {
 outstandingBalance: newOutstanding,
 status: getLoanStatusFromDueDate(loan.dueDate, newOutstanding),
 });

 const account = accounts.find(a => a.id === accountId);
 if (account) {
 const nextBalance = loan.type === 'lent'
 ? account.balance + amount
 : account.balance - amount;
 await db.accounts.update(accountId, {
 balance: nextBalance,
 });
 }

 toast.success('Payment recorded successfully');
 onClose();
 };

 return (
 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
 <div className="p-6">
 <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
 <DollarSign className="text-indigo-600" size={24} />
 Make Payment
 </h3>
 
 <form data-testid="loans-form" onSubmit={handleSubmit} className="space-y-5">
 <div>
 <label htmlFor="loan-payment-amount" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Amount</label>
 <div className="relative">
 <input
 id="loan-payment-amount"
 type="number"
 step="0.01"
 value={amount || ''}
 onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
 data-testid="loans-payment-amount-input"
 className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all font-bold text-gray-900"
 placeholder="0.00"
 required
 />
 </div>
 </div>

 <div>
 <label htmlFor="loan-payment-account" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Pay From</label>
 <select
 id="loan-payment-account"
 value={accountId}
 onChange={(e) => setAccountId(parseInt(e.target.value))}
 data-testid="loans-payment-account-select"
 className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all font-bold text-gray-900 text-sm"
 >
 {accounts.map(acc => (
 <option data-testid={`loans-option-${acc.id}`} key={acc.id} value={acc.id}>{acc.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receipt / Bill</label>
 {documentId ? (
 <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
 <div className="flex items-center gap-2 text-emerald-700">
 <Check size={16} strokeWidth={3} />
 <span className="text-xs font-bold">Bill Attached</span>
 </div>
 <button 
 type="button" 
 onClick={() => setDocumentId(null)}
 data-testid="loans-payment-remove-bill-button"
 className="p-1 text-emerald-400 hover:text-rose-500 transition-colors"
 >
 <X size={14} strokeWidth={3} />
 </button>
 </div>
 ) : (
 <div className="grid grid-cols-2 gap-3">
 <button
 type="button"
 onClick={() => { setScannerMode('scan'); setShowScanner(true); }}
 data-testid="loans-payment-scan-button"
 className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-gray-100 hover:bg-gray-100 transition-all group"
 >
 <ScanLine size={18} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
 <span className="text-[10px] font-black uppercase text-gray-500">Scan Bill</span>
 </button>
 <button
 type="button"
 onClick={() => { setScannerMode('attachment'); setShowScanner(true); }}
 data-testid="loans-payment-attach-button"
 className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-gray-100 hover:bg-gray-100 transition-all group"
 >
 <Paperclip size={18} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
 <span className="text-[10px] font-black uppercase text-gray-500">Attach File</span>
 </button>
 </div>
 )}
 </div>

 <div>
 <label htmlFor="loan-payment-notes" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
 <textarea
 id="loan-payment-notes"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 data-testid="loans-payment-notes-textarea"
 className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all font-bold text-gray-900 text-sm min-h-[80px]"
 placeholder="Added payment details..."
 />
 </div>

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 data-testid="loans-payment-cancel-button"
 className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
 >
 Cancel
 </button>
 <button
 type="submit"
 data-testid="loans-payment-submit-button"
 className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
 >
 Record Payment
 </button>
 </div>
 </form>
 </div>
 </div>

 {showScanner && (
 <ReceiptScanner
 isOpen={showScanner}
 onClose={() => { setShowScanner(false); setScannerMode(null); }}
 onApplyScan={(scan) => {
 if (scan.amount) setAmount(scan.amount);
 if (scan.scanDocumentId) setDocumentId(scan.scanDocumentId);
 setShowScanner(false);
 }}
 onAttachmentSaved={(docId) => {
 setDocumentId(docId);
 setShowScanner(false);
 }}
 initialMode={scannerMode || undefined}
 />
 )}
 </div>
 );
};

