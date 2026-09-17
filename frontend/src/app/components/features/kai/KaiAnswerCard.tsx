import React from 'react';
import { Sparkles } from 'lucide-react';
import type { KaiExecutedAction } from '@/services/kai/kaiTypes';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { KaiReportCard, isReportMeta } from './KaiReportCard';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  /** KaiScreen shows the question once per utterance, so it hides the card's own copy. */
  showPrompt?: boolean;
}

export const KaiAnswerCard: React.FC<Props> = ({ action, currency, showPrompt = true }) => {
  const answer = action.answer;
  const report = answer && isReportMeta(answer.meta) ? answer.meta : null;

  return (
    <div className="space-y-2" data-testid="kai-answer-card">
      {showPrompt && (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[16px] rounded-br-sm bg-[#18181B] px-3 py-1.5 text-xs sm:text-[13px] font-medium leading-snug text-white">
            {action.rawSegment}
          </p>
        </div>
      )}
      {report ? (
        <>
          {answer?.summary && (
            <p className="max-w-[92%] px-1 text-xs sm:text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
              {answer.summary}
            </p>
          )}
          <KaiReportCard meta={report} currency={currency} />
        </>
      ) : (
        <div className="rounded-[18px] border border-purple-100/60 bg-white/95 backdrop-blur-md shadow-[0_4px_16px_-8px_rgba(112,144,176,0.16)] p-2.5 sm:p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-purple-700">
            <Sparkles size={11} /> Answer
          </p>
          <p className="mt-1 text-xs sm:text-[13px] font-medium text-slate-800 whitespace-pre-wrap leading-relaxed">
            {answer?.summary || 'I could not find an answer for that.'}
          </p>
          {answer?.transactions && answer.transactions.length > 0 && (
            <div className="mt-1.5 divide-y divide-slate-100">
              {answer.transactions.slice(0, 3).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-1 text-xs">
                  <span className="text-slate-500 truncate">{tx.description || tx.category}</span>
                  <span className={`font-bold shrink-0 ${tx.type === 'expense' ? 'text-slate-900' : 'text-emerald-600'}`}>
                    {tx.type === 'expense' ? '−' : '+'}{formatCurrencyAmount(Math.round(tx.amount), currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KaiAnswerCard;
