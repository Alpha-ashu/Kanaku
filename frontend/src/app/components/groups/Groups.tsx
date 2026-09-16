import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { queueTransactionDeleteSync } from '@/lib/auth-sync-integration';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { getCategoryCartoonIcon, getCategoryColor } from '@/app/components/ui/CartoonCategoryIcons';
import { Plus, Users, Trash2, Edit2, Check, CalendarDays, ArrowLeft, Clock, FileText, ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { readVoiceDraft, VOICE_GROUP_DRAFT_KEY, type VoiceGroupDraft } from '@/lib/voiceDrafts';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';
import { SPLIT_TYPE_LABELS, getGroupExpenseSettlement, normalizeSplitType } from '@/lib/groupSplit';
import type { GroupExpense } from '@/lib/database';

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

// Your own bills: created on this device (no owner recorded) or by your account.
// Rows you were only added to list their creator first, not you.
const isOwnGroupExpense = (expense: GroupExpense, userId?: string) =>
  expense.createdBy ? expense.createdBy === userId : expense.members?.[0]?.isCurrentUser !== false;

const formatDisplayName = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const Groups: React.FC = () => {
  const { groupExpenses, friends, currency, setCurrentPage } = useApp();
  const { user } = useAuth();
  const canCreate = useSubFeature('groups', 'createGroup');
  const canEdit = useSubFeature('groups', 'editGroup');
  const canAddMember = useSubFeature('groups', 'addMember');
  const canSettle = useSubFeature('groups', 'settleExpense');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

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
  // Tighter figures for the settlement table columns (₹5,000 rather than ₹5,000.00).
  const formatCompact = (amount: number) =>
    formatCurrencyAmount(amount, currency, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const openGroupExpenseForm = () => {
    localStorage.setItem('quickFormType', 'expense');
    localStorage.setItem('quickExpenseMode', 'group');
    localStorage.setItem('quickBackPage', 'groups');
    setCurrentPage('add-transaction');
  };

  const openFriendProfile = async (friend: { id?: number; cloudId?: string; name?: string }) => {
    if (!friend.cloudId) {
      if (!friend.id) {
        toast.error('This friend could not be found locally.');
        return;
      }
      // Local-only friend (no cloudId) — send user to Manage Friends so they can
      // tap the amber row and add an email/phone to trigger sync.
      toast.info(`Tap "${friend.name || 'the friend'}" in the list below to add contact info and sync.`);
      setCurrentPage('friends');
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

  // Edits the whole expense — amount, split method, members, amounts, payer —
  // in the same form it was created with.
  const openGroupExpenseEditor = (groupId: number) => {
    localStorage.setItem('editGroupExpenseId', String(groupId));
    localStorage.setItem('quickFormType', 'expense');
    localStorage.setItem('quickExpenseMode', 'group');
    localStorage.setItem('quickBackPage', 'groups');
    setCurrentPage('add-transaction');
  };

  // Marks what a member owes as settled (or reopens it). Members who owe nothing —
  // they paid at least their share — have nothing to toggle.
  const handleToggleMemberPayment = async (groupId: number, memberIndex: number) => {
    try {
      const group = groupExpenses.find((expense) => expense.id === groupId);
      if (!group) return;

      const balance = getGroupExpenseSettlement(group).balances[memberIndex];
      if (!balance || balance.owes <= 0) return;

      const updatedMembers = [...group.members];
      const targetMember = updatedMembers[memberIndex];
      const nextPaidState = !balance.settled;

      updatedMembers[memberIndex] = {
        ...targetMember,
        paid: nextPaidState,
        paidAmount: nextPaidState ? targetMember.share : 0,
        paymentStatus: nextPaidState ? 'paid' : 'pending',
      };

      const after = getGroupExpenseSettlement({ ...group, members: updatedMembers });
      await db.groupExpenses.update(groupId, {
        members: updatedMembers,
        status: after.isSettled ? 'settled' : 'pending',
        ...(targetMember.isCurrentUser ? { yourSettled: nextPaidState } : {}),
        updatedAt: new Date(),
      });
      toast.success(`${targetMember.isCurrentUser ? 'Your share' : targetMember.name} marked as ${nextPaidState ? 'settled' : 'pending'}`);
    } catch (error) {
      console.error('Failed to update member payment:', error);
      toast.error('Failed to update member status');
    }
  };

  return (
    <CenteredLayout className="pb-32 sm:pb-24">
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go to dashboard"
              title="Go to dashboard"
              data-testid="groups-go-back-button"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
              Group Expenses
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canAddMember && (
              <Button
                data-testid="groups-button"
                variant="secondary"
                onClick={() => setCurrentPage('add-friends')}
                className="shadow-xs border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 h-9 sm:h-10 px-4 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={16} />
                <span>Friend</span>
              </Button>
            )}
            {canCreate && (
              <Button
                data-testid="groups-button-2"
                onClick={openGroupExpenseForm}
                className="shadow-xs bg-[#18181B] hover:bg-black text-white h-9 sm:h-10 px-4 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={16} />
                <span>Expense</span>
              </Button>
            )}
          </div>
        </div>

        <section className="rounded-[28px] sm:rounded-[32px] border border-slate-100 bg-white p-5 sm:p-6 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900">Friends</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {savedFriends.length > 0 ? (
                  <>
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-purple-100 px-2 text-xs font-bold text-purple-700">
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
              className="shadow-xs bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50 text-xs sm:text-sm h-9 px-4 rounded-full font-bold cursor-pointer"
            >
              Manage Friends
            </Button>
          </div>

          {savedFriends.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-100 bg-slate-50/60 p-4">
              <div className="-mx-1 -my-1 flex gap-3.5 overflow-x-auto overflow-y-visible px-1 py-1 scrollbar-none">
                {savedFriends.map((friend) => (
                  <button
                    data-testid={`groups-view-${friend.id}`}
                    key={friend.id}
                    type="button"
                    onClick={() => openFriendProfile(friend)}
                    className="flex w-[84px] shrink-0 flex-col items-center text-center transition-all hover:-translate-y-0.5 cursor-pointer group"
                    title={`View ${formatDisplayName(friend.name)}`}
                    aria-label={`View ${formatDisplayName(friend.name)}`}
                  >
                    <div className="flex h-15 w-15 items-center justify-center rounded-full border-2 border-white bg-white p-0.5 shadow-sm transition-all group-hover:border-purple-300 group-hover:shadow-md">
                      <Avatar className="h-full w-full rounded-full">
                        <AvatarImage src={friend.avatar} alt={friend.name} className="object-cover" />
                        <AvatarFallback className={`${getToneClass(friend.name)} text-sm font-bold`}>
                          {friend.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <p className="mt-2 w-full truncate text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors">
                      {formatDisplayName(friend.name)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">No saved friends yet.</p>
            </div>
          )}
        </section>

        <div className="space-y-4">
          {sortedExpenses.map((expense) => {
            const settlement = getGroupExpenseSettlement(expense);
            const allMembersWithIndex = expense.members.map((member, index) => ({
              ...member,
              originalIndex: index,
              balance: settlement.balances[index],
            }));
            const friendMembers = allMembersWithIndex.filter((member) => !member.isCurrentUser);
            const me = allMembersWithIndex.find((member) => member.isCurrentUser);
            const yourShare = me?.balance?.share ?? expense.yourShare ?? 0;
            const youOwe = me?.balance && me.balance.owes > 0 ? me.balance.outstanding : 0;
            const youCollect = me?.balance && me.balance.receives > 0 ? me.balance.outstanding : 0;
            const unsettledTotal = settlement.balances.reduce((sum, b) => sum + (b.owes > 0 ? b.outstanding : 0), 0);
            // Progress counts the people who owed something, not everyone on the bill.
            const debtors = settlement.balances.filter((b) => b.owes > 0);
            const settledDebtorsCount = debtors.filter((b) => b.settled).length;
            const paidPercent = debtors.length > 0 ? Math.round((settledDebtorsCount / debtors.length) * 100) : 100;
            const groupStatus = settlement.isSettled || expense.status === 'settled' ? 'settled' : 'pending';
            const splitLabel = SPLIT_TYPE_LABELS[normalizeSplitType(expense.splitType)];
            const isOwner = isOwnGroupExpense(expense, user?.id);
            const isExpanded = expandedGroupId === expense.id;
            const memberName = (index: number) => {
              const m = expense.members[index];
              return !m ? 'Someone' : m.isCurrentUser ? 'You' : m.name;
            };
            // Chips: friends, plus you when someone else paid and you owe them.
            const breakdownMembers = youOwe > 0 && me ? [me, ...friendMembers] : friendMembers;
            const coverColor = getCategoryColor(expense.category || 'Miscellaneous');

            return (
              <div
                key={expense.id}
                className="rounded-[28px] sm:rounded-[32px] border border-slate-100/90 bg-white p-4 sm:p-5 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-md transition-all space-y-3.5 sm:space-y-4"
              >
                {/* TOP ROW: Category Icon, Name/Date/Status, and Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Category Icon */}
                    <div
                      ref={el => { if (el) el.style.backgroundColor = coverColor || ''; }}
                      className="relative flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-2xs"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-black/15 to-black/50" />
                      <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 shadow-2xs backdrop-blur-xs">
                        {getCategoryCartoonIcon(expense.category || 'Miscellaneous', 22)}
                      </div>
                    </div>

                    {/* Name, Category, Date, Status */}
                    <div className="min-w-0 flex-1">
                      <div>
                        <h3 className="truncate text-base sm:text-lg font-black tracking-tight text-slate-900">
                          {expense.name}
                        </h3>
                        <p className="text-xs font-semibold text-slate-500 truncate" data-testid={`groups-split-method-${expense.id}`}>
                          {splitLabel} • {expense.members.length} {expense.members.length === 1 ? 'Member' : 'Members'}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                            <CalendarDays size={12} className="shrink-0" />
                            <span>{formatDateLabel(expense.date)}</span>
                          </span>
                          <span className="text-slate-200">•</span>
                          <span className="rounded-full bg-slate-100/90 px-2 py-0.5 text-2xs font-bold text-slate-600">
                            {expense.category || 'Miscellaneous'}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold ${
                            groupStatus === 'settled'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          }`}>
                            {groupStatus === 'settled' ? (
                              <>
                                <Check size={10} strokeWidth={3} /> Settled
                              </>
                            ) : (
                              <>
                                <Clock size={10} /> Pending
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canEdit && (
                        <button
                          data-testid={`groups-edit-group-name-${expense.id}`}
                          onClick={() => openGroupExpenseEditor(expense.id!)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200/80 bg-white text-slate-700 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200/70 shadow-2xs cursor-pointer active:scale-95 transition-all text-xs font-bold"
                          title="Edit group expense and split"
                          aria-label={`Edit ${expense.name}`}
                        >
                          <Edit2 size={12} className="text-purple-600" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      )}
                      {canSettle && (
                        <button
                          data-testid={`groups-delete-group-${expense.id}`}
                          onClick={() => handleDeleteGroup(expense.id!, expense.name)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 shadow-2xs cursor-pointer active:scale-95 transition-all"
                          title="Delete group"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                </div>

                  <>
                    {/* 3-METRIC CONSOLIDATED STATS STRIP (Always 3 columns, never stacked vertically) */}
                    <div className="grid grid-cols-3 divide-x divide-slate-200/60 rounded-2xl bg-slate-50/90 border border-slate-100/90 p-2.5 sm:p-3 text-center">
                      <div className="px-1 sm:px-2">
                        <p className="text-2xs font-black uppercase tracking-wider text-slate-400 truncate">Total Bill</p>
                        <p className="mt-0.5 text-xs sm:text-sm font-black text-slate-900 truncate">
                          {formatCurrency(expense.totalAmount)}
                        </p>
                      </div>
                      <div className="px-1 sm:px-2">
                        <p className="text-2xs font-black uppercase tracking-wider text-purple-600/90 truncate">Your Share</p>
                        <p className="mt-0.5 text-xs sm:text-sm font-black text-purple-700 truncate">
                          {formatCurrency(yourShare)}
                        </p>
                      </div>
                      <div className="px-1 sm:px-2">
                        <p className="text-2xs font-black uppercase tracking-wider text-slate-400 truncate">
                          {groupStatus === 'settled' ? 'Status' : youOwe > 0 ? 'You Owe' : youCollect > 0 ? 'To Collect' : 'Unsettled'}
                        </p>
                        <p className={cn(
                          "mt-0.5 text-xs sm:text-sm font-black truncate",
                          groupStatus === 'settled'
                            ? "text-emerald-600 flex items-center justify-center gap-1"
                            : youOwe > 0 ? "text-rose-600" : "text-amber-600"
                        )}>
                          {groupStatus === 'settled' ? (
                            <>
                              <Check size={12} strokeWidth={3} /> Settled
                            </>
                          ) : (
                            formatCurrency(youOwe > 0 ? youOwe : youCollect > 0 ? youCollect : unsettledTotal)
                          )}
                        </p>
                      </div>
                    </div>

                    {/* SETTLEMENT PROGRESS BAR */}
                    {debtors.length > 0 && (
                      <div className="space-y-1.5 px-0.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <div className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              groupStatus === 'settled' ? "bg-emerald-500" : "bg-amber-500"
                            )} />
                            <span>
                              {groupStatus === 'settled'
                                ? 'Everyone settled'
                                : `${settledDebtorsCount} of ${debtors.length} ${debtors.length === 1 ? 'person' : 'people'} settled`}
                            </span>
                          </div>
                          <span className={groupStatus === 'settled' ? 'text-emerald-600 font-black' : 'text-slate-600 font-black'}>
                            {paidPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100/90">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              groupStatus === 'settled'
                                ? "bg-emerald-500"
                                : "bg-gradient-to-r from-purple-500 to-indigo-500"
                            )}
                            style={{ width: `${paidPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* DESCRIPTION (if exists) */}
                    {expense.description && (
                      <div className="flex items-start gap-2 rounded-xl bg-slate-50/70 border border-slate-100/60 px-3 py-2 text-xs text-slate-600 font-medium">
                        <FileText size={13} className="shrink-0 mt-0.5 text-slate-400" />
                        <p className="line-clamp-2">{expense.description}</p>
                      </div>
                    )}

                    {/* MEMBER SETTLEMENT CHIPS */}
                    {breakdownMembers.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between px-0.5">
                          <span className="text-2xs font-black uppercase tracking-wider text-slate-400">
                            Friends Breakdown
                          </span>
                          {canSettle && debtors.length > 0 && (
                            <span className="text-2xs font-semibold text-purple-600">
                              Tap to toggle settled
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                          {breakdownMembers.map((member) => {
                            const owes = (member.balance?.owes ?? 0) > 0;
                            const receives = (member.balance?.receives ?? 0) > 0;
                            const isPaid = owes ? Boolean(member.balance?.settled) : true;
                            const avatarSrc = member.friendId ? friendAvatarById.get(member.friendId) : undefined;
                            const displayName = member.isCurrentUser ? 'You' : member.name;
                            return (
                              <button
                                data-testid={`groups-can-settle-toggle-payment-${`${expense.id}-${member.originalIndex}-${member.name}`}`}
                                key={`${expense.id}-${member.originalIndex}-${member.name}`}
                                onClick={() => {
                                  if (!owes) return;
                                  if (!canSettle) {
                                    toast.error('You do not have permission to settle expenses.');
                                    return;
                                  }
                                  handleToggleMemberPayment(expense.id!, member.originalIndex);
                                }}
                                disabled={!canSettle || !owes}
                                className={cn(
                                  "shrink-0 rounded-2xl border px-3 py-2 text-left transition-all cursor-pointer shadow-2xs flex items-center gap-2.5",
                                  !owes
                                    ? "cursor-default border-slate-200/80 bg-slate-50/80 text-slate-700"
                                    : !canSettle
                                    ? "opacity-60 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                    : isPaid
                                    ? "border-emerald-200/80 bg-emerald-50/80 hover:bg-emerald-100/80 active:scale-95 text-emerald-900"
                                    : "border-amber-200/80 bg-amber-50/80 hover:bg-amber-100/80 active:scale-95 text-amber-900"
                                )}
                                title={!owes ? `${displayName} owes nothing on this bill` : canSettle ? `Tap to mark ${displayName} as ${isPaid ? 'pending' : 'settled'}` : "Settle permission required"}
                              >
                                <div className="relative shrink-0">
                                  <Avatar className="h-7 w-7 rounded-full shadow-2xs">
                                    <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />
                                    <AvatarFallback className={`${getToneClass(member.name)} text-2xs font-bold`}>
                                      {displayName.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className={cn(
                                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-white flex items-center justify-center text-white",
                                    isPaid ? "bg-emerald-500" : "bg-amber-500"
                                  )}>
                                    {isPaid ? <Check size={8} strokeWidth={3} /> : <Clock size={7} />}
                                  </div>
                                </div>
                                <div className="min-w-0 pr-1">
                                  <p className="truncate text-xs font-bold text-slate-800 leading-tight">
                                    {displayName}
                                  </p>
                                  <p className={cn(
                                    "text-2xs font-black tracking-tight mt-0.5",
                                    !owes ? (receives ? "text-indigo-700" : "text-slate-500") : isPaid ? "text-emerald-700" : "text-amber-700"
                                  )}>
                                    {!owes
                                      ? receives
                                        ? member.balance!.outstanding > 0 ? `Gets ${formatCurrency(member.balance!.outstanding)}` : `Received ${formatCurrency(member.balance!.receives)}`
                                        : member.share > 0 ? 'Paid own share' : 'No share'
                                      : `${isPaid ? 'Paid' : 'Pending'} ${formatCurrency(member.balance!.owes)}`}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SETTLEMENT DETAILS */}
                    <div className="border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedGroupId(isExpanded ? null : expense.id!)}
                        aria-expanded={isExpanded}
                        data-testid={`groups-settlement-toggle-${expense.id}`}
                        className="flex w-full items-center justify-between px-0.5 py-1 text-2xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        <span>Settlement details</span>
                        <ChevronDown size={14} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-3" data-testid={`groups-settlement-details-${expense.id}`}>
                          <div className="overflow-hidden rounded-2xl border border-slate-100">
                            <table className="w-full table-fixed text-left">
                              <thead className="bg-slate-50/90">
                                <tr className="text-2xs font-black uppercase tracking-wider text-slate-400">
                                  <th className="px-2.5 py-2 w-[34%]">Member</th>
                                  <th className="px-1.5 py-2 text-right">Share</th>
                                  <th className="px-1.5 py-2 text-right">Paid</th>
                                  <th className="px-2.5 py-2 text-right">Balance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {allMembersWithIndex.map((member) => {
                                  const b = member.balance;
                                  if (!b) return null;
                                  return (
                                    <tr key={`${expense.id}-row-${member.originalIndex}`} className="text-xs">
                                      <td className="px-2.5 py-2 font-bold text-slate-800 truncate">
                                        {memberName(member.originalIndex)}
                                      </td>
                                      <td className="px-1.5 py-2 text-right font-semibold text-slate-600 truncate">{formatCompact(b.share)}</td>
                                      <td className="px-1.5 py-2 text-right font-semibold text-slate-600 truncate">{formatCompact(b.paid)}</td>
                                      <td className={cn(
                                        'px-2.5 py-2 text-right font-black truncate',
                                        b.balance > 0 ? 'text-emerald-600' : b.balance < 0 ? 'text-rose-600' : 'text-slate-400',
                                      )}>
                                        {b.balance > 0 ? '+' : b.balance < 0 ? '−' : ''}{formatCompact(Math.abs(b.balance))}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <p className="px-0.5 text-2xs font-semibold text-slate-400">
                            + receives money · − pays money
                          </p>

                          {settlement.transfers.length > 0 && (
                            <ul className="space-y-1.5">
                              {settlement.transfers.map((t) => (
                                <li
                                  key={`${expense.id}-${t.from}-${t.to}`}
                                  className={cn(
                                    'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold',
                                    t.settled ? 'border-emerald-100 bg-emerald-50/60 text-emerald-800' : 'border-slate-100 bg-slate-50/60 text-slate-700',
                                  )}
                                >
                                  <span className="max-w-[35%] truncate font-bold">{memberName(Number(t.from))}</span>
                                  <ArrowRight size={11} className="shrink-0 opacity-60" />
                                  <span className="max-w-[35%] truncate font-bold">{memberName(Number(t.to))}</span>
                                  <span className="ml-auto shrink-0 font-black">
                                    {t.settled && <Check size={11} strokeWidth={3} className="mr-1 inline" />}
                                    {formatCurrency(t.amount)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {canEdit && (
                            <div className="pt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => openGroupExpenseEditor(expense.id!)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-all active:scale-95 cursor-pointer border border-purple-200/60"
                              >
                                <Edit2 size={12} />
                                <span>Edit Expense & Split</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
              </div>
            );
          })}
        </div>

        {sortedExpenses.length === 0 && (
          <div className="rounded-[28px] sm:rounded-[32px] border-2 border-dashed border-slate-200 bg-white px-6 py-14 text-center">
            <Users className="mx-auto text-slate-400 mb-4" size={44} />
            <h3 className="text-lg font-bold text-slate-900 mb-2">No group expenses yet</h3>
            <p className="mx-auto max-w-sm text-sm text-slate-500 mb-5">
              Start a shared bill and it will appear here as a compact tracker card.
            </p>
            {canCreate && (
              <button
                data-testid="groups-create-expense-button"
                onClick={openGroupExpenseForm}
                className="inline-flex items-center gap-2 rounded-full bg-[#18181B] hover:bg-black px-5 py-3 text-sm font-bold text-white transition-all active:scale-95 shadow-xs cursor-pointer"
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
