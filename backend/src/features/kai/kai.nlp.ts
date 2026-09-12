/**
 * Kai understanding — session-aware voice NLP.
 *
 * Same provider ladder as the chat assistant (completeWithLLM: Gemini → Groq →
 * OpenRouter, bounded by a timeout), the voice extraction rules, plus a
 * SESSION CONTEXT block so corrections ("make it 4,500"), references ("that
 * 3,000") and follow-ups ("set the target date…") resolve against what the
 * user already said. Queries are answered in the same call.
 *
 * Offline: the voice regex pipeline for money actions, the chat heuristics for
 * todos/queries, and a couple of tiny patterns for corrections. Anything the
 * heuristics cannot place becomes a `clarify` — never a guessed expense.
 */

import type {
  KaiAction,
  KaiActionEntities,
  KaiActionKind,
  KaiClarifyOption,
  KaiEntityPatch,
  KaiParserSource,
  KaiSessionContext,
  VoiceActionType,
} from '@kanaku/shared';
import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { completeWithLLM, stripJsonFence } from '../ai/chat.llm';
import { classifyOffline } from '../ai/chat.controller';
import { executeFinancialQuery, normaliseDateInput, toQueryParams } from '../ai/financial-query-engine';
import { parseIndianAmount, stripIndianAmounts } from '../ai/indian-number';
import { cleanTranscript, detectLanguage, regexPipeline } from '../voice/voice.nlp';
import { applyLearnedCorrections, buildLearningPromptBlock, getLearnedPreferences } from '../voice/voice.learning';
import { buildKaiPrompt } from './kai.prompt';

export const MONEY_KINDS: KaiActionKind[] = [
  'expense', 'income', 'transfer', 'loan_borrow', 'loan_lend', 'investment', 'group_expense', 'subscription',
];
const ALL_KINDS: KaiActionKind[] = [
  ...MONEY_KINDS, 'goal', 'todo', 'goal_update', 'update_previous', 'clarify', 'query',
];
const PRIORITIES = ['low', 'medium', 'high'] as const;
const RECURRENCES = ['monthly', 'yearly', 'weekly', 'daily'] as const;
const EXPENSE_MODES = ['individual', 'group', 'loan'] as const;

export interface KaiUnderstandInput {
  transcript: string;
  sessionId: string;
  utteranceSeq: number;
  context?: KaiSessionContext;
}

export interface KaiUnderstandResult {
  actions: KaiAction[];
  parser: KaiParserSource;
  language: string;
  cleaned: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);

const str = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, max) : undefined;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return allowed.find((a) => a === t);
};

const nameList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const names = v
    .map((m) => String(m).trim())
    .filter((m) => m.length > 0 && m.length <= 60 && !/^(me|myself|i|we|us)$/i.test(m));
  return names.length > 0 ? Array.from(new Set(names)).slice(0, 20) : undefined;
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const makeActionId = (sessionId: string, seq: number, index: number) => `kai:${sessionId}:${seq}:${index}`;

function clarifyAction(
  rawSegment: string,
  question: string,
  options: KaiClarifyOption[],
  draft: KaiActionEntities = {},
): Omit<KaiAction, 'actionId'> {
  return {
    kind: 'clarify',
    rawSegment,
    entities: { ...draft, question, options },
    confidence: 1,
    requiresReview: true,
    say: question,
  };
}

// ─── Normalisation (shared by every provider and the offline path) ────────────

interface RawKaiAction {
  kind?: string;
  type?: string;
  amount?: unknown;
  category?: unknown;
  description?: unknown;
  person?: unknown;
  members?: unknown;
  merchant?: unknown;
  date?: unknown;
  recurrence?: unknown;
  expenseMode?: unknown;
  title?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  goalName?: unknown;
  targetAmount?: unknown;
  targetDate?: unknown;
  targetActionId?: unknown;
  patch?: unknown;
  question?: unknown;
  options?: unknown;
  queryType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  keyword?: unknown;
  limit?: unknown;
  confidence?: unknown;
  say?: unknown;
}

