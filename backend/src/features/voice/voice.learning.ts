/**
 * Voice learning loop — user_voice_learning read/write.
 *
 * Write side: POST /voice/learn upserts a correction per (userId, originalText),
 * incrementing applied_count so repeated corrections weigh more.
 *
 * Read side: recent corrections are
 *   1. injected into the LLM extraction prompt as user-specific few-shot
 *      preferences (buildLearningPromptBlock), and
 *   2. applied deterministically after parsing (applyLearnedCorrections) so the
 *      regex fallback benefits even with no LLM configured — and so an LLM that
 *      ignores the preference block is still corrected.
 */
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import type { FinancialAction } from './voice.nlp';

export interface LearnedPreference {
  originalText: string;
  correctedType: string | null;
  correctedCategory: string | null;
  correctedAmount: number | null;
  appliedCount: number;
}

export interface CorrectionInput {
  originalSegment: string;
  correctedType?: string;
  correctedCategory?: string;
  correctedAmount?: number;
}

const MAX_PREFS_PER_USER = 40;

// Small TTL cache so every /voice/process call doesn't hit the DB.
const prefsCache = new Map<string, { prefs: LearnedPreference[]; expiresAt: number }>();
const PREFS_CACHE_TTL_MS = 60_000;

export const invalidateLearningCache = (userId: string) => {
  prefsCache.delete(userId);
};

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export const recordCorrection = async (userId: string, input: CorrectionInput): Promise<void> => {
  const originalText = normalise(input.originalSegment).slice(0, 2000);
  await prisma.userVoiceLearning.upsert({
    where: {
      userId_originalText: { userId, originalText },
    },
    update: {
      correctedType: input.correctedType ?? undefined,
      correctedCategory: input.correctedCategory ?? undefined,
      correctedAmount: input.correctedAmount ?? undefined,
      appliedCount: { increment: 1 },
    },
    create: {
      userId,
      originalText,
      correctedType: input.correctedType ?? null,
      correctedCategory: input.correctedCategory ?? null,
      correctedAmount: input.correctedAmount ?? null,
    },
  });
  invalidateLearningCache(userId);
};

export const getLearnedPreferences = async (userId: string): Promise<LearnedPreference[]> => {
  const cached = prefsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.prefs;

  try {
    const rows = await prisma.userVoiceLearning.findMany({
      where: { userId },
      orderBy: [{ appliedCount: 'desc' }, { createdAt: 'desc' }],
      take: MAX_PREFS_PER_USER,
    });
    const prefs: LearnedPreference[] = rows.map((r) => ({
      originalText: r.originalText,
      correctedType: r.correctedType,
      correctedCategory: r.correctedCategory,
      correctedAmount: r.correctedAmount ? Number(r.correctedAmount) : null,
      appliedCount: r.appliedCount,
    }));
    prefsCache.set(userId, { prefs, expiresAt: Date.now() + PREFS_CACHE_TTL_MS });
    return prefs;
  } catch (err: any) {
    // Table missing (migration not applied yet) or DB blip — degrade gracefully.
    logger.warn('Voice learning: preference lookup failed', { error: err.message });
    return [];
  }
};

/**
 * Few-shot personalization block appended to the LLM extraction prompt.
 * Only category/type corrections are useful as generalizable preferences.
 */
export const buildLearningPromptBlock = (prefs: LearnedPreference[]): string => {
  const usable = prefs.filter((p) => p.correctedCategory || p.correctedType).slice(0, 15);
  if (usable.length === 0) return '';

  const lines = usable.map((p) => {
    const parts: string[] = [];
    if (p.correctedCategory) parts.push(`category "${p.correctedCategory}"`);
    if (p.correctedType) parts.push(`type "${p.correctedType}"`);
    return `  - When the user says something like "${p.originalText.slice(0, 80)}", use ${parts.join(' and ')}.`;
  });

  return `\nUSER-SPECIFIC PREFERENCES (learned from this user's past corrections — they override the default category mapping):\n${lines.join('\n')}\n`;
};

/** Token-overlap similarity — cheap, deterministic, good enough for short voice segments. */
const similarity = (a: string, b: string): number => {
  const ta = new Set(normalise(a).split(' ').filter((w) => w.length > 2));
  const tb = new Set(normalise(b).split(' ').filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.min(ta.size, tb.size);
};

const MATCH_THRESHOLD = 0.6;

/**
 * Deterministically apply learned corrections to parsed actions.
 * A preference matches when its remembered phrase overlaps the action's raw
 * segment or description strongly enough; matched corrections override the
 * parser's category/type and lift confidence above the review threshold.
 */
export const applyLearnedCorrections = (
  actions: FinancialAction[],
  prefs: LearnedPreference[],
): FinancialAction[] => {
  if (prefs.length === 0 || actions.length === 0) return actions;

  return actions.map((action) => {
    const haystacks = [action.rawSegment, action.entities.description ?? ''].filter(Boolean);
    let best: { pref: LearnedPreference; score: number } | null = null;

    for (const pref of prefs) {
      for (const hay of haystacks) {
        const score = similarity(pref.originalText, hay);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { pref, score };
        }
      }
    }

    if (!best) return action;

    const corrected = { ...action, entities: { ...action.entities } };
    if (best.pref.correctedCategory) corrected.entities.category = best.pref.correctedCategory;
    if (best.pref.correctedType) corrected.type = best.pref.correctedType as FinancialAction['type'];
    corrected.confidence = Math.max(action.confidence, 0.9);
    corrected.requiresReview = false;
    logger.debug('Voice learning: applied correction', {
      segment: action.rawSegment.slice(0, 60),
      category: best.pref.correctedCategory,
      score: Number(best.score.toFixed(2)),
    });
    return corrected;
  });
};
