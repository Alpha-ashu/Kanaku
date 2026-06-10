/**
 * Voice Context Memory Store
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the "Financial Context Awareness" requirement:
 * - Remembers recent voice actions (last 10)
 * - Stores known goal names for contextual references ("add to my Bali goal")
 * - Stores known friend/contact names for loan/split context
 * - Stores frequently used categories
 * - Injected into the Qwen prompt on the backend + used locally
 *
 * Persisted in localStorage — survives page refreshes, no server required.
 */

import { db } from "@/lib/database";

export interface VoiceContext {
  recentActions: RecentAction[];
  knownGoals: string[];
  knownContacts: string[];
  topCategories: string[];
  lastUpdated: string;
}

export interface RecentAction {
  type: string;
  description: string;
  amount?: number;
  person?: string;
  timestamp: string;
}

const CONTEXT_KEY = "KANAKU_voice_context";
const MAX_RECENT = 10;

// ─────────────────────────────────────────────────────────────────────────────

export const VoiceContextStore = {
  /**
   * Loads the current context from localStorage
   */
  get(): VoiceContext {
    try {
      const raw = localStorage.getItem(CONTEXT_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      recentActions: [],
      knownGoals: [],
      knownContacts: [],
      topCategories: [],
      lastUpdated: new Date().toISOString(),
    };
  },

  /**
   * Saves the context to localStorage
   */
  save(context: VoiceContext): void {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  },

  /**
   * Refreshes context from the live database (goals, contacts, categories)
   * Call this on app startup and after DB changes.
   */
  async refresh(): Promise<VoiceContext> {
    const context = this.get();

    // Pull goal names from DB
    const goals = await db.goals.toArray();
    context.knownGoals = goals.map((g) => g.name);

    // Pull known contacts from loans
    const loans = await db.loans.toArray();
    const loanContacts = loans
      .map((l) => l.contactPerson)
      .filter((c): c is string => Boolean(c));

    // Pull known contacts from group expenses
    const groups = await db.groupExpenses?.toArray?.() ?? [];
    const groupMembers: string[] = groups.flatMap((g: any) =>
      g.members?.map((m: any) => m.name || m) ?? []
    );

    context.knownContacts = Array.from(
      new Set([...loanContacts, ...groupMembers])
    ).slice(0, 20);

    // Pull top categories from recent transactions
    const recentTx = await db.transactions
      .orderBy("date")
      .reverse()
      .limit(50)
      .toArray();

    const categoryCount: Record<string, number> = {};
    recentTx.forEach((t) => {
      if (t.category) {
        categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
      }
    });

    context.topCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat]) => cat);

    context.lastUpdated = new Date().toISOString();
    this.save(context);
    return context;
  },

  /**
   * Adds a completed voice action to the recent history.
   * Call this after the user confirms actions in the Command Center.
   */
  addRecentActions(actions: Array<{
    type: string;
    description?: string;
    amount?: number;
    person?: string;
  }>): void {
    const context = this.get();
    const now = new Date().toISOString();

    const newEntries: RecentAction[] = actions.map((a) => ({
      type: a.type,
      description: a.description || a.type,
      amount: a.amount,
      person: a.person,
      timestamp: now,
    }));

    context.recentActions = [
      ...newEntries,
      ...context.recentActions,
    ].slice(0, MAX_RECENT);

    // Auto-learn contact names from confirmed loans/splits
    actions.forEach((a) => {
      if (a.person && !context.knownContacts.includes(a.person)) {
        context.knownContacts.unshift(a.person);
        context.knownContacts = context.knownContacts.slice(0, 20);
      }
    });

    this.save(context);
  },

  /**
   * Builds a compact context string for injection into the Qwen prompt.
   * Format is designed to be compact and token-efficient.
   */
  buildPromptContext(): string {
    const ctx = this.get();
    const lines: string[] = [];

    if (ctx.knownGoals.length > 0) {
      lines.push(`User's goals: ${ctx.knownGoals.join(", ")}`);
    }
    if (ctx.knownContacts.length > 0) {
      lines.push(`Known contacts: ${ctx.knownContacts.join(", ")}`);
    }
    if (ctx.topCategories.length > 0) {
      lines.push(`Frequent categories: ${ctx.topCategories.join(", ")}`);
    }
    if (ctx.recentActions.length > 0) {
      const recent = ctx.recentActions
        .slice(0, 3)
        .map((a) => `${a.type}: ${a.description}${a.amount ? ` ₹${a.amount}` : ""}`)
        .join(" | ");
      lines.push(`Recent actions: ${recent}`);
    }

    return lines.length > 0
      ? `\n\nUser context (use for disambiguation):\n${lines.join("\n")}`
      : "";
  },

  /**
   * Clears all stored context (useful for testing or account switch)
   */
  clear(): void {
    localStorage.removeItem(CONTEXT_KEY);
  },
};
