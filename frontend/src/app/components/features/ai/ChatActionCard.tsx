import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import type { KaiAction, KaiActionKind } from '@kanaku/shared';
import { actionOutflow, executeKaiAction, resolveDefaultAccount } from '@/services/kai/kaiActionExecutor';
import { executeAssistantTask } from '@/services/aiTaskExecutor';
import type { AssistantTask } from '@/services/voiceFinancialService';
import type { QueryResult } from '@/services/nlqService';

/** The pending action `/ai/chat` returns for record_* and task intents. */
export type ChatProposedAction = NonNullable<QueryResult['action']>;

export type ChatActionStatus = 'pending' | 'saved' | 'dismissed';

/** Record types the chat can save through the same executor Kai voice uses. */
const RECORD_KINDS: ReadonlyArray<KaiActionKind> = [
  'expense', 'income', 'subscription', 'transfer', 'loan_lend', 'loan_borrow', 'investment', 'group_expense',
];

const RECORD_TITLES: Record<string, string> = {
  expense: 'New expense',
  income: 'New income',
  subscription: 'New subscription',
  transfer: 'New transfer',
  loan_lend: 'Money lent',
  loan_borrow: 'Money borrowed',
  investment: 'New investment',
  group_expense: 'Group expense',
};

const TASK_TITLES: Record<AssistantTask['type'], string> = {
  create_budget: 'New budget',
  create_goal: 'New goal',
  add_todo: 'New reminder',
  create_recurring: 'Recurring payment',
};

export const isConfirmableChatAction = (action?: ChatProposedAction): boolean =>
  !!action?.requiresConfirmation &&
  (action.type === 'task' ? !!action.entities?.task : RECORD_KINDS.includes(action.type as KaiActionKind));

interface ChatActionCardProps {
  messageId: string;
  prompt: string;
  action: ChatProposedAction;
  status: ChatActionStatus;
  onResolved: (status: Exclude<ChatActionStatus, 'pending'>, summary?: string) => void;
}

/**
 * Confirmation card for an action KAI proposes in chat mode. Nothing is written
 * until the user taps Confirm; money records go through the Kai executor so
 * balances and sync behave exactly as they do for voice.
 */
export const ChatActionCard: React.FC<ChatActionCardProps> = ({ messageId, prompt, action, status, onResolved }) => {
  const { accounts, currency, refreshData } = useApp();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState<number | undefined>();

  const isTask = action.type === 'task';
  const task = isTask ? (action.entities.task as AssistantTask) : undefined;
  const e = action.entities;

  const kaiAction = useMemo<KaiAction | null>(() => {
    if (isTask) return null;
    return {
      // Stable per message, so a double tap or retry maps to the same server row.
      actionId: `chat:${messageId}`,
      kind: action.type as KaiActionKind,
      rawSegment: prompt,
      entities: {
        amount: e.amount,
        category: e.category,
        description: e.description,
        merchant: e.merchant,
        person: e.person,
        members: e.members,
        date: e.date,
        paymentMethod: e.paymentMethod,
        recurrence: e.recurrence,
      },
      confidence: action.confidence,
      requiresReview: false,
    };
  }, [action, e, isTask, messageId, prompt]);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.deletedAt), [accounts]);
  const needsAccount = !isTask || task?.type === 'create_recurring';

  useEffect(() => {
    if (!needsAccount || accountId !== undefined || status !== 'pending') return;
    const outflow = kaiAction ? actionOutflow(kaiAction) : 0;
    void resolveDefaultAccount(outflow).then((account) => {
      if (account?.id !== undefined) setAccountId(account.id);
    });
  }, [needsAccount, accountId, kaiAction, status]);

  const money = (value?: number) => (value ? formatCurrencyAmount(Number(value), currency) : undefined);

  const rows: Array<[string, string | undefined]> = task
    ? [
        [task.type === 'create_budget' ? 'Category' : 'Name', task.type === 'create_budget' ? task.category || task.title : task.title],
        [task.type === 'create_budget' ? 'Limit' : 'Amount', money(task.amount) && (task.type === 'create_budget' ? `${money(task.amount)} / ${(task.period || 'monthly').replace('ly', '')}` : money(task.amount))],
        [task.type === 'create_recurring' ? 'Repeats' : 'Period', task.type === 'create_recurring' ? task.interval : undefined],
        [task.type === 'add_todo' || task.type === 'create_goal' ? 'Date' : 'Next due', task.date],
      ]
    : [
        ['Amount', money(e.amount)],
        ['Category', action.type === 'transfer' ? undefined : e.category],
        ['Merchant', e.merchant],
        [
          action.type === 'transfer' ? 'To' : action.type.startsWith('loan') ? 'Person' : 'With',
          Array.isArray(e.members) && e.members.length > 0 ? e.members.join(', ') : e.person,
        ],
        ['Note', e.description],
        ['Date', e.date],
      ];

  const title = task ? TASK_TITLES[task.type] : RECORD_TITLES[action.type] ?? 'New entry';

  const confirm = async () => {
    if (saving) return;
    if (needsAccount && accountId === undefined) {
      toast.error('Add an account first so KAI knows where to record this.');
      return;
    }
    setSaving(true);
    try {
      let summary: string;
      if (task) {
        const account = activeAccounts.find((a) => a.id === accountId);
        summary = await executeAssistantTask(task, {
          userId: user?.id,
          accountId,
          accountCloudId: account?.cloudId ? String(account.cloudId) : undefined,
        });
      } else {
        const outcome = await executeKaiAction(kaiAction!, { userId: user?.id, accountId: accountId! });
        summary = outcome.say ?? 'Saved.';
      }
      refreshData();
      toast.success(summary);
      onResolved('saved', summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="kai-chat-action-card"
      className="w-full min-w-[240px] max-w-sm rounded-2xl border border-purple-100 bg-white p-3.5 shadow-2xs"
    >
      <p className="text-[11px] font-black uppercase tracking-wider text-purple-700">{title}</p>

      <dl className="mt-2 divide-y divide-slate-100 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-semibold text-slate-900 text-right truncate">{value}</dd>
            </div>
          ))}
      </dl>

      {status === 'pending' && needsAccount && activeAccounts.length > 0 && (
        <label className="mt-2 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">{action.type === 'income' || action.type === 'loan_borrow' ? 'Into' : 'From'}</span>
          <select
            data-testid="kai-chat-action-account"
            value={accountId ?? ''}
            onChange={(ev) => setAccountId(Number(ev.target.value))}
            disabled={saving}
            className="min-w-0 max-w-[60%] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800"
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="kai-chat-action-confirm"
            onClick={() => void confirm()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
            Confirm
          </button>
          <button
            type="button"
            data-testid="kai-chat-action-dismiss"
            onClick={() => onResolved('dismissed')}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
          >
            <X size={14} strokeWidth={2.6} />
            Cancel
          </button>
        </div>
      ) : (
        <p className={`mt-2.5 text-xs font-semibold ${status === 'saved' ? 'text-emerald-600' : 'text-slate-400'}`}>
          {status === 'saved' ? 'Saved' : 'Not saved'}
        </p>
      )}
    </div>
  );
};