function normalisePatch(v: unknown): KaiEntityPatch | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const p = v as Record<string, unknown>;
  const patch: KaiEntityPatch = {};
  const chosen = Number(p.chosenOption ?? p.option ?? p.optionIndex);
  if (Number.isInteger(chosen) && chosen >= 1 && chosen <= 4) patch.chosenOption = chosen;
  const kind = oneOf(p.kind ?? p.type, ALL_KINDS);
  if (kind && kind !== 'update_previous' && kind !== 'clarify' && kind !== 'query') patch.kind = kind;
  const amount = num(p.amount);
  if (amount) patch.amount = amount;
  const category = str(p.category); if (category) patch.category = category;
  const description = str(p.description); if (description) patch.description = description;
  const person = str(p.person, 60); if (person) patch.person = person;
  const merchant = str(p.merchant); if (merchant) patch.merchant = merchant;
  const members = nameList(p.members); if (members) patch.members = members;
  const date = normaliseDateInput(p.date); if (date) patch.date = date;
  const dueDate = normaliseDateInput(p.dueDate); if (dueDate) patch.dueDate = dueDate;
  const targetDate = normaliseDateInput(p.targetDate); if (targetDate) patch.targetDate = targetDate;
  const targetAmount = num(p.targetAmount); if (targetAmount) patch.targetAmount = targetAmount;
  const goalName = str(p.goalName, 80); if (goalName) patch.goalName = goalName;
  const title = str(p.title); if (title) patch.title = title;
  const priority = oneOf(p.priority, PRIORITIES); if (priority) patch.priority = priority;
  const expenseMode = oneOf(p.expenseMode, EXPENSE_MODES); if (expenseMode) patch.expenseMode = expenseMode;
  const recurrence = oneOf(p.recurrence, RECURRENCES); if (recurrence) patch.recurrence = recurrence;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function normaliseOptions(v: unknown): KaiClarifyOption[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const options = v
    .map((o): KaiClarifyOption | null => {
      if (typeof o !== 'object' || o === null) return null;
      const label = str((o as Record<string, unknown>).label, 60);
      const patch = normalisePatch((o as Record<string, unknown>).patch) ?? {};
      return label ? { label, patch } : null;
    })
    .filter((o): o is KaiClarifyOption => o !== null)
    .slice(0, 4);
  return options.length > 0 ? options : undefined;
}

function resolveTargetActionId(raw: unknown, context: KaiSessionContext | undefined): string | undefined {
  const recent = context?.recentActions ?? [];
  const wanted = str(raw, 120);
  if (!wanted || wanted.toLowerCase() === 'last' || wanted.toLowerCase() === 'previous') {
    return context?.pendingClarification?.actionId ?? recent[0]?.actionId;
  }
  return recent.some((a) => a.actionId === wanted) || context?.pendingClarification?.actionId === wanted
    ? wanted
    : undefined;
}

function resolveGoalName(raw: unknown, context: KaiSessionContext | undefined): string | undefined {
  const wanted = str(raw, 80);
  const known = context?.knownGoals ?? [];
  const recentGoal = context?.recentActions.find((a) => a.kind === 'goal' || a.kind === 'goal_update');
  if (wanted) {
    const lower = wanted.toLowerCase();
    const match = known.find((g) => g.toLowerCase() === lower)
      ?? known.find((g) => g.toLowerCase().includes(lower) || lower.includes(g.toLowerCase()));
    if (match) return match;
    if (recentGoal?.goalName && recentGoal.goalName.toLowerCase().includes(lower)) return recentGoal.goalName;
    return wanted;
  }
  return recentGoal?.goalName ?? (known.length === 1 ? known[0] : undefined);
}

/**
 * Validate one raw LLM/offline action. Returns null when there is nothing
 * worth surfacing; ambiguous or incomplete money actions come back as `clarify`.
 */
