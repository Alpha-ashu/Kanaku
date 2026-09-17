import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, Volume2, VolumeX, WifiOff, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useKaiSession } from '@/hooks/useKaiSession';
import { useUserDisplayName } from '@/hooks/useUserDisplayName';
import { canSpeak } from '@/services/kai/kaiSpeech';
import type { KaiExecutedAction, KaiState } from '@/services/kai/kaiTypes';
import { AIOrb, type AIOrbState } from '../ai/AIOrb';
import { KaiActionCard } from './KaiActionCard';
import { KaiAnswerCard } from './KaiAnswerCard';
import { KaiClarifyCard } from './KaiClarifyCard';
import { KaiEditSheet } from './KaiEditSheet';

const ORB_STATE: Record<KaiState, AIOrbState> = {
  idle: 'idle',
  listening: 'listening',
  processing: 'processing',
  executing: 'executing',
  completed: 'completed',
  stopping: 'processing',
  error: 'idle',
};

const QUICK_PROMPTS = [
  { title: 'Log Expense', text: 'Spent 2,000 on petrol', category: 'Transport', icon: '⛽' },
  { title: 'Split Bill', text: 'Dinner with Arun and Jijo for 4,000', category: 'Dining', icon: '🍽️' },
  { title: 'Create Goal', text: 'Create a bike goal for 1.5 lakh', category: 'Savings', icon: '🎯' },
  { title: 'Budget Check', text: 'What is my food budget this week?', category: 'Insights', icon: '📊' },
];

type Turn = { key: string; prompt: string; say?: string; actions: KaiExecutedAction[] };

/**
 * One turn per utterance: what was said (once), Kai's reply, then the cards it produced.
 * Only consecutive actions are merged, so the list keeps the order actions arrived in.
 */
const toTurns = (actions: KaiExecutedAction[]): Turn[] => {
  const turns: Turn[] = [];
  actions.forEach((action) => {
    const last = turns[turns.length - 1];
    if (last && last.actions[0].utteranceSeq === action.utteranceSeq) {
      last.actions.push(action);
      if (action.rawSegment && !last.prompt.includes(action.rawSegment)) {
        last.prompt = last.prompt ? `${last.prompt} · ${action.rawSegment}` : action.rawSegment;
      }
    } else {
      turns.push({ key: `${action.utteranceSeq}-${action.actionId}`, prompt: action.rawSegment, actions: [action] });
    }
    // Answers carry their reply inside the card; record confirmations are shown as Kai's line.
    if (action.say && action.kind !== 'query' && action.kind !== 'clarify') {
      turns[turns.length - 1].say = action.say;
    }
  });
  return turns;
};

