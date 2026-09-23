/**
 * Natural Language Query Service — v2
 *
 * Strategy:
 *  1. Primary: call the backend AI chat endpoint (`/ai/chat`).
 *     The backend classifies intent and executes a structured Prisma query —
 *     accurate, real-time, and works on the server's DB replica.
 *  2. Fallback: when offline or backend unreachable, execute a local Dexie
 *     query (the original implementation). Works 100% offline.
 */

import { db } from "@/lib/database";
import { backendService } from "@/lib/backend-api";
import { startOfMonth, startOfWeek, subDays } from "date-fns";

export interface QueryResult {
  answer: string;
  data?: any;
  chartData?: any;
  transactions?: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string;
    type: string;
  }>;
  /** 'backend' when answered by server AI, 'local' when answered offline */
  source?: 'backend' | 'local';
  /** Which engine the backend used — 'offline' means the AI providers were unreachable */
  parser?: string;
  /** Classified intent (record_*, query, overview, advice, task, out_of_scope) */
  intent?: string;
  /** Action to prompt the frontend to record after a conversational query */
  action?: {
    type: string;
    entities: Record<string, any>;
    confidence: number;
    requiresConfirmation: boolean;
  };
  requiresConfirmation?: boolean;
  /** Server conversation id — send it back so follow-up questions keep their context. */
  conversationId?: string;
}

/** Why the backend could not answer, when that changes what the user should be told. */
function backendUnavailableNote(err: unknown): string | null {
  const status = (err as { status?: number })?.status;
  if (status === 429) return "You've used today's AI requests, so this answer comes from the data on your device.";
  if (status === 403) return 'The AI assistant is not enabled for your account, so this answer comes from the data on your device.';
  return null;
}

