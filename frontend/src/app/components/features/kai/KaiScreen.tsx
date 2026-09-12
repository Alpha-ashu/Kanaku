import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, Volume2, VolumeX, WifiOff } from 'lucide-react';
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

export const KaiScreen: React.FC = () => {
  const { currency } = useApp();
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

  return (
    <div
      ref={listRef}
      className="relative z-10 flex-1 flex flex-col w-full max-w-4xl xl:max-w-5xl mx-auto overflow-y-auto scrollbar-none"
      style={{ paddingBottom: 'calc(var(--bottom-reserved-space, 0px) + 16px)' }}
    >
      {/* Greeting */}
      <div className="pt-1 pb-2">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Hi, {name} 👋
        </h2>
        <p className="text-sm sm:text-base text-slate-600 font-medium mt-0.5">
          {visibleActions.length === 0 ? "I'm Kai, your voice financial assistant. Speak naturally or type below." : 'How can I help you today?'}
        </p>
      </div>

      {/* Orb + status */}
      <div className="flex flex-col items-center py-4 sm:py-6 shrink-0">
        <div className="relative">
          <AIOrb size="lg" state={ORB_STATE[kai.state]} onClick={() => void kai.toggleListening()} showStatusGlow />
          {listening && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 text-[10px] font-bold text-purple-700 shadow-xs border border-purple-100 whitespace-nowrap">
              Tap to stop
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${kai.state}-${statusLine}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mt-4 max-w-full inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold shadow-xs ${
              kai.state === 'listening'
                ? 'bg-purple-100/80 border border-purple-200 text-purple-800'
                : kai.state === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-700'
                  : 'bg-white/80 border border-white/60 text-slate-600'
            }`}
            aria-live="polite"
          >
            {kai.state === 'listening' && kai.engineListening && <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping shrink-0" />}
            <span className="truncate">{statusLine}</span>
          </motion.div>
        </AnimatePresence>

        {(kai.lastSay || kai.wrapUp) && (
          <p className="mt-3 text-center text-sm sm:text-base font-medium text-slate-700 max-w-xl px-4" data-testid="kai-say">
            {kai.wrapUp && kai.state === 'idle' ? kai.wrapUp : kai.lastSay}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {canSpeak() && (
            <button
              type="button"
              onClick={() => kai.setMuted(!kai.muted)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/70 border border-white/80 text-slate-600 hover:text-purple-700 transition-colors cursor-pointer"
              aria-pressed={!kai.muted}
            >
              {kai.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              {kai.muted ? 'Voice replies off' : 'Voice replies on'}
            </button>
          )}
          {kai.offline && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
              <WifiOff size={12} /> Basic mode
            </span>
          )}
        </div>
      </div>

      {/* Typed input — same pipeline as speech */}
      <div className="relative w-full max-w-2xl sm:max-w-3xl mx-auto flex items-center bg-white/95 backdrop-blur-lg rounded-full px-3 py-1.5 border border-purple-100 shadow-[0_12px_32px_-4px_rgba(112,144,176,0.14)] shrink-0">
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
          className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none"
          aria-label="Tell Kai something"
        />
        <button
          type="button"
          onClick={submitDraft}
          disabled={!draft.trim()}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
          aria-label="Send"
        >
          <Send size={14} strokeWidth={2.4} className="translate-x-0.5" />
        </button>
      </div>

      {/* Actions */}
      {visibleActions.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Today's actions</h3>
            <span className="text-xs font-semibold text-slate-400">{savedToday} saved</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleActions.map((action) => {
              if (action.kind === 'query') return <KaiAnswerCard key={action.actionId} action={action} currency={currency} />;
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
                  onEdit={setEditing}
                  onDelete={(a) => void kai.deleteAction(a.actionId)}
                  onRetry={(a) => void kai.retryAction(a.actionId)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Prompts to try when no actions recorded */}
      {visibleActions.length === 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Quick prompts to try</h3>
            <span className="text-[11px] font-semibold text-purple-600">Tap any to ask</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Log Expense', text: 'Spent 2,000 on petrol', category: 'Transport', icon: '⛽' },
              { title: 'Split Bill', text: 'Dinner with Arun and Jijo for 4,000', category: 'Dining', icon: '🍽️' },
              { title: 'Create Goal', text: 'Create a bike goal for 1.5 lakh', category: 'Savings', icon: '🎯' },
              { title: 'Budget Check', text: 'What is my food budget this week?', category: 'Insights', icon: '📊' },
            ].map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => kai.submitText(item.text)}
                className="rounded-2xl border border-purple-100/90 bg-white/75 hover:bg-white backdrop-blur-sm p-4 text-left transition-all duration-200 hover:shadow-md hover:border-purple-200 group cursor-pointer active:scale-95"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-full border border-purple-200/50">
                    {item.category}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  “{item.text}”
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <KaiEditSheet
            key={editing.actionId}
            action={editing}
            currency={currency}
            onClose={() => setEditing(null)}
            onSave={(patch) => {
              const id = editing.actionId;
              setEditing(null);
              void kai.editAction(id, patch);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default KaiScreen;