export const KaiScreen: React.FC = () => {
  const { currency, accounts } = useApp();
  const name = useUserDisplayName();
  const kai = useKaiSession();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<KaiExecutedAction | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listening = kai.state === 'listening' || kai.state === 'processing' || kai.state === 'executing' || kai.state === 'completed';

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [kai.actions.length, kai.lastSay]);

  const statusLine = (() => {
    switch (kai.state) {
      case 'listening':
        return kai.liveTranscript || (kai.engineListening ? "Listening… I'm with you" : 'Reconnecting the mic…');
      case 'processing':
        return kai.queueLength > 0 ? `Understanding… (${kai.queueLength} more)` : 'Understanding…';
      case 'executing':
        return 'Saving into Kanaku…';
      case 'completed':
        return 'Done';
      case 'stopping':
        return 'Wrapping up…';
      case 'error':
        return kai.error ?? 'Something went wrong';
      default:
        return 'Tap the orb and just talk — or type below';
    }
  })();

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    kai.submitText(text);
    setDraft('');
  };

  const visibleActions = kai.actions.filter((a) => a.status !== 'deleted');
  const savedToday = visibleActions.filter((a) => a.status === 'saved').length;
  const turns = toTurns(visibleActions);
  const kaiLine = kai.wrapUp && kai.state === 'idle' ? kai.wrapUp : kai.lastSay;
  // With a conversation on screen, only show Kai's latest line if a turn isn't already showing it.
  const trailingLine = kaiLine && !turns.some((turn) => turn.say === kaiLine) ? kaiLine : null;

  const inputBar = (
    <div className="relative w-full flex items-center gap-2 bg-white/95 backdrop-blur-lg rounded-full py-1.5 pl-2.5 sm:pl-3 pr-1.5 border border-purple-100 shadow-[0_12px_32px_-6px_rgba(112,144,176,0.25)] shrink-0">
      {/* Mic Button */}
      <button
        type="button"
        onClick={() => void kai.toggleListening()}
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 ${
          kai.state === 'listening'
            ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/35 ring-2 ring-rose-300'
            : 'bg-purple-100/80 hover:bg-purple-200/80 text-purple-700 hover:text-purple-900'
        }`}
        aria-label={kai.state === 'listening' ? 'Stop listening' : 'Start speaking with Kai'}
        title={kai.state === 'listening' ? 'Stop voice recording' : 'Speak with Kai'}
      >
        <Mic size={17} strokeWidth={2.2} />
      </button>

      {/* Text Input */}
      <input
        type="text"
        value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            submitDraft();
          }
        }}
        placeholder='Try "spent 2000 on petrol" or "what did I spend this month?"'
        className="min-w-0 flex-1 bg-transparent py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none"
        aria-label="Tell Kai something"
      />

      {/* Send Button */}
      <button
        type="button"
        onClick={submitDraft}
        disabled={!draft.trim()}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
        aria-label="Send"
      >
        <Send size={15} strokeWidth={2.4} className="translate-x-0.5" />
      </button>
    </div>
  );

  return (
    <div className="relative z-10 flex-1 min-h-0 flex flex-col w-full max-w-2xl mx-auto h-full overflow-hidden">
      {/* ── Fixed / Stable Top Kai AI Section: Greeting + Orb + Status + Controls ── */}
      <div className="shrink-0 flex flex-col items-center pt-0.5 pb-2 border-b border-purple-100/40 w-full">
        {/* Greeting */}
        <div className="w-full text-center sm:text-left pt-0.5">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Hi, {name} 👋
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            {visibleActions.length === 0
              ? "I'm Kai, your voice financial assistant. Speak naturally or type below."
              : 'How can I help you today?'}
          </p>
        </div>

        {/* AI Orb */}
        <div className="relative pt-2 sm:pt-2.5">
          <AIOrb
            size={visibleActions.length > 0 ? 84 : 116}
            state={ORB_STATE[kai.state]}
            onClick={() => void kai.toggleListening()}
            showStatusGlow
          />
          {listening && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 text-2xs font-bold text-purple-700 shadow-xs border border-purple-100 whitespace-nowrap">
              Tap to stop
            </span>
          )}
        </div>

        {/* Status Line */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${kai.state}-${statusLine}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mt-2.5 sm:mt-3 max-w-full inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold shadow-[0_6px_18px_-8px_rgba(124,58,237,0.35)] ${
              kai.state === 'listening'
                ? 'bg-purple-100/80 border border-purple-200 text-purple-800'
                : kai.state === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-700'
                  : 'bg-white/85 border border-white text-slate-600'
            }`}
            aria-live="polite"
          >
            {kai.state === 'listening' && kai.engineListening && (
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping shrink-0" />
            )}
            <span className="truncate">{statusLine}</span>
          </motion.div>
        </AnimatePresence>

        {/* Welcome / Say line when no actions */}
        {visibleActions.length === 0 && kaiLine && (
          <p className="mt-2 text-center text-xs sm:text-sm font-medium text-slate-700 max-w-xl px-4" data-testid="kai-say">
            {kaiLine}
          </p>
        )}

        {/* Voice Controls / Badges */}
        <div className="mt-2 flex items-center gap-2">
          {canSpeak() && (
            <button
              type="button"
              onClick={() => kai.setMuted(!kai.muted)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/70 border border-white/80 text-slate-600 hover:text-purple-700 transition-colors cursor-pointer"
              aria-pressed={!kai.muted}
            >
              {kai.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              {kai.muted ? 'Voice replies off' : 'Voice replies on'}
            </button>
          )}
          {(kai.offline || kai.parser === 'regex') && (
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700"
              title={
                kai.offline
                  ? "Kai couldn't reach the server, so this device's parser understood you."
                  : 'The AI model is busy or out of its daily quota, so a simpler parser understood you. Check the cards before relying on them.'
              }
            >
              <WifiOff size={12} /> Basic mode
            </span>
          )}
        </div>
      </div>

      {/* ── Middle Section: Scrollable Conversation Viewport ("mt-5 space-y-5") ── */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-none py-3 pr-0.5 sm:pr-1"
      >
        {visibleActions.length > 0 ? (
          <div className="mt-1 space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Today's actions</h3>
              <span className="text-xs font-semibold text-slate-400">{savedToday} saved</span>
            </div>

            {turns.map((turn) => (
              <div key={turn.key} className="space-y-2.5">
                {turn.prompt && (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-[#18181B] px-4 py-2.5 sm:py-3 text-xs sm:text-sm md:text-base font-medium leading-snug text-white shadow-[0_8px_20px_-12px_rgba(15,23,42,0.7)]">
                      {turn.prompt}
                    </p>
                  </div>
                )}
                {turn.say && (
                  <p className="max-w-[92%] px-1 text-xs sm:text-sm md:text-base font-medium leading-relaxed text-slate-700">
                    {turn.say}
                  </p>
                )}
                {turn.actions.map((action) => {
                  if (action.kind === 'query') {
                    return <KaiAnswerCard key={action.actionId} action={action} currency={currency} showPrompt={false} />;
                  }
                  if (action.kind === 'clarify') {
                    return (
                      <KaiClarifyCard
                        key={action.actionId}
                        action={action}
                        currency={currency}
                        onAnswer={(a, i) => void kai.answerClarification(a.actionId, i)}
                        onDismiss={(a) => kai.dismissAction(a.actionId)}
                      />
                    );
                  }
                  return (
                    <KaiActionCard
                      key={action.actionId}
                      action={action}
                      currency={currency}
                      accounts={accounts}
                      onConfirm={(a) => {
                        kai.dismissAction(a.actionId);
                      }}
                      onEdit={setEditing}
                      onDelete={(a) => void kai.deleteAction(a.actionId)}
                      onRetry={(a) => void kai.retryAction(a.actionId)}
                    />
                  );
                })}
              </div>
            ))}

            {trailingLine && (
              <p className="max-w-[92%] px-1 text-xs sm:text-sm md:text-base font-medium leading-relaxed text-slate-700" data-testid="kai-say">
                {trailingLine}
              </p>
            )}
          </div>
        ) : (
          /* Quick Prompts to try when no actions recorded */
          <div className="mt-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Quick prompts to try</h3>
              <span className="text-xs font-semibold text-purple-600">Tap any to ask</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => kai.submitText(item.text)}
                  className="flex items-center gap-3 rounded-[20px] border border-slate-100 bg-white/95 p-3 sm:p-3.5 text-left shadow-[0_8px_24px_-12px_rgba(112,144,176,0.35)] transition-all duration-200 hover:border-purple-200 hover:shadow-md group cursor-pointer active:scale-[0.98]"
                >
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] bg-purple-50 flex items-center justify-center text-lg sm:text-xl shrink-0">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                        {item.title}
                      </span>
                      <span className="text-2xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full shrink-0">
                        {item.category}
                      </span>
                    </span>
                    <span className="block text-2xs sm:text-xs text-slate-500 mt-0.5 truncate">
                      “{item.text}”
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Position Input Bar at bottom ── */}
      <div className="shrink-0 pt-2 pb-1 w-full bg-gradient-to-t from-white/95 via-white/85 to-transparent sticky bottom-0 z-20">
        {inputBar}
      </div>

      <AnimatePresence>
        {editing && (
          <KaiEditSheet
            key={editing.actionId}
            action={editing}
            currency={currency}
            accounts={accounts}
            onClose={() => setEditing(null)}
            onSave={(patch) => {
              const id = editing.actionId;
              setEditing(null);
              void kai.editAction(id, patch).then(() => {
                toast.success('Transaction updated successfully');
              }).catch((err) => {
                toast.error(err instanceof Error ? err.message : 'Could not update transaction');
              });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default KaiScreen;
