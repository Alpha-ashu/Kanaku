import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { queueTransactionDeleteSync } from '@/lib/auth-sync-integration';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { getCategoryCartoonIcon, getCategoryColor } from '@/app/components/ui/CartoonCategoryIcons';
import { Plus, Users, Trash2, Edit2, Check, X, CalendarDays } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { readVoiceDraft, VOICE_GROUP_DRAFT_KEY, type VoiceGroupDraft } from '@/lib/voiceDrafts';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';

const avatarToneClasses = [
 'bg-rose-100 text-rose-700',
 'bg-sky-100 text-sky-700',
 'bg-amber-100 text-amber-700',
 'bg-emerald-100 text-emerald-700',
 'bg-violet-100 text-violet-700',
 'bg-orange-100 text-orange-700',
];

const getToneClass = (seed: string) => {
 const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
 return avatarToneClasses[sum % avatarToneClasses.length];
};

const formatDateLabel = (value: Date) =>
 new Intl.DateTimeFormat('en-IN', {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 }).format(new Date(value));

const formatDisplayName = (value: string) =>
 value
 .trim()
 .split(/\s+/)
 .filter(Boolean)
 .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
 .join(' ');

export const Groups: React.FC = () => {
 const { groupExpenses, friends, currency, setCurrentPage } = useApp();
 const canCreate = useSubFeature('groups', 'createGroup');
 const canEdit = useSubFeature('groups', 'editGroup');
 const canAddMember = useSubFeature('groups', 'addMember');
 const canSettle = useSubFeature('groups', 'settleExpense');
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [groupToDelete, setGroupToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
 const [editedName, setEditedName] = useState('');
 const [isSaving, setIsSaving] = useState(false);

 useEffect(() => {
 const pendingDraft = readVoiceDraft<VoiceGroupDraft>(VOICE_GROUP_DRAFT_KEY);
 if (pendingDraft?.amount) {
 toast.info('Opening your group expense draft.');
 openGroupExpenseForm();
 }

 // Silently repair any stale member rows (created before the email-stripping
 // bug was fixed) — sets email/friendId and triggers overdue invite emails.
 backendService.repairAllGroupMembers().catch(() => {});
 }, []);

 const sortedExpenses = useMemo(
 () => [...groupExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
 [groupExpenses],
 );
 const savedFriends = useMemo(
 () => [...friends].sort((a, b) => a.name.localeCompare(b.name)),
 [friends],
 );
 const friendAvatarById = useMemo(
 () => new Map(savedFriends.map((friend) => [friend.id, friend.avatar])),
 [savedFriends],
 );

 const formatCurrency = (amount: number) =>
    formatCurrencyAmount(amount, currency);

 const openGroupExpenseForm = () => {
 localStorage.setItem('quickFormType', 'expense');
 localStorage.setItem('quickExpenseMode', 'group');
 localStorage.setItem('quickBackPage', 'groups');
 setCurrentPage('add-transaction');
 };

 const openFriendProfile = async (friend: { id?: number; cloudId?: string; name?: string }) => {
 if (!friend.cloudId) {
 // This friend was created while the backend call failed, so it never got
 // synced (no cloudId). Retry pushing it now instead of just giving up —
 // most of the time this fixes itself transparently on the first click.
 if (!friend.id) {
 toast.error('This friend could not be found locally.');
 return;
 }
 try {
 const { cloudId } = await backendService.retrySyncFriend(friend.id);
 localStorage.setItem('viewingFriendId', cloudId);
 setCurrentPage('friend-profile');
 } catch (err: any) {
 toast.error(err?.response?.data?.error || err?.message || `Couldn't sync ${friend.name || 'this friend'}. Check their email/phone and try again.`);
 }
 return;
 }
 localStorage.setItem('viewingFriendId', friend.cloudId);
 setCurrentPage('friend-profile');
 };

 const handleDeleteGroup = (groupId: number, groupName: string) => {
 setGroupToDelete({ id: groupId, name: groupName });
 setDeleteModalOpen(true);
 };

 const confirmDeleteGroup = async () => {
 if (!groupToDelete) return;
 setIsDeleting(true);
 try {
 const group = groupExpenses.find((expense) => expense.id === groupToDelete.id);
 if (!group) throw new Error('Group expense not found');

 await db.transaction('rw', db.groupExpenses, db.transactions, db.accounts, async () => {
 await db.groupExpenses.delete(groupToDelete.id);

 if (group.expenseTransactionId) {
 const linkedTransaction = await db.transactions.get(group.expenseTransactionId);

 if (linkedTransaction) {
 const linkedAccount = await db.accounts.get(linkedTransaction.accountId);
 if (linkedAccount) {
 const restoredBalance = linkedTransaction.type === 'expense'
 ? linkedAccount.balance + linkedTransaction.amount
 : linkedAccount.balance - linkedTransaction.amount;
 await db.accounts.update(linkedAccount.id!, {
 balance: restoredBalance,
 updatedAt: new Date(),
 });
 }

 await db.transactions.delete(linkedTransaction.id!);
 }
 }
 });

 if (group.expenseTransactionId) {
 queueTransactionDeleteSync(group.expenseTransactionId);
 }

 toast.success('Group expense deleted successfully');
 setDeleteModalOpen(false);
 setGroupToDelete(null);
 } catch (error) {
 console.error('Failed to delete group expense:', error);
 toast.error('Failed to delete group expense');
 } finally {
 setIsDeleting(false);
 }
 };

 const handleEditClick = (groupId: number, groupName: string) => {
 setEditingGroupId(groupId);
 setEditedName(groupName);
 };

 const handleSaveEdit = async (groupId: number) => {
 if (!editedName.trim()) {
 toast.error('Group name cannot be empty');
 return;
 }
 setIsSaving(true);
 try {
 const group = groupExpenses.find((expense) => expense.id === groupId);
 await db.groupExpenses.update(groupId, { name: editedName.trim(), updatedAt: new Date() });
 if (group?.expenseTransactionId) {
 const linkedTransaction = await db.transactions.get(group.expenseTransactionId);
 if (linkedTransaction) {
 const transactionUpdates: {
 groupName: string;
 updatedAt: Date;
 description?: string;
 } = {
 groupName: editedName.trim(),
 updatedAt: new Date(),
 };
 if (!linkedTransaction.description || linkedTransaction.description === group.name) {
 transactionUpdates.description = editedName.trim();
 }
 await db.transactions.update(group.expenseTransactionId, transactionUpdates);
 }
 }
 toast.success('Group name updated successfully');
 setEditingGroupId(null);
 } catch (error) {
 console.error('Failed to update group:', error);
 toast.error('Failed to update group name');
 } finally {
 setIsSaving(false);
 }
 };

 const handleToggleMemberPayment = async (groupId: number, memberIndex: number, paid: boolean) => {
 try {
 const group = groupExpenses.find((expense) => expense.id === groupId);
 if (!group) return;

 const updatedMembers = [...group.members];
 const targetMember = updatedMembers[memberIndex];
 const nextPaidState = !paid;

 updatedMembers[memberIndex] = {
 ...targetMember,
 paid: nextPaidState,
 paidAmount: nextPaidState ? targetMember.share : 0,
 paymentStatus: nextPaidState ? 'paid' : 'pending',
 };

 const hasPendingFriends = updatedMembers.some(
 (member) => !member.isCurrentUser && member.share > 0 && !(member.paymentStatus === 'paid' || member.paid),
 );

 await db.groupExpenses.update(groupId, {
 members: updatedMembers,
 status: hasPendingFriends ? 'pending' : 'settled',
 updatedAt: new Date(),
 });
 toast.success(`Member marked as ${nextPaidState ? 'paid' : 'pending'}`);
 } catch (error) {
 console.error('Failed to update member payment:', error);
 toast.error('Failed to update member status');
 }
 };

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Group Expenses</h1>
 </div>
  <div className="flex gap-3">
  {canAddMember && (
  <Button data-testid="groups-button"
  variant="secondary"
  onClick={() => setCurrentPage('add-friends')}
  className="shadow-sm border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 h-12 px-5 rounded-2xl font-bold flex items-center gap-2"
  >
  <Plus size={18} />
  <span>Friend</span>
  </Button>
  )}
  {canCreate && (
  <Button data-testid="groups-button-2"
  onClick={openGroupExpenseForm}
  className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-5 rounded-2xl font-bold flex items-center gap-2"
  >
  <Plus size={18} />
  <span>Expense</span>
  </Button>
  )}
  </div>
 </div>

 <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="text-base font-semibold text-gray-900">Friends</p>
 <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
 {savedFriends.length > 0 ? (
 <>
 <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-100 px-2 text-xs font-bold text-sky-700">
 {savedFriends.length}
 </span>
 <span>Ready for your next split</span>
 </>
 ) : (
 <span>Add friends first to start splitting bills</span>
 )}
 </div>
 </div>
 <Button
 data-testid="groups-manage-friends-button"
 onClick={() => setCurrentPage('friends')}
 className="shadow-sm bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs sm:text-sm h-9 px-3"
 >
 Manage Friends
 </Button>
 </div>

 {savedFriends.length > 0 ? (
 <div className="mt-4 overflow-hidden rounded-[24px] border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-white p-4">
 <div className="-mx-1 -my-1 flex gap-3 overflow-x-auto overflow-y-visible px-1 py-1">
 {savedFriends.map((friend) => (
 <button data-testid={`groups-view-${friend.id}`}
 key={friend.id}
 type="button"
 onClick={() => openFriendProfile(friend)}
 className="flex w-[82px] shrink-0 flex-col items-center text-center transition-transform hover:-translate-y-0.5"
 title={`View ${formatDisplayName(friend.name)}`}
 aria-label={`View ${formatDisplayName(friend.name)}`}
 >
 <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-sky-200 bg-white p-0.5 shadow-sm transition-colors hover:border-sky-300">
 <Avatar className="h-full w-full rounded-full">
 <AvatarImage src={friend.avatar} alt={friend.name} className="object-cover" />
 <AvatarFallback className={`${getToneClass(friend.name)} text-sm font-bold`}>
 {friend.name.charAt(0).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 </div>
 <p className="mt-2 w-full truncate text-sm font-semibold text-gray-800">
 {formatDisplayName(friend.name)}
 </p>
 </button>
 ))}
 </div>
 </div>
 ) : (
 <div className="mt-4 rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center">
 <p className="text-sm text-gray-500">No saved friends yet.</p>
 </div>
 )}
 </section>

 <div className="space-y-4">
 {sortedExpenses.map((expense) => {
 const allMembersWithIndex = expense.members.map((member, index) => ({ ...member, originalIndex: index }));
 const friendMembers = allMembersWithIndex.filter((member) => !member.isCurrentUser);
 const avatarMembers = allMembersWithIndex.slice(0, 4);
 const extraMembers = Math.max(allMembersWithIndex.length - avatarMembers.length, 0);
 const yourShare = expense.yourShare ?? allMembersWithIndex.find((member) => member.isCurrentUser)?.share ?? 0;
 const pendingCollection = friendMembers
 .filter((member) => !(member.paymentStatus === 'paid' || member.paid))
 .reduce((sum, member) => sum + member.share, 0);
 const groupStatus = expense.status
 ?? (friendMembers.some((member) => !(member.paymentStatus === 'paid' || member.paid) && member.share > 0) ? 'pending' : 'settled');
 const coverColor = getCategoryColor(expense.category || 'Miscellaneous');

 return (
 <div
 key={expense.id}
 className="rounded-[30px] border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
 >
 <div className="flex gap-4">
 <div
 ref={el => { if (el) el.style.backgroundColor = coverColor || ''; }}
 className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[26px] shadow-sm"
 >
 <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-black/60" />
 <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_60%)]" />
 <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/90 shadow-sm backdrop-blur">
 {getCategoryCartoonIcon(expense.category || 'Miscellaneous', 34)}
 </div>
 </div>

 <div className="min-w-0 flex-1">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 {editingGroupId === expense.id ? (
 <div className="flex items-center gap-2">
 <input data-testid={`groups-expense-name-${expense.id}`}
 type="text"
 value={editedName}
 onChange={(e) => setEditedName(e.target.value)}
 className="min-w-0 flex-1 rounded-2xl border border-gray-300 px-3 py-2 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
 placeholder="Enter expense name"
 aria-label="Expense name"
 />
 <button data-testid={`groups-save-${expense.id}`}
 onClick={() => handleSaveEdit(expense.id!)}
 disabled={isSaving}
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-600 transition-colors hover:bg-green-100"
 title="Save"
 >
 <Check size={18} />
 </button>
 <button data-testid={`groups-cancel-${expense.id}`}
 onClick={() => setEditingGroupId(null)}
 disabled={isSaving}
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
 title="Cancel"
 >
 <X size={18} />
 </button>
 </div>
 ) : (
 <>
 <h3 className="truncate text-2xl font-bold tracking-tight text-gray-900">{expense.name}</h3>
 <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
 <CalendarDays size={14} className="shrink-0" />
 <span>{formatDateLabel(expense.date)}</span>
 </div>
 </>
 )}
 </div>

 {editingGroupId !== expense.id && (
  <div className="flex shrink-0 gap-1.5">
  {canEdit && (
  <button data-testid={`groups-edit-group-name-${expense.id}`}
  onClick={() => handleEditClick(expense.id!, expense.name)}
  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
  title="Edit group name"
  >
  <Edit2 size={16} />
  </button>
  )}
  {canSettle && (
  <button data-testid={`groups-delete-group-${expense.id}`}
  onClick={() => handleDeleteGroup(expense.id!, expense.name)}
  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-50 text-red-600 transition-colors hover:bg-red-100"
  title="Delete group"
  >
  <Trash2 size={16} />
  </button>
  )}
  </div>
  )}
 </div>

 {editingGroupId !== expense.id && (
 <>
 <div className="mt-3 flex items-center gap-3">
 <div className="flex items-center">
 {avatarMembers.map((member, index) => {
 const avatarSrc = member.friendId ? friendAvatarById.get(member.friendId) : undefined;
 return (
 <Avatar
 key={`${expense.id}-${member.name}-${index}`}
 className={`h-9 w-9 rounded-full border-2 border-white shadow-sm ${index > 0 ? '-ml-2.5' : ''}`}
 >
 <AvatarImage src={avatarSrc} alt={member.name} className="object-cover" />
 <AvatarFallback className={`${getToneClass(member.name)} text-xs font-bold`}>
 {member.name.charAt(0).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 );
 })}
 {extraMembers > 0 && (
 <div className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-bold text-gray-600 shadow-sm">
 +{extraMembers}
 </div>
 )}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-gray-700">
 {friendMembers.length} friend{friendMembers.length === 1 ? '' : 's'}
 </p>
 <p className="text-xs text-gray-500">
 {groupStatus === 'settled' ? 'Everyone is settled' : 'Collection is still pending'}
 </p>
 </div>
 </div>

 <div className="mt-3 flex flex-wrap items-center gap-2">
 <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
 {expense.category || 'Miscellaneous'}
 </span>
 <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
 groupStatus === 'settled'
 ? 'bg-emerald-100 text-emerald-700'
 : 'bg-amber-100 text-amber-700'
 }`}>
 {groupStatus === 'settled' ? 'Settled' : 'Pending'}
 </span>
 </div>

 <div className="mt-4 grid gap-2 sm:grid-cols-3">
 <div className="rounded-2xl bg-white px-3 py-2.5">
 <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">Total</p>
 <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(expense.totalAmount)}</p>
 </div>
 <div className="rounded-2xl bg-white px-3 py-2.5">
 <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">Your share</p>
 <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(yourShare)}</p>
 </div>
 <div className="rounded-2xl bg-white px-3 py-2.5">
 <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">Pending</p>
 <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(pendingCollection)}</p>
 </div>
 </div>

 {expense.description && (
 <p className="mt-3 line-clamp-2 text-sm text-gray-500">{expense.description}</p>
 )}

 {friendMembers.length > 0 && (
 <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
 {friendMembers.map((member) => {
 const isPaid = member.paymentStatus === 'paid' || member.paid;
 const avatarSrc = member.friendId ? friendAvatarById.get(member.friendId) : undefined;
 return (
 <button data-testid={`groups-can-settle-toggle-payment-${`${expense.id}-${member.originalIndex}-${member.name}`}`}
 key={`${expense.id}-${member.originalIndex}-${member.name}`}
 onClick={() => {
   if (!canSettle) {
     toast.error('You do not have permission to settle expenses.');
     return;
   }
   handleToggleMemberPayment(expense.id!, member.originalIndex, member.paid);
 }}
 disabled={!canSettle}
 className={cn(
   "shrink-0 rounded-2xl border px-3 py-2 text-left transition-all",
   !canSettle
     ? "opacity-60 cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400"
     : isPaid
     ? "border-emerald-200 bg-emerald-50 hover:scale-[1.02] active:scale-[0.98]"
     : "border-amber-200 bg-amber-50 hover:scale-[1.02] active:scale-[0.98]"
 )}
 title={canSettle ? "Toggle payment status" : "Settle permission required"}
 >
 <div className="flex items-center gap-2">
 <Avatar className="h-7 w-7 rounded-full">
 <AvatarImage src={avatarSrc} alt={member.name} className="object-cover" />
 <AvatarFallback className={`${getToneClass(member.name)} text-[11px] font-bold`}>
 {member.name.charAt(0).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="text-xs font-semibold text-gray-900">{member.name}</p>
 <p className={`text-[11px] ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
 {isPaid ? 'Paid' : 'Pending'} {formatCurrency(member.share)}
 </p>
 </div>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {sortedExpenses.length === 0 && (
 <div className="rounded-[30px] border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center">
 <Users className="mx-auto text-gray-400 mb-4" size={44} />
 <h3 className="text-lg font-semibold text-gray-900 mb-2">No group expenses yet</h3>
 <p className="mx-auto max-w-sm text-sm text-gray-500 mb-5">
 Start a shared bill and it will appear here as a compact tracker card.
 </p>
  {canCreate && (
  <button
  data-testid="groups-create-expense-button"
  onClick={openGroupExpenseForm}
  className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-900"
  >
  <Plus size={16} />
  Create Group Expense
  </button>
  )}
 </div>
 )}

 <DeleteConfirmModal
 isOpen={deleteModalOpen}
 title="Delete Group Expense"
 message="This group expense will be permanently deleted. All payment records will be lost."
 itemName={groupToDelete?.name}
 isLoading={isDeleting}
 onConfirm={confirmDeleteGroup}
 onCancel={() => {
 setDeleteModalOpen(false);
 setGroupToDelete(null);
 }}
 />
 </div>
 </CenteredLayout>
 );
};

