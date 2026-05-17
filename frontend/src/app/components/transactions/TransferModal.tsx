import React, { useState } from 'react';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ArrowRightLeft } from 'lucide-react';
import type { Account } from '@/lib/database';

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
 const [formData, setFormData] = useState({
 fromAccountId: 0,
 toAccountId: 0,
 amount: 0,
 description: '',
 transferType: 'self-transfer' as const,
 });

 const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
 const activeAccounts = accounts.filter((account) => account.isActive);

 const handleSubmit = async (e: React.FormEvent) => {
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

 // Create expense transaction in source account (outflow)
 await db.transactions.add({
 type: 'transfer',
 amount: formData.amount,
 accountId: formData.fromAccountId,
 category: 'Transfer',
 subcategory: 'Transfer Out',
 description: formData.description || `Transfer to ${toAccount.name}`,
 date: new Date(),
 transferToAccountId: formData.toAccountId,
 transferType: formData.transferType,
 updatedAt: new Date(),
 });

 // Create income transaction in destination account (inflow)
 await db.transactions.add({
 type: 'transfer',
 amount: formData.amount,
 accountId: formData.toAccountId,
 category: 'Transfer',
 subcategory: 'Transfer In',
 description: formData.description || `Transfer from ${fromAccount.name}`,
 date: new Date(),
 transferToAccountId: formData.fromAccountId,
 transferType: formData.transferType,
 updatedAt: new Date(),
 });

 // Update account balances
 await db.accounts.update(formData.fromAccountId, {
 balance: fromAccount.balance - formData.amount,
 updatedAt: new Date(),
 });

 await db.accounts.update(formData.toAccountId, {
 balance: toAccount.balance + formData.amount,
 updatedAt: new Date(),
 });

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
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
 <div className="bg-white rounded-xl p-6 w-full max-w-md">
 <div className="flex items-center gap-2 mb-4">
 <ArrowRightLeft className="text-blue-600" size={24} />
 <h3 className="text-xl font-bold">Transfer Money</h3>
 </div>

 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="bg-blue-50 p-3 rounded-lg mb-4">
 <p className="text-sm text-blue-700 font-medium"> Transfer Between Your Own Accounts</p>
 </div>

 {/* From Account */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 From Account
 </label>
 <select
 value={formData.fromAccountId}
 onChange={(e) =>
 setFormData({ ...formData, fromAccountId: parseInt(e.target.value) })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value={0}>Select source account</option>
 {activeAccounts.map((account: Account) => (
 <option key={account.id} value={account.id}>
 {account.name} ({currency} {account.balance.toFixed(2)})
 </option>
 ))}
 </select>
 </div>

 {/* To Account */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 To Account
 </label>
 <select
 value={formData.toAccountId}
 onChange={(e) =>
 setFormData({ ...formData, toAccountId: parseInt(e.target.value) })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value={0}>Select destination account</option>
 {activeAccounts
 .filter((acc: Account) => acc.id !== formData.fromAccountId)
 .map((account: Account) => (
 <option key={account.id} value={account.id}>
 {account.name} ({currency} {account.balance.toFixed(2)})
 </option>
 ))}
 </select>
 </div>

 {/* Amount */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Amount
 </label>
 <div className="flex items-center">
 <span className="text-gray-600 mr-2">{currency}</span>
 <input
 type="number"
 step="0.01"
 value={formData.amount}
 onChange={(e) =>
 setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
 }
 className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="0.00"
 required
 />
 </div>
 </div>

 {/* Description */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Description (Optional)
 </label>
 <input
 type="text"
 value={formData.description}
 onChange={(e) =>
 setFormData({ ...formData, description: e.target.value })
 }
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="e.g., Monthly transfer"
 />
 </div>

 {/* Buttons */}
 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
 >
 Transfer
 </button>
 </div>
 </form>
 </div>
 </div>
 );
};

