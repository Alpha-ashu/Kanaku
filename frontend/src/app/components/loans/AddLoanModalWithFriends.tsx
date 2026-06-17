import React, { useState } from 'react';
import { backendService } from '@/lib/backend-api';
import { useApp } from '@/contexts/AppContext';
import { ModalWrapper } from '@/app/components/ui/ModalWrapper';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

interface AddLoanModalWithFriendsProps {
 onClose: () => void;
}

export const AddLoanModalWithFriends: React.FC<AddLoanModalWithFriendsProps> = ({ onClose }) => {
 const { friends, refreshData } = useApp();
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

 const handleAddFriend = async () => {
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
 };

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

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 const { friendId, ...loanData } = formData;
 try {
 await backendService.createLoan({
 ...loanData,
 friendId: String(friendId),
 outstandingBalance: formData.principalAmount,
 status: 'active',
 dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
 createdAt: new Date(),
 });
 toast.success('Loan added successfully');
 refreshData();
 onClose();
 } catch (error) {
 toast.error('Failed to add loan');
 }
 };

 return (
 <ModalWrapper
 title="Add Loan"
 subtitle="Track borrowed, lent, or EMI loans"
 onClose={onClose}
 maxWidth="max-w-md"
 >
 <form onSubmit={handleSubmit} className="space-y-5">
 {/* Loan Type */}
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">Loan Type</label>
 <div className="grid grid-cols-3 gap-2">
 {[
 { value: 'borrowed', label: 'Borrowed', emoji: '' },
 { value: 'lent', label: 'Lent', emoji: '' },
 { value: 'emi', label: 'EMI', emoji: '' },
 ].map((option) => (
 <button
 key={option.value}
 type="button"
 onClick={() => setFormData({ ...formData, type: option.value as any })}
 data-testid={`loan-modal-type-${option.value}-button`}
 className={`p-3 rounded-xl border-2 transition-all ${
 formData.type === option.value
 ? 'border-blue-600 bg-blue-50 text-blue-700'
 : 'border-gray-200 hover:border-gray-300'
 }`}
 >
 <div className="text-2xl mb-1">{option.emoji}</div>
 <div className="text-xs font-medium">{option.label}</div>
 </button>
 ))}
 </div>
 </div>

 {/* Loan Name */}
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">Loan Name</label>
 <input
 type="text"
 value={formData.name}
 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
 data-testid="loan-modal-name-input"
 className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="e.g., Car Loan, Personal Loan"
 required
 />
 </div>

 {/* Principal Amount */}
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">Principal Amount</label>
 <div className="relative">
 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
 <input
 type="number"
 step="0.01"
 value={formData.principalAmount || ''}
 onChange={(e) => setFormData({ ...formData, principalAmount: parseFloat(e.target.value) || 0 })}
 data-testid="loan-modal-amount-input"
 className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="0.00"
 required
 />
 </div>
 </div>

 {/* Friend Selection */}
 {(formData.type === 'borrowed' || formData.type === 'lent') && (
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="block text-sm font-semibold text-gray-700">
 <Users className="w-4 h-4 inline mr-1" />
 Select Friend
 </label>
 <button
 type="button"
 onClick={() => setShowAddFriend(!showAddFriend)}
 data-testid="loan-modal-add-friend-toggle"
 className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
 >
 <UserPlus size={14} />
 Add New
 </button>
 </div>

 {showAddFriend ? (
 <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
 <input
 type="text"
 value={newFriend.name}
 onChange={(e) => setNewFriend({ ...newFriend, name: e.target.value })}
 data-testid="loan-modal-new-friend-name-input"
 className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Friend's name *"
 />
 <div className="grid grid-cols-2 gap-2">
 <input
 type="email"
 value={newFriend.email}
 onChange={(e) => setNewFriend({ ...newFriend, email: e.target.value })}
 data-testid="loan-modal-new-friend-email-input"
 className="px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Email"
 />
 <input
 type="tel"
 value={newFriend.phone}
 onChange={(e) => setNewFriend({ ...newFriend, phone: e.target.value })}
 data-testid="loan-modal-new-friend-phone-input"
 className="px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Phone"
 />
 </div>
 <div className="flex gap-2">
 <button
 type="button"
 onClick={handleAddFriend}
 data-testid="loan-modal-save-friend-button"
 className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
 >
 Save Friend
 </button>
 <button
 type="button"
 onClick={() => setShowAddFriend(false)}
 data-testid="loan-modal-cancel-friend-button"
 className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
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
 <label className="block text-sm font-semibold text-gray-700 mb-2">
 Contact Person / Institution
 </label>
 <input
 type="text"
 value={formData.contactPerson}
 onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
 data-testid="loan-modal-contact-input"
 className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="Bank, Person, or Institution"
 aria-label="Contact Person or Institution"
 title="Contact Person or Institution"
 />
 </div>
 )}

 {/* Interest & EMI */}
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">Interest Rate (%)</label>
 <input
 type="number"
 step="0.01"
 value={formData.interestRate || ''}
 onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
 data-testid="loan-modal-rate-input"
 className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="0.00"
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">EMI Amount</label>
 <input
 type="number"
 step="0.01"
 value={formData.emiAmount || ''}
 onChange={(e) => setFormData({ ...formData, emiAmount: parseFloat(e.target.value) || 0 })}
 data-testid="loan-modal-emi-input"
 className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="0.00"
 />
 </div>
 </div>

 {/* Due Date */}
 <div>
 <label className="block text-sm font-semibold text-gray-700 mb-2">Due Date</label>
 <input
 type="date"
 value={formData.dueDate}
 onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
 data-testid="loan-modal-due-date-input"
 className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
 placeholder="Due Date"
 aria-label="Due Date"
 title="Due Date"
 />
 </div>

 {/* Action Buttons */}
 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 data-testid="loan-modal-cancel-button"
 className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
 >
 Cancel
 </button>
 <button
 type="submit"
 data-testid="loan-modal-submit-button"
 className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-lg shadow-blue-500/30"
 >
 Add Loan
 </button>
 </div>
 </form>
 </ModalWrapper>
 );
};
