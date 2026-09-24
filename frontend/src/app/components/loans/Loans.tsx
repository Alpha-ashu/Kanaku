import React, { useState, useMemo } from 'react';
import { useApp, useSubFeature, useAICapability } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { getLoanStatusFromDueDate } from '@/lib/loanStatus';
import { recordLoanRepayment } from '@/services/loanRepaymentService';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, DollarSign, TrendingUp, AlertCircle, Edit2, Trash2, Home, Users, ScanLine, Paperclip, ChevronDown, ExternalLink, FileText, Check, X, ArrowLeft } from 'lucide-react';
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
import { useSubmitLock } from '@/hooks/useSubmitLock';

const isOpenLoan = (loan: { status?: string; outstandingBalance: number }) =>
 loan.outstandingBalance > 0 && loan.status !== 'completed';

const SEED_MOCK_LOANS = [
  {
    type: 'borrowed' as const,
    name: 'HDFC Home Loan (Flat 402)',
    principalAmount: 4500000,
    outstandingBalance: 3850000,
    interestRate: 8.5,
    emiAmount: 42500,
    tenureMonths: 240,
    bankName: 'HDFC Bank',
    loanCategory: 'Home Loan',
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2023-01-15'),
    status: 'active' as const,
    createdAt: new Date(),
  },
  {
    type: 'borrowed' as const,
    name: 'SBI Education Loan (Higher Studies)',
    principalAmount: 1500000,
    outstandingBalance: 920000,
    interestRate: 9.25,
    emiAmount: 18500,
    tenureMonths: 84,
    bankName: 'State Bank of India',
    loanCategory: 'Education Loan',
    dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2022-08-01'),
    status: 'active' as const,
    createdAt: new Date(),
  },
  {
    type: 'lent' as const,
    name: 'Personal Loan to Rahul Verma',
    principalAmount: 150000,
    outstandingBalance: 85000,
    interestRate: 0,
    emiAmount: 15000,
    contactPerson: 'Rahul Verma',
    contactPhone: '+91 98765 43210',
    loanCategory: 'Personal Friend Loan',
    dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2025-11-01'),
    status: 'overdue' as const,
    createdAt: new Date(),
  },
  {
    type: 'lent' as const,
    name: 'Business Support to Priya Sharma',
    principalAmount: 250000,
    outstandingBalance: 120000,
    interestRate: 6.0,
    emiAmount: 20000,
    contactPerson: 'Priya Sharma',
    contactPhone: '+91 91234 56789',
    loanCategory: 'Business Loan',
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2025-06-15'),
    status: 'active' as const,
    createdAt: new Date(),
  },
  {
    type: 'emi' as const,
    name: 'SBI Auto Loan (Hyundai Creta)',
    principalAmount: 1200000,
    outstandingBalance: 720000,
    interestRate: 8.9,
    emiAmount: 24800,
    tenureMonths: 60,
    bankName: 'State Bank of India',
    loanCategory: 'Car Loan',
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2024-03-10'),
    status: 'active' as const,
    createdAt: new Date(),
  },
  {
    type: 'emi' as const,
    name: 'ICICI No-Cost EMI (iPhone 16 Pro)',
    principalAmount: 135000,
    outstandingBalance: 45000,
    interestRate: 0,
    emiAmount: 15000,
    tenureMonths: 9,
    bankName: 'ICICI Bank',
    loanCategory: 'Consumer Electronics',
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    loanDate: new Date('2025-12-01'),
    status: 'active' as const,
    createdAt: new Date(),
  },
];


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
 const [activeCategory, setActiveCategory] = useState<'all' | 'borrowed' | 'lent' | 'emi'>('all');

  const populateMockLoans = async () => {
    try {
      const hasAuthToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('auth_token') || localStorage.getItem('user_id'));
      const alreadySeeded = typeof window !== 'undefined' && localStorage.getItem('has_seeded_sample_loans') === 'true';
      if (hasAuthToken || alreadySeeded) {
        return;
      }
      localStorage.setItem('has_seeded_sample_loans', 'true');
      const existing = await db.loans.toArray();
      if (existing.length === 0) {
        await db.loans.bulkAdd(SEED_MOCK_LOANS);
      }
    } catch (e) {
      console.error('Failed to seed loans:', e);
    }
  };

  React.useEffect(() => {
    if (loans && loans.length === 0) {
      void populateMockLoans();
    }
  }, [loans?.length]);


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
      totalBorrowed: borrowed.reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0),
      totalLent: lent.reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0),
      totalEMI: emis.reduce((sum, l) => sum + Number(l.emiAmount || 0), 0),
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
 
  <div className="flex items-center justify-between gap-3 w-full">
    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
      <button
        type="button"
        onClick={() => setCurrentPage('dashboard')}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
        aria-label="Go to dashboard"
        title="Go to dashboard"
        data-testid="loans-go-back-button"
      >
        <ArrowLeft size={18} className="text-slate-700" />
      </button>
      <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Loans & EMIs</h1>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {canAddLoan && (
        <Button
          onClick={() => {
            localStorage.setItem('quickFormType', 'expense');
            localStorage.setItem('quickExpenseMode', 'loan');
            localStorage.setItem('quickBackPage', 'loans');
            setCurrentPage('add-transaction');
          }}
          data-testid="loans-add-loan-button"
          className="shadow-xs bg-[#18181B] hover:bg-black text-white h-9 sm:h-10 px-3.5 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Loan</span>
          <span className="sm:hidden">Add</span>
        </Button>
      )}
    </div>
  </div>

  {/* Stats */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card data-testid="loans-card" variant="default" className="p-3.5 sm:p-5 bg-white border border-slate-100/80 rounded-[24px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-8 h-8 sm:w-11 sm:h-11 bg-rose-50 text-rose-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-2xs">
            <Home className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <p className="text-slate-400 font-bold mb-0.5 sm:mb-1 text-2xs sm:text-xs uppercase tracking-wider">Total Borrowed</p>
          <h3 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate">
            {formatCurrency(loanStats.totalBorrowed)}
          </h3>
        </div>
      </Card>
    </motion.div>

    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Card data-testid="loans-card-2" variant="default" className="p-3.5 sm:p-5 bg-white border border-slate-100/80 rounded-[24px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-8 h-8 sm:w-11 sm:h-11 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-2xs">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <p className="text-slate-400 font-bold mb-0.5 sm:mb-1 text-2xs sm:text-xs uppercase tracking-wider">Total Lent</p>
          <h3 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate">
            {formatCurrency(loanStats.totalLent)}
          </h3>
        </div>
      </Card>
    </motion.div>

    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card data-testid="loans-card-3" variant="default" className="p-3.5 sm:p-5 bg-white border border-slate-100/80 rounded-[24px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-8 h-8 sm:w-11 sm:h-11 bg-purple-50 text-purple-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-2xs">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <p className="text-slate-400 font-bold mb-0.5 sm:mb-1 text-2xs sm:text-xs uppercase tracking-wider">Monthly EMI</p>
          <h3 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate">
            {formatCurrency(loanStats.totalEMI)}
          </h3>
        </div>
      </Card>
    </motion.div>

    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <Card data-testid="loans-card-4" variant="default" className="p-3.5 sm:p-5 bg-white border border-slate-100/80 rounded-[24px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-8 h-8 sm:w-11 sm:h-11 bg-amber-50 text-amber-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-2xs">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <p className="text-slate-400 font-bold mb-0.5 sm:mb-1 text-2xs sm:text-xs uppercase tracking-wider">Overdue</p>
          <h3 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate">
            {loanStats.overdueCount}
          </h3>
        </div>
      </Card>
    </motion.div>
  </div>

  {loanStats.overdueCount > 0 && (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card data-testid="loans-card-5" variant="default" className="p-4 sm:p-5 flex items-start gap-3 bg-rose-50/70 border border-rose-200/60 rounded-[24px]">
        <AlertCircle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-display font-bold text-rose-900">Overdue Payments</p>
          <p className="text-sm text-rose-700 mt-0.5">
            You have {loanStats.overdueCount} overdue payment{loanStats.overdueCount > 1 ? 's' : ''}. Please make payments to avoid penalties.
          </p>
        </div>
      </Card>
    </motion.div>
  )}

  {/* Category Filter Tabs */}
  <div className="flex items-center gap-1.5 p-1 bg-white/95 rounded-full border border-slate-200/80 shadow-xs w-fit max-w-full overflow-x-auto">
    {([
      { id: 'all', label: 'All Loans', count: loans.filter(l => isOpenLoan(l)).length },
      { id: 'borrowed', label: 'Borrowed', count: loans.filter(l => l.type === 'borrowed' && isOpenLoan(l)).length },
      { id: 'lent', label: 'Lent', count: loans.filter(l => l.type === 'lent' && isOpenLoan(l)).length },
      { id: 'emi', label: 'EMI', count: loans.filter(l => l.type === 'emi' && isOpenLoan(l)).length },
    ] as const).map(tab => (
      <button
        key={tab.id}
        onClick={() => setActiveCategory(tab.id)}
        className={cn(
          "px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
          activeCategory === tab.id
            ? "bg-[#18181B] text-white shadow-xs"
            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
        )}
      >
        <span>{tab.label}</span>
        <span className={cn(
          "text-2xs px-1.5 py-0.2 rounded-full font-black",
          activeCategory === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
        )}>
          {tab.count}
        </span>
      </button>
    ))}
  </div>

  {/* Loans Grid */}
  <div className={cn(
    "grid gap-6",
    activeCategory === 'all' ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
  )}>
    {(activeCategory === 'all' ? ['borrowed', 'lent', 'emi'] : [activeCategory]).map((type, idx) => (
      <motion.div key={type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
        <Card data-testid={`loans-card-6-${type}`} variant="default" className="p-5 sm:p-6 bg-white border border-slate-100/80 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                type === 'borrowed' ? "bg-rose-500" : type === 'lent' ? "bg-emerald-500" : "bg-purple-500"
              )} />
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight capitalize">
                {type === 'emi' ? 'EMI Loans' : `${type} Loans`}
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100/80 px-2.5 py-0.5 rounded-full">
              {loans.filter(l => l.type === type && isOpenLoan(l)).length} active
            </span>
          </div>

          <div className="space-y-3.5">
            {loans
              .filter(l => l.type === type && isOpenLoan(l))
              .map(loan => {
                const effectiveStatus = getEffectiveLoanStatus(loan);
                const repaid = Math.max(0, loan.principalAmount - loan.outstandingBalance);
                const progressPct = Math.min(100, Math.max(0, (repaid / (loan.principalAmount || 1)) * 100));

                return (
                  <motion.div key={loan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50/70 rounded-[24px] border border-slate-100/90 p-4 sm:p-5 hover:border-slate-200 hover:shadow-xs transition-all">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm tracking-tight truncate">{loan.name}</h4>
                        {loan.contactPerson && (
                          <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">{loan.contactPerson}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canAddLoan && (
                          <button
                            onClick={() => handleEditClick(loan)}
                            data-testid={`loans-edit-button-${loan.id}`}
                            className="w-7 h-7 rounded-full hover:bg-slate-200/60 transition-colors text-slate-400 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                            title="Edit loan"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteLoan(loan.id!, loan.name)}
                            data-testid={`loans-delete-button-${loan.id}`}
                            className="w-7 h-7 rounded-full hover:bg-rose-50 transition-colors text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                            title="Delete loan"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <span className={cn("px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide rounded-full", getLoanStatusColor(loan))}>
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
                          className="w-full px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        <input
                          type="number"
                          value={editFormData.principalAmount}
                          onChange={(e) => setEditFormData({ ...editFormData, principalAmount: parseFloat(e.target.value) })}
                          placeholder="Principal amount"
                          aria-label="Principal amount"
                          data-testid="loans-edit-principal-input"
                          className="w-full px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        <input
                          type="number"
                          value={editFormData.outstandingBalance}
                          onChange={(e) => setEditFormData({ ...editFormData, outstandingBalance: parseFloat(e.target.value) })}
                          placeholder="Outstanding balance"
                          aria-label="Outstanding balance"
                          data-testid="loans-edit-outstanding-input"
                          className="w-full px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        {editFormData.emiAmount !== undefined && (
                          <input
                            type="number"
                            value={editFormData.emiAmount}
                            onChange={(e) => setEditFormData({ ...editFormData, emiAmount: parseFloat(e.target.value) })}
                            placeholder="EMI amount"
                            aria-label="EMI amount"
                            data-testid="loans-edit-emi-input"
                            className="w-full px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                          />
                        )}
                        <input
                          type="date"
                          value={editFormData.dueDate ? new Date(editFormData.dueDate).toISOString().split('T')[0] : ''}
                          onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
                          aria-label="Due date"
                          title="Due date"
                          data-testid="loans-edit-due-date-input"
                          className="w-full px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleSaveEdit}
                            data-testid="loans-edit-save-button"
                            className="flex-1 h-8 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold transition-all cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLoanId(null)}
                            data-testid="loans-edit-cancel-button"
                            className="flex-1 h-8 bg-white border border-slate-200/80 text-slate-700 rounded-full text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-3 grid grid-cols-2 gap-2.5 mb-3 shadow-2xs">
                          <div>
                            <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Principal</p>
                            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatCurrency(loan.principalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Outstanding</p>
                            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatCurrency(loan.outstandingBalance)}</p>
                          </div>
                          {loan.emiAmount && (
                            <div>
                              <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider">EMI Amount</p>
                              <p className="font-bold text-slate-900 text-sm mt-0.5">{formatCurrency(loan.emiAmount)}</p>
                            </div>
                          )}
                          {loan.dueDate && (
                            <div>
                              <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Due Date</p>
                              <p className="font-bold text-slate-900 text-sm mt-0.5">
                                {new Date(loan.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Continuous Gradient Progress Track */}
                        <div className="mb-3 space-y-1.5" role="progressbar" aria-label="Loan repayment progress" aria-valuenow={repaid} aria-valuemin={0} aria-valuemax={loan.principalAmount}>
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-400 uppercase tracking-wider">Repaid {progressPct.toFixed(0)}%</span>
                            <span className="text-slate-700">{formatCurrency(repaid)} of {formatCurrency(loan.principalAmount)}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden relative">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 transition-all duration-500 ease-out"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="mb-3 rounded-2xl border border-slate-200/70 bg-white/80 px-3.5 py-2.5 shadow-2xs">
                          <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Payment Info</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                            <span>
                              Last paid: {loan.id && latestPaymentByLoan.get(loan.id)
                                ? formatShortDate(latestPaymentByLoan.get(loan.id))
                                : 'No payment yet'}
                            </span>
                            {loan.id && completionDateByLoan.get(loan.id) && (
                              <span className="font-bold text-emerald-700">
                                Completed on: {formatShortDate(completionDateByLoan.get(loan.id))}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPaymentModal(loan.id!)}
                            data-testid={`loans-make-payment-button-${loan.id}`}
                            className="flex-1 h-9 sm:h-10 bg-[#18181B] hover:bg-black text-white rounded-full transition-all text-xs font-bold active:scale-95 shadow-xs flex items-center justify-center cursor-pointer"
                          >
                            Make Payment
                          </button>
                          {loanPayments.some(p => p.loanId === loan.id && p.documentId) && (
                            <button
                              onClick={() => handleViewBill(loan.id!)}
                              data-testid={`loans-view-bill-button-${loan.id}`}
                              className="h-9 sm:h-10 px-4 bg-white border border-slate-200/80 text-slate-700 rounded-full hover:bg-slate-50 transition-all text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
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
              <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/80">
                <p className="text-slate-400 font-semibold text-xs">No active {type} loans</p>
              </div>
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
 <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-2xs font-black uppercase rounded-lg">Settled</span>
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
 <p className="text-2xs font-bold text-gray-400 uppercase">Paid: {formatCurrency(loan.principalAmount)}</p>
 {loanPayments.some(p => p.loanId === loan.id && p.documentId) && (
 <button data-testid={`loans-view-bill-${loan.id}`}
 onClick={() => handleViewBill(loan.id!)}
 className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all text-2xs font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm"
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
 <p className="text-2xs font-black text-gray-900 uppercase tracking-tight">
 {new Date(p.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
 </p>
 <p className="text-2xs font-bold text-gray-400 uppercase">{formatCurrency(p.amount)}</p>
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
 const guardSubmit = useSubmitLock();
 const [amount, setAmount] = useState(0);
 const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
 const [notes, setNotes] = useState('');
 const [showScanner, setShowScanner] = useState(false);
 const [scannerMode, setScannerMode] = useState<'scan' | 'attachment' | null>(null);
 const [documentId, setDocumentId] = useState<number | null>(null);
 const isOcrEnabled = useAICapability('ocrEngine', 'loanOCR');

 const handleSubmit = guardSubmit(async (e: React.FormEvent) => {
 e.preventDefault();

 const loan = await db.loans.get(loanId);
 if (!loan) return;

 const account = accounts.find(a => a.id === accountId);
 if (!account) {
 toast.error('Select an account for this payment');
 return;
 }

 // One path for every repayment (see services/loanRepaymentService).
 // This used to write the payment row, recompute the loan balance AND set
 // account.balance directly — none of it reaching the server, and the last of
 // those fighting the derived balance engine, which already counts the
 // repayment row. The service posts to the server, which owns the loan's
 // outstanding balance, and keeps the row as the account's cash movement.
 try {
 const result = await recordLoanRepayment({
 loan,
 account,
 amount,
 notes,
 documentId: documentId || undefined,
 });
 toast.success(result.pending
 ? 'Payment recorded. It will sync when you are back online.'
 : 'Payment recorded successfully');
 onClose();
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Could not record the payment');
 }
 });

 return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[28px] sm:rounded-[36px] shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 sm:p-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
              Make Payment
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 transition-colors flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
              title="Close modal"
            >
              <X size={16} />
            </button>
          </div>
          
          <form data-testid="loans-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="loan-payment-amount" className="block text-2xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Amount</label>
              <div className="relative">
                <input
                  id="loan-payment-amount"
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  data-testid="loans-payment-amount-input"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-black text-slate-900 text-lg"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="loan-payment-account" className="block text-2xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Pay From</label>
              <select
                id="loan-payment-account"
                value={accountId}
                onChange={(e) => setAccountId(parseInt(e.target.value))}
                data-testid="loans-payment-account-select"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-bold text-slate-900 text-sm"
              >
                {accounts.map(acc => (
                  <option data-testid={`loans-option-${acc.id}`} key={acc.id} value={acc.id}>
                    {acc.name} ({acc.balance})
                  </option>
                ))}
              </select>
            </div>

            <div>
              {/* Receipt Section */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100/90 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-black text-slate-400 uppercase tracking-widest">Receipt / Bill</label>
                  {documentId && (
                    <span className="flex items-center gap-1 text-2xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-wide">
                      <Check size={10} strokeWidth={3} /> Attached
                    </span>
                  )}
                </div>

                {documentId ? (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <Paperclip size={16} className="text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-2xs font-black text-emerald-700 uppercase">Bill Attached</p>
                      <p className="text-2xs font-semibold text-emerald-500">Document saved successfully</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocumentId(null)}
                      data-testid="loans-payment-remove-bill-button"
                      className="p-1.5 text-emerald-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="Remove attachment"
                    >
                      <X size={13} strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => { setScannerMode('scan'); setShowScanner(true); }}
                      data-testid="loans-payment-scan-button"
                      disabled={!isOcrEnabled}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3.5 rounded-2xl active:scale-[0.97] transition-all",
                        isOcrEnabled 
                          ? "bg-[#18181B] text-white hover:bg-black shadow-xs cursor-pointer" 
                          : "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center",
                        isOcrEnabled ? "bg-white/10" : "bg-slate-200"
                      )}>
                        <ScanLine size={16} />
                      </div>
                      <div className="text-center">
                        <p className="text-2xs font-black uppercase tracking-wide leading-none">Scan Bill</p>
                        <p className={cn("text-2xs font-semibold mt-0.5 leading-none", isOcrEnabled ? "text-white/50" : "text-slate-400/60")}>OCR auto-fill</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setScannerMode('attachment'); setShowScanner(true); }}
                      data-testid="loans-payment-attach-button"
                      className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-50 active:scale-[0.97] transition-all border border-slate-200/80 shadow-2xs cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Paperclip size={16} className="text-slate-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-2xs font-black uppercase tracking-wide leading-none">Attach File</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="loan-payment-notes" className="block text-2xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
              <textarea
                id="loan-payment-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="loans-payment-notes-textarea"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium text-slate-900 text-sm min-h-[72px]"
                placeholder="Added payment details..."
              />
            </div>

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                data-testid="loans-payment-cancel-button"
                className="flex-1 h-11 bg-white border border-slate-200/80 text-slate-700 rounded-full font-bold text-xs hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="loans-payment-submit-button"
                className="flex-1 h-11 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
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

