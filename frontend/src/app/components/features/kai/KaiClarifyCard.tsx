import React from 'react';
import { HelpCircle, X } from 'lucide-react';
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
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/80 backdrop-blur-md shadow-2xs px-3.5 py-3" data-testid="kai-clarify-card">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white text-purple-600 flex items-center justify-center shrink-0">
          <HelpCircle size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{action.entities.question}</p>
          {(amount !== undefined || action.entities.description) && (
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
              {[amount !== undefined ? formatMoney(currency, amount) : null, action.entities.description].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(action)}
          className="w-7 h-7 rounded-full text-slate-400 hover:bg-white hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          aria-label="Skip this"
        >
          <X size={14} />
        </button>
      </div>
      {options.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {options.map((opt, i) => (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => onAnswer(action, i)}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-white text-purple-700 border border-purple-200 hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-colors cursor-pointer active:scale-95"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-medium text-purple-700">Just say the answer — I'm still listening.</p>
      )}
    </div>
  );
};

export default KaiClarifyCard;
