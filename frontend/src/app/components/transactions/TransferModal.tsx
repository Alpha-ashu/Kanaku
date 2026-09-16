import React, { useState } from 'react';
import { db } from '@/lib/database';
import { queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyTransactionAccountImpact } from '@/lib/transactionAggregation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ArrowRightLeft } from 'lucide-react';
import type { Account } from '@/lib/database';
import { useSubmitLock } from '@/hooks/useSubmitLock';

interface TransferModalProps {
 isOpen: boolean;
 onClose: () => void;
 currency: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({
 isOpen,
 onClose,
 currency,
}) => {
 const guardSubmit = useSubmitLock();
 const [formData, setFormData] = useState({
 fromAccountId: 0,
 toAccountId: 0,
 amount: 0,
 description: '',
 transferType: 'self-transfer' as const,
 });

 const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
 const activeAccounts = accounts.filter((account) => account.isActive);

 const handleSubmit = guardSubmit(async (e: React.FormEvent) => {
 e.preventDefault();

 if (!formData.fromAccountId || !formData.toAccountId) {
 toast.error('Please select both accounts');
 return;
 }

 if (formData.fromAccountId === formData.toAccountId) {
 toast.error('Cannot transfer to the same account');
 return;
 }

 if (formData.amount <= 0) {
 toast.error('Amount must be greater than 0');
 return;
 }

 try {
 // Get account details
 const fromAccount = await db.accounts.get(formData.fromAccountId);
 const toAccount = await db.accounts.get(formData.toAccountId);

 if (!fromAccount || !toAccount) {
 toast.error('Account not found');
 return;
 }

 // Check if from account has sufficient balance
 if (fromAccount.balance < formData.amount) {
 toast.error('Insufficient balance in source account');
 return;
 }

 const now = new Date();
 const transferTransaction = {
 type: 'transfer',
 amount: formData.amount,
 accountId: formData.fromAccountId,
 category: 'Transfer',
 subcategory: 'Transfer Out',
 description: formData.description || `Transfer to ${toAccount.name}`,
 date: now,
 transferToAccountId: formData.toAccountId,
 transferType: formData.transferType,
 createdAt: now,
 updatedAt: now,
 } as const;

 const transactionId = await db.transaction('rw', [db.transactions, db.accounts], async () => {
 const savedId = await db.transactions.add(transferTransaction);
 await applyTransactionAccountImpact(transferTransaction, now);
 return savedId;
 });
 queueRecordUpsertSync('transactions', Number(transactionId));
 queueRecordUpsertSync('accounts', formData.fromAccountId);
 queueRecordUpsertSync('accounts', formData.toAccountId);

 toast.success(` Transfer completed: ${currency} ${formData.amount.toFixed(2)} from ${fromAccount.name} to ${toAccount.name}`);
 setFormData({
 fromAccountId: 0,
 toAccountId: 0,
 amount: 0,
 description: '',
 transferType: 'self-transfer',
 });
 onClose();
 } catch (error) {
 console.error('Transfer failed:', error);
 toast.error(' Failed to transfer funds. Please try again.');
 }
 });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[28px] sm:rounded-[36px] border border-slate-100 p-6 sm:p-7 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <ArrowRightLeft size={20} />
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Transfer Money</h3>
        </div>

        <form data-testid="transfer-modal-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-purple-50/70 border border-purple-100/80 p-3 rounded-2xl">
            <p className="text-xs text-purple-700 font-semibold">Transfer Between Your Own Accounts</p>
          </div>

          {/* From Account */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              From Account
            </label>
            <select
              data-testid="transfer-modal-select"
              value={formData.fromAccountId}
              onChange={(e) =>
                setFormData({ ...formData, fromAccountId: parseInt(e.target.value) })
              }
              className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              required
            >
              <option data-testid="transfer-modal-select-source-account" value={0}>Select source account</option>
              {activeAccounts.map((account: Account) => (
                <option data-testid={`transfer-modal-option-${account.id}`} key={account.id} value={account.id}>
                  {account.name} ({currency} {account.balance.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* To Account */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              To Account
            </label>
            <select
              data-testid="transfer-modal-select-2"
              value={formData.toAccountId}
              onChange={(e) =>
                setFormData({ ...formData, toAccountId: parseInt(e.target.value) })
              }
              className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              required
            >
              <option data-testid="transfer-modal-select-destination-account" value={0}>Select destination account</option>
              {activeAccounts
                .filter((acc: Account) => acc.id !== formData.fromAccountId)
                .map((account: Account) => (
                  <option data-testid={`transfer-modal-option-2-${account.id}`} key={account.id} value={account.id}>
                    {account.name} ({currency} {account.balance.toFixed(2)})
                  </option>
                ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Amount
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-slate-400 font-bold text-xs sm:text-sm">{currency}</span>
              <input
                data-testid="transfer-modal-0-00"
                type="number"
                step="0.01"
                value={formData.amount || ''}
                onChange={(e) =>
                  setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                }
                className="w-full pl-12 pr-4 py-2.5 bg-slate-50/60 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Description (Optional)
            </label>
            <input
              data-testid="transfer-modal-e-g-monthly-transfer"
              type="text"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              placeholder="e.g., Monthly transfer"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-3">
            <button
              data-testid="transfer-modal-cancel"
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              data-testid="transfer-modal-transfer"
              type="submit"
              className="flex-1 h-10 px-4 rounded-full bg-[#18181B] hover:bg-black text-white font-bold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              Transfer
            </button>
          </div>
        </form>
      </div>
    </div>);
};
