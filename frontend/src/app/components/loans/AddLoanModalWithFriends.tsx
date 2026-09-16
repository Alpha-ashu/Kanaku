import React, { useState } from 'react';
import { backendService } from '@/lib/backend-api';
import { useApp } from '@/contexts/AppContext';
import { ModalWrapper } from '@/app/components/ui/ModalWrapper';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/hooks/useSubmitLock';

interface AddLoanModalWithFriendsProps {
 onClose: () => void;
}

export const AddLoanModalWithFriends: React.FC<AddLoanModalWithFriendsProps> = ({ onClose }) => {
  const guardSubmit = useSubmitLock();
  const { friends, accounts, refreshData } = useApp();
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [formData, setFormData] = useState({
    type: 'borrowed' as 'borrowed' | 'lent' | 'emi',
    name: '',
    principalAmount: 0,
    interestRate: 0,
    emiAmount: 0,
    dueDate: '',
    frequency: 'monthly' as 'monthly' | 'weekly' | 'custom',
    contactPerson: '',
    friendId: undefined as number | undefined,
    accountId: undefined as string | undefined,
  });

 const [newFriend, setNewFriend] = useState({
 name: '',
 email: '',
 phone: '',
 notes: '',
 });
 const friendOptions = friends
 .filter((friend) => friend.id)
 .map((friend) => ({
 value: String(friend.id),
 label: friend.name,
 description: [friend.email, friend.phone].filter(Boolean).join(' | ') || 'Saved friend',
 group: 'Friends',
 }));

 const handleAddFriend = guardSubmit(async () => {
 if (!newFriend.name.trim()) {
 toast.error('Please enter friend name');
 return;
 }

 try {
 // Save friend to backend
 const savedFriend = await backendService.createFriend({
 ...newFriend,
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 setFormData({ ...formData, friendId: savedFriend.id, contactPerson: newFriend.name });
 setNewFriend({ name: '', email: '', phone: '', notes: '' });
 setShowAddFriend(false);
 refreshData();
 toast.success('Friend added successfully');
 } catch (error) {
 toast.error('Failed to add friend');
 }
 });

 const handleFriendSelect = (friendId: number) => {
 const friend = friends.find(f => f.id === friendId);
 if (friend) {
 setFormData({
 ...formData,
 friendId,
 contactPerson: friend.name,
 });
 }
 };

  const handleSubmit = guardSubmit(async (e: React.FormEvent) => {
    e.preventDefault();

    const { friendId, ...loanData } = formData;
    if (formData.accountId && formData.type === 'lent') {
      const selectedAcc = accounts.find(a => (a.cloudId || String(a.id)) === formData.accountId);
      if (selectedAcc && Number(selectedAcc.balance) < formData.principalAmount) {
        toast.error('Selected account does not have sufficient balance');
        return;
      }
    }

    try {
      await backendService.createLoan({
        ...loanData,
        friendId: friendId ? String(friendId) : undefined,
        outstandingBalance: formData.principalAmount,
        status: 'active',
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        createdAt: new Date(),
        accountId: formData.accountId,
      });
      toast.success('Loan added successfully');
      refreshData();
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add loan');
    }
  });

 return (
 <ModalWrapper
 title="Add Loan"
 subtitle="Track borrowed, lent, or EMI loans"
 onClose={onClose}
 maxWidth="max-w-md"
 >
  <form data-testid="add-loan-modal-with-form" onSubmit={handleSubmit} className="space-y-4">
    {/* Loan Type */}
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Loan Type</label>
      <div className="grid grid-cols-3 gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
        {[
          { value: 'borrowed', label: 'Borrowed' },
          { value: 'lent', label: 'Lent' },
          { value: 'emi', label: 'EMI' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFormData({ ...formData, type: option.value as any })}
            data-testid={`loan-modal-type-${option.value}-button`}
            className={cn(
              "py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center",
              formData.type === option.value
                ? "bg-[#18181B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    {/* Loan Name */}
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Loan Name</label>
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        data-testid="loan-modal-name-input"
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
        placeholder="e.g., Home Loan, Personal Loan"
        required
      />
    </div>

    {/* Principal Amount */}
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Principal Amount</label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
        <input
          type="number"
          step="0.01"
          value={formData.principalAmount || ''}
          onChange={(e) => setFormData({ ...formData, principalAmount: parseFloat(e.target.value) || 0 })}
          data-testid="loan-modal-amount-input"
          className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          placeholder="0.00"
          required
        />
      </div>
    </div>

    {/* Linked Cash Account (Optional) */}
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          {formData.type === 'borrowed' ? 'Deposit Principal Into' : formData.type === 'lent' ? 'Disburse From Account' : 'Linked Account (Optional)'}
        </label>
        <span className="text-xs text-slate-400 font-semibold">Optional</span>
      </div>
      <select
        value={formData.accountId || ''}
        onChange={(e) => setFormData({ ...formData, accountId: e.target.value || undefined })}
        data-testid="loan-modal-account-select"
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
      >
        <option value="">None (Obligation only, no cash movement)</option>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.cloudId || String(acc.id)}>
            {acc.name} (₹{Number(acc.balance).toFixed(0)})
          </option>
        ))}
      </select>
    </div>

    {/* Friend Selection */}
    {(formData.type === 'borrowed' || formData.type === 'lent') && (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" />
            Select Friend
          </label>
          <button
            type="button"
            onClick={() => setShowAddFriend(!showAddFriend)}
            data-testid="loan-modal-add-friend-toggle"
            className="text-xs text-purple-600 hover:text-purple-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <UserPlus size={13} />
            Add New
          </button>
        </div>

        {showAddFriend ? (
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <input
              type="text"
              value={newFriend.name}
              onChange={(e) => setNewFriend({ ...newFriend, name: e.target.value })}
              data-testid="loan-modal-new-friend-name-input"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              placeholder="Friend's name *"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email"
                value={newFriend.email}
                onChange={(e) => setNewFriend({ ...newFriend, email: e.target.value })}
                data-testid="loan-modal-new-friend-email-input"
                className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                placeholder="Email"
              />
              <input
                type="tel"
                value={newFriend.phone}
                onChange={(e) => setNewFriend({ ...newFriend, phone: e.target.value })}
                data-testid="loan-modal-new-friend-phone-input"
                className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                placeholder="Phone"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddFriend}
                data-testid="loan-modal-save-friend-button"
                className="flex-1 h-9 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold transition-all cursor-pointer"
              >
                Save Friend
              </button>
              <button
                type="button"
                onClick={() => setShowAddFriend(false)}
                data-testid="loan-modal-cancel-friend-button"
                className="px-4 h-9 bg-white border border-slate-200 rounded-full text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <SearchableDropdown
            options={friendOptions}
            value={formData.friendId ? String(formData.friendId) : ''}
            onChange={(friendId) => handleFriendSelect(parseInt(friendId, 10))}
            placeholder="Select a friend (optional)"
            searchPlaceholder="Search friends..."
            grouped
            testId="loan-modal-friend-dropdown"
          />
        )}
      </div>
    )}

    {/* Contact Person (for EMI or if no friend selected) */}
    {(formData.type === 'emi' || !formData.friendId) && (
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Contact Person / Institution
        </label>
        <input
          type="text"
          value={formData.contactPerson}
          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
          data-testid="loan-modal-contact-input"
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          placeholder="Bank, Person, or Institution"
          aria-label="Contact Person or Institution"
          title="Contact Person or Institution"
        />
      </div>
    )}

    {/* Interest & EMI */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Interest Rate (%)</label>
        <input
          type="number"
          step="0.01"
          value={formData.interestRate || ''}
          onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
          data-testid="loan-modal-rate-input"
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">EMI Amount</label>
        <input
          type="number"
          step="0.01"
          value={formData.emiAmount || ''}
          onChange={(e) => setFormData({ ...formData, emiAmount: parseFloat(e.target.value) || 0 })}
          data-testid="loan-modal-emi-input"
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          placeholder="0.00"
        />
      </div>
    </div>

    {/* Due Date */}
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Due Date</label>
      <input
        type="date"
        value={formData.dueDate}
        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
        data-testid="loan-modal-due-date-input"
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
        placeholder="Due Date"
        aria-label="Due Date"
        title="Due Date"
      />
    </div>

    {/* Action Buttons */}
    <div className="flex gap-3 pt-3">
      <button
        type="button"
        onClick={onClose}
        data-testid="loan-modal-cancel-button"
        className="flex-1 h-11 bg-white border border-slate-200/80 text-slate-700 rounded-full font-bold text-xs hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="submit"
        data-testid="loan-modal-submit-button"
        className="flex-1 h-11 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
      >
        Add Loan
      </button>
    </div>
  </form>
 </ModalWrapper>
 );
};
