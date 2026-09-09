/**
 * Category Suggester
 *
 * Learns from a user's own transaction history to suggest the most likely
 * category for a new expense, given a merchant / description keyword.
 *
 * Algorithm:
 *  1. Normalise the merchant/description to lowercase keyword tokens.
 *  2. Query the user's past transactions whose description contains any token.
 *  3. Return the most frequently used category for those matches.
 *  4. Fallback: return the user's globally most-used category.
 *  5. Final fallback: return 'Miscellaneous'.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';

// Static fallback keyword → category map (used when no personal history exists)
const STATIC_KEYWORD_MAP: Record<string, string> = {
  zomato: 'Food', swiggy: 'Food', blinkit: 'Groceries', zepto: 'Groceries',
  dunzo: 'Groceries', bigbasket: 'Groceries', dmart: 'Groceries',
  amazon: 'Shopping', flipkart: 'Shopping', myntra: 'Shopping', meesho: 'Shopping',
  uber: 'Transport', ola: 'Transport', rapido: 'Transport',
  netflix: 'Entertainment', hotstar: 'Entertainment', spotify: 'Entertainment',
  youtube: 'Entertainment', prime: 'Entertainment',
  airtel: 'Utilities', jio: 'Utilities', vodafone: 'Utilities', bsnl: 'Utilities',
  rent: 'Housing', society: 'Housing', maintenance: 'Housing',
  gym: 'Health', apollo: 'Health', practo: 'Health', medplus: 'Health',
  school: 'Education', college: 'Education', udemy: 'Education', coursera: 'Education',
  salary: 'Salary', freelance: 'Freelance', invoice: 'Freelance',
  sip: 'Investment', mutual: 'Investment', zerodha: 'Investment', groww: 'Investment',
};

/**
 * Suggest the most likely category for a new expense.
 *
 * @param userId      - The authenticated user making the expense
 * @param description - Raw description / merchant name from NLP extraction
 * @returns           - Suggested category string
 */
export async function suggestCategory(userId: string, description: string): Promise<string> {
  if (!description) return 'Miscellaneous';

  const lower = description.toLowerCase();
  const tokens = lower.split(/\s+/).filter(t => t.length >= 3);

  // 1. Check user's personal history first (highest confidence)
  try {
    if (tokens.length > 0) {
      // Build an OR clause for each token
      const personalRows = await prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          type: 'expense',
          OR: tokens.map(token => ({
            description: { contains: token, mode: 'insensitive' as const },
          })),
        },
        select: { category: true },
        orderBy: { date: 'desc' },
        take: 50,
      });

      if (personalRows.length > 0) {
        // Count category frequency
        const freq: Record<string, number> = {};
        for (const row of personalRows) {
          if (row.category && row.category !== 'Personal Share Offset') {
            freq[row.category] = (freq[row.category] ?? 0) + 1;
          }
        }
        const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (best) return best[0];
      }
    }
  } catch (err) {
    logger.warn('CategorySuggester: personal history query failed', { err });
  }

  // 2. Static keyword map (no DB hit needed)
  for (const [keyword, category] of Object.entries(STATIC_KEYWORD_MAP)) {
    if (lower.includes(keyword)) return category;
  }

  // 3. User's globally most-used category (fallback)
  try {
    const topCategory = await prisma.transaction.groupBy({
      by: ['category'],
      where: { userId, deletedAt: null, type: 'expense' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    });
    if (topCategory.length > 0 && topCategory[0].category) {
      return topCategory[0].category;
    }
  } catch (err) {
    logger.warn('CategorySuggester: global fallback query failed', { err });
  }

  return 'Miscellaneous';
}

/**
 * Return the user's top N most-used categories (for frontend dropdown hints).
 */
export async function getUserTopCategories(userId: string, limit = 8): Promise<string[]> {
  try {
    const rows = await prisma.transaction.groupBy({
      by: ['category'],
      where: { userId, deletedAt: null, type: 'expense' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    return rows.map(r => r.category).filter(Boolean) as string[];
  } catch (err) {
    logger.warn('CategorySuggester: getUserTopCategories failed', { err });
    return [];
  }
}