export function normaliseKaiAction(
  raw: RawKaiAction,
  transcript: string,
  context: KaiSessionContext | undefined,
  threshold: number,
): Omit<KaiAction, 'actionId'> | null {
  const kind = oneOf(raw.kind ?? raw.type, ALL_KINDS);
  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.85;
  const say = str(raw.say, 200);

  const base: KaiActionEntities = {};
  const amount = num(raw.amount);
  if (amount) base.amount = amount;
  const category = str(raw.category); if (category) base.category = category;
  const description = str(raw.description); if (description) base.description = description;
  const person = str(raw.person, 60); if (person) base.person = person;
  const merchant = str(raw.merchant); if (merchant) base.merchant = merchant;
  const members = nameList(raw.members); if (members) base.members = members;
  const date = normaliseDateInput(raw.date); if (date) base.date = date;
  const recurrence = oneOf(raw.recurrence, RECURRENCES); if (recurrence) base.recurrence = recurrence;
  const expenseMode = oneOf(raw.expenseMode, EXPENSE_MODES); if (expenseMode) base.expenseMode = expenseMode;

  if (!kind) {
    return clarifyAction(transcript, "I didn't quite get that. Could you say it again with the amount and what it was for?", [], base);
  }

  if (kind === 'clarify') {
    const question = str(raw.question, 200) ?? 'Could you clarify what you\'d like me to record?';
    return clarifyAction(transcript, question, normaliseOptions(raw.options) ?? [], base);
  }

  if (kind === 'query') {
    const queryType = str(raw.queryType, 40)?.toUpperCase();
    const entities: KaiActionEntities = {
      ...base,
      queryType,
      keyword: str(raw.keyword),
      startDate: normaliseDateInput(raw.startDate),
      endDate: normaliseDateInput(raw.endDate),
      limit: typeof raw.limit === 'number' ? raw.limit : undefined,
    };
    return { kind, rawSegment: transcript, entities, confidence, requiresReview: false, say };
  }

  if (kind === 'update_previous') {
    const targetActionId = resolveTargetActionId(raw.targetActionId, context);
    const patch = normalisePatch(raw.patch);
    if (!targetActionId) {
      return clarifyAction(transcript, 'Which entry should I change?', [], base);
    }
    if (!patch) {
      return clarifyAction(transcript, 'What should I change it to?', [], { ...base, targetActionId });
    }
    return {
      kind,
      rawSegment: transcript,
      entities: { targetActionId, patch },
      confidence,
      requiresReview: false,
      say,
    };
  }

  if (kind === 'todo') {
    const title = str(raw.title) ?? str(raw.description);
    if (!title) return clarifyAction(transcript, 'What should I remind you about?', [], base);
    const entities: KaiActionEntities = {
      title: titleCase(title),
      dueDate: normaliseDateInput(raw.dueDate) ?? base.date,
      priority: oneOf(raw.priority, PRIORITIES) ?? 'medium',
      description: base.description,
    };
    return { kind, rawSegment: transcript, entities, confidence, requiresReview: false, say };
  }

  if (kind === 'goal_update') {
    const goalName = resolveGoalName(raw.goalName, context);
    const targetDate = normaliseDateInput(raw.targetDate) ?? base.date;
    const targetAmount = num(raw.targetAmount) ?? amount;
    if (!goalName) return clarifyAction(transcript, 'Which goal should I update?', [], base);
    if (!targetDate && !targetAmount) {
      return clarifyAction(transcript, `What should I change on the ${goalName} goal — the target date or the amount?`, [], { goalName });
    }
    return {
      kind,
      rawSegment: transcript,
      entities: { goalName, targetDate, targetAmount },
      confidence,
      requiresReview: false,
      say,
    };
  }

  if (kind === 'goal') {
    const goalName = str(raw.goalName, 80) ?? base.description;
    const targetAmount = num(raw.targetAmount) ?? amount;
    if (!goalName) return clarifyAction(transcript, 'What is this goal for?', [], base);
    if (!targetAmount) {
      return clarifyAction(transcript, `How much do you want to save for ${goalName}?`, [], { goalName, category: 'Savings' });
    }
    return {
      kind,
      rawSegment: transcript,
      entities: {
        ...base,
        goalName: titleCase(goalName),
        targetAmount,
        amount: targetAmount,
        targetDate: normaliseDateInput(raw.targetDate) ?? base.date,
        category: base.category ?? 'Savings',
        description: base.description ?? titleCase(goalName),
      },
      confidence,
      requiresReview: confidence < threshold,
      say,
    };
  }

  // Money kinds
  if (!amount) {
    const what = base.description ? ` for ${base.description}` : '';
    return clarifyAction(transcript, `How much was it${what}?`, [], { ...base, patch: { kind } });
  }
  if (confidence < 0.6) {
    return clarifyAction(
      transcript,
      `Should I record ₹${amount}${base.description ? ` for ${base.description}` : ''} as an ${kind.replace('_', ' ')}?`,
      [{ label: 'Yes, save it', patch: { kind } }],
      base,
    );
  }
  if (kind === 'group_expense' && !members) {
    return clarifyAction(transcript, 'Who was this shared with?', [], { ...base, patch: { kind } });
  }
  if ((kind === 'loan_borrow' || kind === 'loan_lend') && !person) {
    return clarifyAction(transcript, kind === 'loan_borrow' ? 'Who did you borrow it from?' : 'Who did you lend it to?', [], { ...base, patch: { kind } });
  }
  const entities: KaiActionEntities = {
    ...base,
    category: base.category ?? (kind === 'loan_borrow' || kind === 'loan_lend' ? 'Loans' : undefined),
    recurrence: base.recurrence ?? (kind === 'subscription' ? 'monthly' : undefined),
    splitType: kind === 'group_expense' ? 'equal' : undefined,
    expenseMode: kind === 'group_expense' ? 'group' : base.expenseMode,
  };
  return { kind, rawSegment: transcript, entities, confidence, requiresReview: confidence < threshold, say };
}

