/**
 * One spoken utterance → typed Kai actions. Online this is POST /kai/understand
 * (LLM with session context, queries answered in the same call). Offline the
 * local sentence parser still turns plain money statements into records;
 * anything it cannot place becomes a clarification instead of a guess.
 */
import type { KaiAction, KaiParserSource, KaiUnderstandRequest } from '@kanaku/shared';
import { backendService } from '@/lib/backend-api';
import { parseTranscriptLocally } from '@/services/voiceFinancialService';
import { isMoneyKind, type KaiActionKind } from './kaiTypes';

export interface UnderstandResult {
  actions: KaiAction[];
  parser: KaiParserSource | 'local';
  offline: boolean;
}

const actionId = (req: KaiUnderstandRequest, index: number) => `kai:${req.sessionId}:${req.utteranceSeq}:${index}`;

const clarify = (req: KaiUnderstandRequest, index: number, rawSegment: string, question: string): KaiAction => ({
  actionId: actionId(req, index),
  kind: 'clarify',
  rawSegment,
  entities: { question, options: [] },
  confidence: 1,
  requiresReview: true,
  say: question,
});

export function localFallback(req: KaiUnderstandRequest): KaiAction[] {
  const { actions } = parseTranscriptLocally(req.transcript);
  const out: KaiAction[] = [];

  for (const a of actions) {
    const index = out.length;
    const kind = a.type as KaiActionKind | 'task' | 'bill_scan' | 'query' | 'unknown';
    const amount = a.entities.amount;

    if (kind === 'task' && a.entities.task?.type === 'add_todo') {
      out.push({
        actionId: actionId(req, index),
        kind: 'todo',
        rawSegment: a.rawSegment,
        entities: { title: a.entities.task.title, dueDate: a.entities.task.date, priority: a.entities.task.priority ?? 'medium' },
        confidence: a.confidence,
        requiresReview: false,
      });
      continue;
    }
    if (kind === 'query') {
      out.push(clarify(req, index, a.rawSegment, "I can't look that up while offline — I'll answer once you're back online."));
      continue;
    }
    if (kind === 'goal') {
      const target = a.entities.goalTarget ?? amount;
      if (!target) {
        out.push(clarify(req, index, a.rawSegment, 'How much do you want to save for that goal?'));
        continue;
      }
      out.push({
        actionId: actionId(req, index),
        kind: 'goal',
        rawSegment: a.rawSegment,
        entities: { ...a.entities, goalName: a.entities.description, targetAmount: target, amount: target, category: 'Savings' },
        confidence: a.confidence,
        requiresReview: a.requiresReview,
      });
      continue;
    }
    if (kind === 'unknown' || kind === 'bill_scan' || kind === 'task' || !isMoneyKind(kind as KaiActionKind)) {
      out.push(clarify(req, index, a.rawSegment, "I'm offline and didn't quite get that. Try something like \"spent 500 on petrol\"."));
      continue;
    }
    if (!amount) {
      out.push(clarify(req, index, a.rawSegment, `How much was it${a.entities.description ? ` for ${a.entities.description}` : ''}?`));
      continue;
    }
    out.push({
      actionId: actionId(req, index),
      kind: kind as KaiActionKind,
      rawSegment: a.rawSegment,
      entities: { ...a.entities },
      confidence: a.confidence,
      requiresReview: a.requiresReview,
    });
  }

  if (out.length === 0) {
    out.push(clarify(req, 0, req.transcript, "I'm offline and couldn't understand that. Try \"spent 500 on petrol\" or \"borrowed 3000 from Arun\"."));
  }
  return out;
}

export async function understandUtterance(req: KaiUnderstandRequest): Promise<UnderstandResult> {
  try {
    const res = await backendService.understandKai(req);
    return { actions: res.actions ?? [], parser: res.parser, offline: false };
  } catch (err) {
    console.warn('[Kai] understand request failed — using local parser', err);
    return { actions: localFallback(req), parser: 'local', offline: true };
  }
}
