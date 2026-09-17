import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { formatMoney } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  onAnswer: (action: KaiExecutedAction, optionIndex: number) => void;
  onDismiss: (action: KaiExecutedAction) => void;
}

export const KaiClarifyCard: React.FC<Props> = ({ action, currency, onAnswer, onDismiss }) => {
  const amount = actionAmount(action);
  const options = action.entities.options ?? [];
  const context = [amount !== undefined ? formatMoney(currency, amount) : null, action.entities.description].filter(Boolean).join(' · ');

  return (
    <div
      className="rounded-[18px] border border-purple-100 bg-white/95 backdrop-blur-md shadow-[0_6px_20px_-8px_rgba(124,58,237,0.2)] p-3 sm:p-3.5"
      data-testid="kai-clarify-card"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-purple-700">
          <Sparkles size={11} /> Quick question
        </p>
        <button
          type="button"
          onClick={() => onDismiss(action)}
          className="w-7 h-7 -mr-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          aria-label="Skip this"
        >
          <X size={14} />
        </button>
      </div>
      <p className="mt-1 text-sm sm:text-base font-bold text-slate-900 leading-snug">{action.entities.question}</p>
      {context && <p className="text-2xs sm:text-xs font-medium text-slate-400 mt-0.5 truncate">{context}</p>}
      {options.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {options.map((opt, i) => (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => onAnswer(action, i)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100 hover:bg-gradient-to-tr hover:from-[#8B5CF6] hover:to-[#7C3AED] hover:text-white hover:border-transparent transition-colors cursor-pointer active:scale-95"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-xs font-medium text-purple-700">Just say the answer — I'm still listening.</p>
      )}
    </div>
  );
};

export default KaiClarifyCard;