function withIds(actions: Array<Omit<KaiAction, 'actionId'>>, sessionId: string, seq: number): KaiAction[] {
  return actions.map((a, i) => ({ actionId: makeActionId(sessionId, seq, i), ...a }));
}

function parseActions(text: string): RawKaiAction[] {
  try {
    const parsed = JSON.parse(stripJsonFence(text));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.actions)) return parsed.actions;
    if (parsed && typeof parsed === 'object' && (parsed.kind || parsed.type)) return [parsed];
    return [];
  } catch {
    logger.warn('Kai NLP: JSON parse failed', { text: text.slice(0, 200) });
    return [];
  }
}

// ─── Offline fallback ─────────────────────────────────────────────────────────

const ORDINALS = ['first', 'second', 'third', 'fourth'];

/** Which option (0-based) a spoken answer picks: by number, ordinal, or by echoing the label. -1 when none. */
export function matchClarificationOption(utterance: string, options: string[]): number {
  const lower = utterance.toLowerCase().trim();
  for (let i = 0; i < options.length; i += 1) {
    if (new RegExp(`\\b(?:option\\s+)?${i + 1}\\b`).test(lower) || new RegExp(`\\b${ORDINALS[i]}\\b`).test(lower)) return i;
  }
  const scored = options.map((label, i) => {
    const words = label.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['with', 'the', 'and'].includes(w));
    const hits = words.filter((w) => lower.includes(w)).length;
    return { i, score: words.length ? hits / words.length : 0 };
  }).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= 0.5 ? scored[0].i : -1;
}

