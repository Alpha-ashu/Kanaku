import { db } from "@/lib/database";
import { startOfMonth, startOfWeek, subDays, format } from "date-fns";

export interface QueryResult {
  answer: string;
  data?: any;
  chartData?: any;
}

export const NLQService = {
  /**
   * Executes a natural language query against the local database
   */
  async executeQuery(query: string): Promise<QueryResult> {
    const q = query.toLowerCase();
    const now = new Date();

    // 1. "How much did I spend on [Category]?"
    if (q.includes('spend') || q.includes('spent') || q.includes('cost')) {
      const categories = ['food', 'travel', 'rent', 'shopping', 'bills', 'fuel', 'health', 'entertainment'];
      const matchedCategory = categories.find(cat => q.includes(cat));
      
      if (matchedCategory) {
        let periodStart = startOfMonth(now);
        let periodName = "this month";

        if (q.includes('week')) {
            periodStart = startOfWeek(now);
            periodName = "this week";
        } else if (q.includes('today')) {
            periodStart = subDays(now, 1);
            periodName = "today";
        }

        const transactions = await db.transactions
          .where('category')
          .equals(matchedCategory.charAt(0).toUpperCase() + matchedCategory.slice(1))
          .and(t => t.type === 'expense' && t.date >= periodStart)
          .toArray();

        const total = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        
        return {
          answer: `You've spent a total of ₹${total.toLocaleString()} on ${matchedCategory} ${periodName}.`,
          data: { total, count: transactions.length }
        };
      }
    }

    // 2. "What's my balance?"
    if (q.includes('balance') || q.includes('total money')) {
      const accounts = await db.accounts.toArray();
      const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
      
      return {
        answer: `Your total balance across all ${accounts.length} accounts is ₹${totalBalance.toLocaleString()}.`,
        data: { totalBalance }
      };
    }

    // 3. "Show me my last [N] transactions"
    if (q.includes('last') || q.includes('recent')) {
        const count = parseInt(q.match(/\d+/)?.[0] || '5');
        const transactions = await db.transactions
            .orderBy('date')
            .reverse()
            .limit(count)
            .toArray();

        const list = transactions.map(t => `- ${t.description}: ₹${Number(t.amount || 0)}`).join('\n');
        return {
            answer: `Here are your last ${transactions.length} transactions:\n${list}`,
            data: transactions
        };
    }

    // 4. "How much is my portfolio worth?" or "Investment performance"
    if (q.includes('portfolio') || q.includes('invested') || q.includes('investment')) {
        const investments = await db.investments.toArray();
        const totalValue = investments.reduce((sum, inv) => sum + Number(inv.currentValue || inv.totalInvested || 0), 0);
        const totalProfit = investments.reduce((sum, inv) => sum + Number(inv.profitLoss || 0), 0);
        
        const assetSummary = investments.reduce((acc: any, inv) => {
            const type = inv.assetType || 'Other';
            acc[type] = (acc[type] || 0) + Number(inv.currentValue || inv.totalInvested || 0);
            return acc;
        }, {});

        const summaryText = Object.entries(assetSummary)
            .map(([type, val]) => `- ${type}: ₹${(val as number).toLocaleString()}`)
            .join('\n');

        return {
            answer: `Your total portfolio value is ₹${totalValue.toLocaleString()}. You are currently ${totalProfit >= 0 ? 'up' : 'down'} by ₹${Math.abs(totalProfit).toLocaleString()}.\n\nBreakdown:\n${summaryText}`,
            data: { totalValue, totalProfit, assetSummary }
        };
    }

    // 5. "How far am I from my [Goal]?"
    if (q.includes('goal') || q.includes('target') || q.includes('save')) {
        const goals = await db.goals.toArray();
        const matchedGoal = goals.find(g => q.includes(g.name.toLowerCase()));
        
        if (matchedGoal) {
            const targetAmount = Number(matchedGoal.targetAmount || 0);
            const currentAmount = Number(matchedGoal.currentAmount || 0);
            const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
            const remaining = Math.max(0, targetAmount - currentAmount);
            return {
                answer: `You have reached ${progress.toFixed(1)}% of your "${matchedGoal.name}" goal. You need ₹${remaining.toLocaleString()} more to hit your target of ₹${targetAmount.toLocaleString()}.`,
                data: { progress, remaining, goal: matchedGoal }
            };
        }
        
        const overallTarget = goals.reduce((sum, g) => sum + Number(g.targetAmount || 0), 0);
        const overallSaved = goals.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);
        const overallProgress = overallTarget > 0 ? (overallSaved / overallTarget) * 100 : 0;
        
        return {
            answer: `Overall, you've saved ₹${overallSaved.toLocaleString()} towards your total goal targets of ₹${overallTarget.toLocaleString()} (${overallProgress.toFixed(1)}% progress).`,
            data: { overallProgress, overallSaved, overallTarget }
        };
    }

    // 6. "How much does [Person] owe me?" or "Who owes me?"
    if (q.includes('owe') || q.includes('debt') || q.includes('loan')) {
        const loans = await db.loans.where('status').equals('active').toArray();
        
        const personMatch = q.match(/does (.*) owe/i)?.[1] || q.match(/owe (.*)/i)?.[1];
        if (personMatch) {
            const personLoans = loans.filter(l => l.contactPerson?.toLowerCase().includes(personMatch.toLowerCase()));
            const total = personLoans.reduce((sum, l) => sum + (l.type === 'lent' ? Number(l.outstandingBalance || 0) : -Number(l.outstandingBalance || 0)), 0);
            
            if (total > 0) return { answer: `${personMatch} owes you ₹${total.toLocaleString()}.` };
            if (total < 0) return { answer: `You owe ${personMatch} ₹${Math.abs(total).toLocaleString()}.` };
            return { answer: `There are no active loans recorded for ${personMatch}.` };
        }

        const lentTotal = loans.filter(l => l.type === 'lent').reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0);
        const borrowedTotal = loans.filter(l => l.type === 'borrowed').reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0);
        
        return {
            answer: `People owe you ₹${lentTotal.toLocaleString()}, and you owe ₹${borrowedTotal.toLocaleString()} to others.`,
            data: { lentTotal, borrowedTotal }
        };
    }

    // 7. "What are my subscriptions?" or "Monthly recurring costs?"
    if (q.includes('subscription') || q.includes('recurring') || q.includes('monthly bills')) {
        const allTx = await db.transactions.toArray();
        const subscriptions = allTx.filter(t =>
          t.recurrence === 'monthly' || t.recurrence === 'yearly' ||
          (Array.isArray(t.tags) && t.tags.includes('subscription'))
        );
            
        const totalMonthly = subscriptions
          .filter(s => s.recurrence !== 'yearly')
          .reduce((sum, s) => sum + s.amount, 0);

        const seen = new Set<string>();
        const list = subscriptions
          .filter(s => { 
            const key = s.description || s.category; 
            if (seen.has(key)) return false; 
            seen.add(key); 
            return true; 
          })
          .map(s => `- ${s.description || s.category}: ₹${s.amount.toLocaleString()}${s.recurrence === 'yearly' ? '/yr' : '/mo'}`)
          .join('\n');

        return {
            answer: subscriptions.length > 0
              ? `You have ${subscriptions.length} recurring subscription${subscriptions.length !== 1 ? 's' : ''}, costing ₹${totalMonthly.toLocaleString()}/month.\n\nList:\n${list}`
              : `No subscriptions found. Add one by saying "Add monthly Netflix subscription for 199".`,
            data: { totalMonthly, subscriptions }
        };
    }

    return {
      answer: "I understood your query but couldn't find a specific answer in your records yet."
    };
  }
};
