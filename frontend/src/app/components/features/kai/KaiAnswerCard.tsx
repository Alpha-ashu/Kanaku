import React from 'react';
import { BarChart3 } from 'lucide-react';
import type { KaiExecutedAction } from '@/services/kai/kaiTypes';
import { KaiReportCard, isReportMeta } from './KaiReportCard';

interface Props {
  action: KaiExecutedAction;
  currency: string;
}

export const KaiAnswerCard: React.FC<Props> = ({ action, currency }) => {
  const answer = action.answer;
  const report = answer && isReportMeta(answer.meta) ? answer.meta : null;
  return (
    <div className="space-y-2" data-testid="kai-answer-card">
      <div className="flex justify-end">
        <p className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-xs bg-[#EFEBFE] text-xs font-medium text-slate-800">
          “{action.rawSegment}”
        </p>
      </div>
      {report ? (
        <KaiReportCard meta={report} currency={currency} />
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-md shadow-2xs px-3.5 py-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <BarChart3 size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap leading-relaxed">
                {answer?.summary || 'I could not find an answer for that.'}
              </p>
              {answer?.transactions && answer.transactions.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {answer.transactions.slice(0, 3).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <span className="font-semibold text-slate-800 truncate">{tx.description || tx.category}</span>
                      <span className={`font-bold shrink-0 ${tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {tx.type === 'expense' ? '−' : '+'}{currency} {Math.round(tx.amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KaiAnswerCard;