const QUESTION_RE = /^(what|how|show|give|tell|when|which|where|who|do i|did i|am i|can you|is my|are my)\b|\?\s*$/i;
export const looksLikeQuestion = (text: string): boolean => QUESTION_RE.test(text.trim());

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "December 31st 2026", "31 December", "tomorrow", "next monday" → YYYY-MM-DD */
export function parseSpokenDate(text: string, today = new Date()): string | undefined {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return today.toISOString().slice(0, 10);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const monthRe = MONTHS.join('|');
  const m1 = lower.match(new RegExp(`\\b(${monthRe})\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`));
  const m2 = lower.match(new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthRe})(?:,?\\s+(\\d{4}))?`));
  const hit = m1 ? { month: m1[1], day: m1[2], year: m1[3] } : m2 ? { month: m2[2], day: m2[1], year: m2[3] } : null;
  if (!hit) return undefined;
  const monthIdx = MONTHS.indexOf(hit.month);
  const day = parseInt(hit.day, 10);
  if (monthIdx < 0 || day < 1 || day > 31) return undefined;
  let year = hit.year ? parseInt(hit.year, 10) : today.getFullYear();
  const candidate = new Date(year, monthIdx, day);
  if (!hit.year && candidate < today) year += 1;
  return new Date(Date.UTC(year, monthIdx, day)).toISOString().slice(0, 10);
}

const SPLIT_CUE = /\b(split|share|shared|sharing|group|we|us|together|each|between|among)\b/i;

export function offlineActions(
  cleaned: string,
  context: KaiSessionContext | undefined,
  threshold: number,
): Array<Omit<KaiAction, 'actionId'>> {
  const lower = cleaned.toLowerCase();
  const amount = parseIndianAmount(cleaned);

  // Corrections
  const correction = lower.match(/\b(?:actually\s+)?(?:make|change|update|set)\s+(?:it|that|the amount)\s+(?:to\s+)?(.+)$/);
  if (correction && context?.recentActions.length) {
    const newAmount = parseIndianAmount(correction[1]);
    const newDate = parseSpokenDate(correction[1]);
    const patch: KaiEntityPatch = {};
    if (newAmount) patch.amount = newAmount;
    if (newDate) patch.date = newDate;
    if (Object.keys(patch).length) {
      return [normaliseKaiAction({ kind: 'update_previous', targetActionId: 'last', patch, confidence: 0.8 }, cleaned, context, threshold)!];
    }
  }

  // Pending clarification answered by number or option words
  if (context?.pendingClarification) {
    const idx = matchClarificationOption(lower, context.pendingClarification.options);
    if (idx >= 0) {
      return [{
        kind: 'update_previous',
        rawSegment: cleaned,
        entities: { targetActionId: context.pendingClarification.actionId, patch: { chosenOption: idx + 1 } },
        confidence: 0.8,
        requiresReview: false,
      }];
    }
  }

  // Goal target date follow-up
  if (/\btarget date\b|\bdeadline\b|\bby\s+(?:december|january|february|march|april|may|june|july|august|september|october|november)\b/.test(lower)) {
    const targetDate = parseSpokenDate(cleaned);
    if (targetDate) {
      return [normaliseKaiAction({ kind: 'goal_update', targetDate, confidence: 0.75 }, cleaned, context, threshold)!];
    }
  }

  // Todos / queries via the chat heuristics
  const chat = classifyOffline(cleaned);
  if (chat.intent === 'task' && chat.taskType === 'add_todo') {
    return [normaliseKaiAction({ kind: 'todo', title: chat.title, dueDate: parseSpokenDate(cleaned) ?? chat.date, priority: chat.priority, confidence: 0.8 }, cleaned, context, threshold)!];
  }
  if (chat.intent === 'task' && chat.taskType === 'create_goal') {
    return [normaliseKaiAction({ kind: 'goal', goalName: chat.title, targetAmount: chat.amount ?? amount, targetDate: parseSpokenDate(cleaned), confidence: 0.75 }, cleaned, context, threshold)!];
  }
  if (chat.intent === 'query' || chat.intent === 'overview') {
    return [normaliseKaiAction({
      kind: 'query',
      queryType: chat.intent === 'overview' ? 'DATE_RANGE_SUMMARY' : chat.queryType,
      category: chat.category,
      person: chat.person,
      startDate: chat.startDate,
      endDate: chat.endDate,
      limit: chat.limit,
      confidence: 0.75,
    }, cleaned, context, threshold)!];
  }

  // Money actions via the voice regex pipeline
  const voice = regexPipeline(cleaned, threshold);
  const out: Array<Omit<KaiAction, 'actionId'>> = [];
  for (const a of voice) {
    const segmentAmount = a.entities.amount ?? parseIndianAmount(a.rawSegment);
    // "spent 5000 with Jijo": one companion and no split cue — the regex calls it a
    // group expense, but it may just as well be a personal spend. Ask.
    const singleCompanion = a.type === 'group_expense' && (a.entities.members?.length ?? 0) === 1 && !SPLIT_CUE.test(a.rawSegment);
    const ambiguousPerson = singleCompanion || (a.type === 'expense' && /\bwith\s+[A-Z]/.test(a.rawSegment) && !(a.entities.members?.length));
    if (ambiguousPerson) {
      const who = a.entities.members?.[0] ?? a.rawSegment.match(/\bwith\s+([A-Z][a-z]+)/)?.[1] ?? 'them';
      out.push(clarifyAction(a.rawSegment,
        `Should I record this as a shared expense with ${who} or your personal expense?`,
        [
          { label: `Shared with ${who}`, patch: { kind: 'group_expense', members: [who] } },
          { label: 'My personal expense', patch: { kind: 'expense', expenseMode: 'individual' } },
        ],
        { amount: segmentAmount, description: /^[A-Z][a-z]+$/.test(a.entities.description ?? '') ? undefined : (a.entities.description || stripIndianAmounts(a.rawSegment).slice(0, 60)) }));
      continue;
    }
    const normalised = normaliseKaiAction({
      kind: a.type === 'unknown' ? undefined : a.type,
      amount: segmentAmount,
      category: a.entities.category,
      description: a.entities.description,
      person: a.entities.person,
      members: a.entities.members,
      merchant: a.entities.merchant,
      date: a.entities.date,
      goalName: a.type === 'goal' ? a.entities.description : undefined,
      targetAmount: a.type === 'goal' ? (a.entities.goalTarget ?? segmentAmount) : undefined,
      confidence: a.confidence,
    }, a.rawSegment, context, threshold);
    if (normalised) out.push(normalised);
  }
  if (out.length === 0 && amount) {
    out.push(clarifyAction(cleaned, `I heard ₹${amount} — what was it for?`, [], { amount }));
  }
  return out;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function understandKai(userId: string, input: KaiUnderstandInput): Promise<KaiUnderstandResult> {
  const config = await getAIConfigurations();
  const threshold = config.voice.autoSaveThreshold ?? 0.7;
  const cleaned = cleanTranscript(input.transcript);
  const language = detectLanguage(cleaned);
  const context = input.context;

  const prefs = await getLearnedPreferences(userId);
  const learningBlock = buildLearningPromptBlock(prefs);

  let normalised: Array<Omit<KaiAction, 'actionId'>> | null = null;
  let parser: KaiParserSource = 'regex';

  if (config.voice.enabled && cleaned.length > 0) {
    const llm = await completeWithLLM(buildKaiPrompt(cleaned, context, learningBlock, TODAY()), {
      json: true,
      maxTokens: 1024,
      temperature: 0.1,
    });
    if (llm) {
      const raw = parseActions(llm.text);
      normalised = raw
        .map((r) => normaliseKaiAction(r, cleaned, context, threshold))
        .filter((a): a is Omit<KaiAction, 'actionId'> => a !== null);
      parser = llm.parser;
      logger.info('Kai NLP: LLM extracted actions', { parser, count: normalised.length, kinds: normalised.map((a) => a.kind) });
    }
  }

  if (normalised === null) {
    normalised = offlineActions(cleaned, context, threshold);
    parser = 'regex';
    logger.info('Kai NLP: offline fallback', { count: normalised.length, kinds: normalised.map((a) => a.kind) });
  } else if (normalised.length === 0 && looksLikeQuestion(cleaned)) {
    // The LLM occasionally files a plain question under "small talk"; questions always deserve an answer.
    const fallback = offlineActions(cleaned, context, threshold).filter((a) => a.kind === 'query');
    if (fallback.length > 0) {
      normalised = fallback;
      logger.info('Kai NLP: LLM returned no action for a question — answered via heuristics');
    }
  }

  // Learned corrections apply to money kinds exactly as they do for /voice/process.
  if (prefs.length > 0) {
    normalised = normalised.map((a) => {
      if (!MONEY_KINDS.includes(a.kind)) return a;
      const [corrected] = applyLearnedCorrections([{
        type: a.kind as VoiceActionType,
        rawSegment: a.rawSegment,
        entities: a.entities,
        confidence: a.confidence,
        requiresReview: a.requiresReview,
      }], prefs);
      return { ...a, kind: corrected.type as KaiActionKind, entities: corrected.entities as KaiActionEntities, confidence: corrected.confidence, requiresReview: corrected.requiresReview };
    });
  }

  const actions = withIds(normalised, input.sessionId, input.utteranceSeq);

  // Answer queries in the same round-trip.
  await Promise.all(actions.map(async (a) => {
    if (a.kind !== 'query') return;
    const result = await executeFinancialQuery(userId, toQueryParams(a.entities));
    a.answer = { summary: result.summary, meta: result.meta, transactions: result.transactions };
  }));

  return { actions, parser, language, cleaned };
}