export const NLQService = {
  /**
   * Executes a natural language query, preferring the backend AI layer.
   *
   * @param query          - Raw user message / question
   * @param conversationId - Optional conversation ID for multi-turn context
   */
  async executeQuery(query: string, conversationId?: string, voiceContext?: string[]): Promise<QueryResult> {
    // ── Backend-first path ────────────────────────────────────────────────────
    try {
      const chatResponse = await backendService.sendAIChatMessage(query, conversationId, voiceContext);

      return {
        answer: chatResponse.reply,
        transactions: chatResponse.transactions,
        source: 'backend',
        parser: chatResponse.parser,
        intent: chatResponse.intent,
        action: chatResponse.action,
        requiresConfirmation: chatResponse.requiresConfirmation,
        conversationId: chatResponse.conversationId,
      };
    } catch (err) {
      // Backend unreachable, timed out, rate-limited or disabled — answer locally,
      // and say why when the user would otherwise assume the AI got it wrong.
      const local = await this._executeLocalQuery(query);
      const note = backendUnavailableNote(err);
      return note ? { ...local, answer: `${note}\n\n${local.answer}` } : local;
    }
  },

  /**
   * Local Dexie query fallback — works 100% offline.
   * Covers the most common query patterns with simple keyword matching.
   */
  async _executeLocalQuery(query: string): Promise<QueryResult> {
    const q = query.toLowerCase();
    const now = new Date();

    // 1. "How much did I spend on [Category]?" or "How much did I spend this month?"
    if (q.includes('spend') || q.includes('spent') || q.includes('cost')) {
      let periodStart = startOfMonth(now);
      let periodName = "this month";

      if (q.includes('week')) {
        periodStart = startOfWeek(now);
        periodName = "this week";
      } else if (q.includes('today')) {
        periodStart = subDays(now, 1);
        periodName = "today";
      }

      const categories = ['food', 'travel', 'rent', 'shopping', 'bills', 'fuel', 'health', 'entertainment', 'groceries', 'transport'];
      const matchedCategory = categories.find(cat => q.includes(cat));

      let transactions;
      if (matchedCategory) {
        transactions = await db.transactions
          .where('category')
          .equals(matchedCategory.charAt(0).toUpperCase() + matchedCategory.slice(1))
          .and(t => t.type === 'expense' && t.date >= periodStart && !t.deletedAt)
          .toArray();
      } else {
        transactions = await db.transactions
          .filter(t => t.type === 'expense' && t.date >= periodStart && !t.deletedAt)
          .toArray();
      }

      const total = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      return {
        answer: matchedCategory
          ? `You've spent a total of ₹${total.toLocaleString('en-IN')} on ${matchedCategory} ${periodName} (${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}).`
          : `You've spent a total of ₹${total.toLocaleString('en-IN')} ${periodName} across all categories (${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}).`,
        data: { total, count: transactions.length },
        transactions: transactions.slice(0, 5).map(t => ({
          id: String(t.id || Math.random()),
          date: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          description: t.description || t.category,
          amount: Number(t.amount || 0),
          category: t.category,
          type: t.type,
        })),
        source: 'local',
      };
    }

    // 2. "What's my balance?"
    if (q.includes('balance') || q.includes('total money')) {
      const accounts = await db.accounts.filter(a => !a.deletedAt).toArray();
      const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

      return {
        answer: `Your total balance across all ${accounts.length} active account${accounts.length !== 1 ? 's' : ''} is ₹${totalBalance.toLocaleString('en-IN')}.`,
        data: { totalBalance },
        source: 'local',
      };
    }

    // 3. "Show me my last [N] transactions"
    if (q.includes('last') || q.includes('recent')) {
      const count = parseInt(q.match(/\d+/)?.[0] || '5');
      const transactions = await db.transactions
        .orderBy('date')
        .reverse()
        .filter(t => !t.deletedAt)
        .limit(count)
        .toArray();

      return {
        answer: transactions.length > 0
          ? `Here are your last ${transactions.length} transactions:`
          : `No recent transactions found.`,
        data: transactions,
        transactions: transactions.map(t => ({
          id: String(t.id || Math.random()),
          date: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          description: t.description || t.category,
          amount: Number(t.amount || 0),
          category: t.category,
          type: t.type,
        })),
        source: 'local',
      };
    }

    // 4. Portfolio / investments
    if (q.includes('portfolio') || q.includes('invested') || q.includes('investment')) {
      const investments = await db.investments.toArray();
      const totalValue = investments.reduce((sum, inv) => sum + Number(inv.currentValue || inv.totalInvested || 0), 0);
      const totalProfit = investments.reduce((sum, inv) => sum + Number(inv.profitLoss || 0), 0);

      return {
        answer: `Your total portfolio value is ₹${totalValue.toLocaleString('en-IN')}. You are currently ${totalProfit >= 0 ? 'up' : 'down'} by ₹${Math.abs(totalProfit).toLocaleString('en-IN')}.`,
        data: { totalValue, totalProfit },
        source: 'local',
      };
    }

    // 5. Goals
    if (q.includes('goal') || q.includes('target') || q.includes('save')) {
      const goals = await db.goals.toArray();
      const matchedGoal = goals.find(g => q.includes(g.name.toLowerCase()));

      if (matchedGoal) {
        const targetAmount = Number(matchedGoal.targetAmount || 0);
        const currentAmount = Number(matchedGoal.currentAmount || 0);
        const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
        const remaining = Math.max(0, targetAmount - currentAmount);
        return {
          answer: `You have reached ${progress.toFixed(1)}% of your "${matchedGoal.name}" goal. You need ₹${remaining.toLocaleString('en-IN')} more.`,
          data: { progress, remaining, goal: matchedGoal },
          source: 'local',
        };
      }

      const overallTarget = goals.reduce((sum, g) => sum + Number(g.targetAmount || 0), 0);
      const overallSaved = goals.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);
      const overallProgress = overallTarget > 0 ? (overallSaved / overallTarget) * 100 : 0;

      return {
        answer: `Overall, you've saved ₹${overallSaved.toLocaleString('en-IN')} towards total goals of ₹${overallTarget.toLocaleString('en-IN')} (${overallProgress.toFixed(1)}% progress).`,
        data: { overallProgress, overallSaved, overallTarget },
        source: 'local',
      };
    }

    // 6. Loans / debts
    if (q.includes('owe') || q.includes('debt') || q.includes('loan')) {
      const loans = await db.loans.where('status').equals('active').and(l => !l.deletedAt).toArray();

      const lentLoans = loans.filter(l => l.type === 'lent');
      const borrowedLoans = loans.filter(l => l.type === 'borrowed');
      const lentTotal = lentLoans.reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0);
      const borrowedTotal = borrowedLoans.reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0);

      if (q.includes('who owes') || q.includes('owes me')) {
        const debtors = lentLoans.map(l => `${l.contactPerson || l.name}: ₹${Number(l.outstandingBalance || 0).toLocaleString('en-IN')}`).join(', ');
        return {
          answer: lentLoans.length > 0
            ? `People owe you a total of ₹${lentTotal.toLocaleString('en-IN')}:\n${debtors}`
            : `Nobody currently owes you money.`,
          data: { lentTotal, loans: lentLoans },
          source: 'local',
        };
      }

      return {
        answer: `People owe you ₹${lentTotal.toLocaleString('en-IN')}, and you owe ₹${borrowedTotal.toLocaleString('en-IN')} to others.`,
        data: { lentTotal, borrowedTotal },
        source: 'local',
      };
    }

    // 7. Subscriptions / recurring
    if (q.includes('subscription') || q.includes('recurring') || q.includes('monthly bills')) {
      const allTx = await db.transactions.toArray();
      const subscriptions = allTx.filter(t =>
        t.recurrence === 'monthly' || t.recurrence === 'yearly' ||
        (Array.isArray(t.tags) && t.tags.includes('subscription'))
      );

      const totalMonthly = subscriptions
        .filter(s => s.recurrence !== 'yearly')
        .reduce((sum, s) => sum + s.amount, 0);

      return {
        answer: subscriptions.length > 0
          ? `You have ${subscriptions.length} recurring subscription${subscriptions.length !== 1 ? 's' : ''}, costing ₹${totalMonthly.toLocaleString('en-IN')}/month.`
          : `No subscriptions found. Add one by saying "Add monthly Netflix subscription for 199".`,
        data: { totalMonthly, subscriptions },
        source: 'local',
      };
    }

    return {
      answer: "I understood your query but couldn't find a specific answer in your local records. Please make sure you're connected so I can check your full data.",
      source: 'local',
    };
  },
};
