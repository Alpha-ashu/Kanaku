import React from 'react';
import { formatMoney } from './kaiFormat';

export interface ReportMeta {
  period?: string;
  total?: number;
  count?: number;
  income?: number;
  net?: number;
  categories?: Array<{ category: string; amount: number; pct?: number; count?: number }>;
}

interface Props {
  meta: ReportMeta;
  currency: string;
}

const MAX_ROWS = 6;
const ACCENT = '#7C3AED';
const TRACK = 'rgba(124, 58, 237, 0.12)';

export const isReportMeta = (meta: unknown): meta is ReportMeta =>
  typeof meta === 'object' && meta !== null && Array.isArray((meta as ReportMeta).categories) && typeof (meta as ReportMeta).total === 'number';

/**
 * Period total as the headline, then one thin bar per category, largest first.
 * A single measure → a single hue; labels and values stay in text tokens.
 */
export const KaiReportCard: React.FC<Props> = ({ meta, currency }) => {
  const total = meta.total ?? 0;
  const all = [...(meta.categories ?? [])].sort((a, b) => b.amount - a.amount);
  const shown = all.slice(0, MAX_ROWS);
  const rest = all.slice(MAX_ROWS);
  const rows = rest.length > 0
    ? [...shown, { category: 'Other', amount: rest.reduce((s, c) => s + c.amount, 0), count: rest.reduce((s, c) => s + (c.count ?? 0), 0) }]
    : shown;
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-md shadow-2xs px-4 py-3.5" data-testid="kai-report-card">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{meta.period ? `${meta.period} · ` : ''}Expense report</p>
      <div className="flex items-end justify-between gap-3 mt-1">
        <div>
          <p className="text-2xl font-black text-slate-900 leading-tight">{formatMoney(currency, total)}</p>
          <p className="text-[11px] font-medium text-slate-500">Total spent{typeof meta.count === 'number' ? ` · ${meta.count} transaction${meta.count === 1 ? '' : 's'}` : ''}</p>
        </div>
        {typeof meta.income === 'number' && meta.income > 0 && (
          <div className="text-right">
            <p className="text-sm font-bold text-emerald-600">{formatMoney(currency, meta.income)}</p>
            <p className="text-[11px] font-medium text-slate-500">Income</p>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Spending by category">
          {rows.map((row) => {
            const pct = total > 0 ? Math.round((row.amount / total) * 100) : 0;
            return (
              <li key={row.category} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 truncate">{row.category}</span>
                    <span className="text-[11px] font-medium text-slate-500 shrink-0">{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: TRACK }} aria-hidden="true">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, (row.amount / max) * 100)}%`, background: ACCENT }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-900 tabular-nums">{formatMoney(currency, row.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default KaiReportCard;
