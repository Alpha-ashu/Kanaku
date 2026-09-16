import React from 'react';
import { AlertTriangle, ArrowRight, Check, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrencyAmount, getCurrencySymbol } from '@/lib/currencyUtils';
import {
  SELF_SPLIT_KEY,
  SPLIT_TYPES,
  sanitizeDecimalInput,
  type PayerSelection,
  type SplitDraftEvaluation,
  type SplitDraftRow,
  type SplitType,
} from '@/lib/groupSplit';

const SPLIT_TYPE_PILLS: Record<SplitType, { label: string; hint: string }> = {
  equal: { label: 'Equal', hint: 'Everyone ticked pays the same amount.' },
  custom: { label: 'Custom', hint: 'Type what each person owes. Leave an amount blank to share what is left equally.' },
  percentage: { label: 'Percent', hint: 'Give each person a percentage. Blank rows share the remaining percent.' },
  shares: { label: 'Shares', hint: 'Split by portions — 2 shares pays twice as much as 1. Blank counts as 1.' },
};

interface SplitEditorProps {
  currency: string;
  totalAmount: number;
  splitType: SplitType;
  onSplitTypeChange: (type: SplitType) => void;
  rows: SplitDraftRow[];
  onRowChange: (key: string, patch: Partial<SplitDraftRow>) => void;
  onRemoveRow?: (key: string) => void;
  payer: PayerSelection;
  onPayerChange: (payer: PayerSelection) => void;
  evaluation: SplitDraftEvaluation;
}

/**
 * Member-level split editor for a group expense: how the bill is divided
 * (equal / custom amount / percentage / shares), who took part, and who paid.
 * Pure presentation — the caller owns the draft and `evaluateSplitDraft` output,
 * so the save path validates exactly what this shows.
 */
export function SplitEditor({
  currency,
  totalAmount,
  splitType,
  onSplitTypeChange,
  rows,
  onRowChange,
  onRemoveRow,
  payer,
  onPayerChange,
  evaluation,
}: SplitEditorProps) {
  const format = (amount: number) => formatCurrencyAmount(amount, currency);
  const { split, payment, settlement } = evaluation;
  const nameOf = (key: string) => rows.find((r) => r.key === key)?.name || 'Someone';
  const includedCount = rows.filter((r) => r.included).length;
  const hasAmount = totalAmount > 0;
  const allocatedPercent = split.total > 0 ? Math.min(100, Math.max(0, (split.allocated / split.total) * 100)) : 0;
  const hasTypedValues = rows.some((r) => r.valueInput !== '');

  const statusTone = split.status === 'balanced' ? 'ok' : split.status === 'invalid' ? 'muted' : 'warn';
  const statusText = (() => {
    if (split.status === 'invalid') return split.issue ?? 'Check the split';
    if (split.status === 'balanced') return 'Fully allocated';
    if (splitType === 'percentage') {
      return `${split.percentAllocated ?? 0}% of 100% assigned`;
    }
    return split.status === 'under'
      ? `${format(split.remaining)} remaining to allocate`
      : `${format(-split.remaining)} over the expense amount`;
  })();

  const selfBalance = settlement.balances.find((b) => b.key === SELF_SPLIT_KEY);

  return (
    <div className="space-y-4" data-testid="split-editor">
      {/* Split method */}
      <div className="space-y-2">
        <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">How do you want to split this expense?</p>
        <div className="grid grid-cols-4 gap-1 p-1 bg-white rounded-full border border-slate-200/80 shadow-xs" role="radiogroup" aria-label="Split method">
          {SPLIT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={splitType === type}
              onClick={() => onSplitTypeChange(type)}
              data-testid={`split-type-${type}`}
              className={cn(
                'py-1.5 sm:py-2 rounded-full font-bold text-xs transition-all cursor-pointer whitespace-nowrap select-none',
                splitType === type ? 'bg-[#18181B] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60',
              )}
            >
              {SPLIT_TYPE_PILLS[type].label}
            </button>
          ))}
        </div>
        <p className="text-2xs font-medium text-slate-400 leading-relaxed">{SPLIT_TYPE_PILLS[splitType].hint}</p>
      </div>

      {/* Members */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">
            Who participated? <span className="text-slate-500">({includedCount} of {rows.length})</span>
          </p>
          {splitType !== 'equal' && hasTypedValues && (
            <button
              type="button"
              onClick={() => rows.forEach((r) => r.valueInput !== '' && onRowChange(r.key, { valueInput: '' }))}
              data-testid="split-reset-values"
              className="flex items-center gap-1 text-2xs font-bold text-slate-500 hover:text-slate-900 px-2 py-0.5 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
            >
              <RotateCcw size={10} /> Reset
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {rows.map((row) => {
            const share = split.shares[row.key] ?? 0;
            const isAuto = split.autoKeys.includes(row.key);
            const initials = row.isCurrentUser ? 'ME' : (row.name?.[0] || '?').toUpperCase();
            return (
              <div
                key={row.key}
                data-testid={`split-row-${row.key}`}
                className={cn(
                  'flex items-center gap-2 p-2 sm:p-2.5 rounded-2xl border transition-all',
                  row.included ? 'bg-white border-slate-100 shadow-2xs' : 'bg-slate-50/70 border-slate-100',
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={row.included}
                  aria-label={`${row.included ? 'Exclude' : 'Include'} ${row.name || 'person'}`}
                  onClick={() => onRowChange(row.key, { included: !row.included })}
                  data-testid={`split-row-${row.key}-include`}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer',
                    row.included ? 'bg-[#18181B] border-[#18181B] text-white' : 'bg-white border-slate-300 text-transparent',
                  )}
                >
                  <Check size={11} strokeWidth={3.5} />
                </button>

                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-2xs font-black shrink-0',
                    row.isCurrentUser ? 'bg-[#18181B] text-white' : 'bg-indigo-50 border border-indigo-100 text-indigo-600',
                    !row.included && 'opacity-50',
                  )}
                >
                  {initials}
                </div>

                <div className={cn('flex-1 min-w-0', !row.included && 'opacity-60')}>
                  <p className="text-xs font-bold text-slate-900 truncate">{row.isCurrentUser ? 'You' : row.name}</p>
                  <p className="text-2xs font-semibold text-slate-400 truncate">
                    {!row.included
                      ? 'Not in this expense'
                      : splitType === 'equal'
                        ? 'Equal share'
                        : hasAmount && (splitType !== 'custom' || isAuto)
                          ? `${isAuto && splitType !== 'shares' ? 'Auto · ' : ''}${format(share)}`
                          : 'Custom amount'}
                  </p>
                </div>

                {row.included && splitType === 'equal' && (
                  <span className="text-xs font-black text-slate-900 shrink-0" data-testid={`split-row-${row.key}-share`}>
                    {hasAmount ? format(share) : '—'}
                  </span>
                )}

                {row.included && splitType !== 'equal' && (
                  <div className="relative w-24 sm:w-28 shrink-0">
                    {splitType === 'custom' && (
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-2xs font-bold text-slate-400 pointer-events-none">
                        {getCurrencySymbol(currency)}
                      </span>
                    )}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.valueInput}
                      onChange={(e) => onRowChange(row.key, { valueInput: sanitizeDecimalInput(e.target.value) })}
                      aria-label={`${splitType === 'custom' ? 'Amount' : splitType === 'percentage' ? 'Percent' : 'Shares'} for ${row.isCurrentUser ? 'you' : row.name}`}
                      data-testid={`split-row-${row.key}-value`}
                      placeholder={
                        splitType === 'shares'
                          ? '1'
                          : splitType === 'percentage'
                            ? (isAuto && hasAmount && split.total > 0 ? String(Math.round((share / split.total) * 10000) / 100) : '0')
                            : (isAuto && hasAmount ? share.toFixed(2) : '0.00')
                      }
                      className={cn(
                        'w-full h-9 bg-slate-50 border border-slate-200/80 rounded-xl text-right font-bold text-xs sm:text-sm text-slate-900 placeholder:text-slate-300 placeholder:font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all',
                        splitType === 'custom' ? 'pl-6 pr-2.5' : 'pl-2.5 pr-7',
                      )}
                    />
                    {splitType !== 'custom' && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs font-bold text-slate-400 pointer-events-none">
                        {splitType === 'percentage' ? '%' : '×'}
                      </span>
                    )}
                  </div>
                )}

                {onRemoveRow && !row.isCurrentUser && (
                  <button
                    type="button"
                    title={`Remove ${row.name}`}
                    aria-label={`Remove ${row.name}`}
                    onClick={() => onRemoveRow(row.key)}
                    data-testid={`split-row-${row.key}-remove`}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Allocation summary */}
      <div className="p-4 bg-[#18181B] rounded-2xl text-white shadow-md space-y-3" data-testid="split-allocation-summary">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <p className="text-2xs font-bold text-white/50 uppercase tracking-wider truncate">Total Expense</p>
            <p className="text-xs sm:text-sm font-black truncate">{format(split.total)}</p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-2xs font-bold text-white/50 uppercase tracking-wider truncate">Allocated</p>
            <p className="text-xs sm:text-sm font-black truncate">{format(split.allocated)}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-2xs font-bold text-white/50 uppercase tracking-wider truncate">{split.remaining < 0 ? 'Over' : 'Remaining'}</p>
            <p className={cn('text-xs sm:text-sm font-black truncate', split.remaining === 0 ? 'text-white' : 'text-amber-300')}>
              {format(Math.abs(split.remaining))}
            </p>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full rounded-full transition-all duration-300', split.status === 'balanced' ? 'bg-emerald-400' : split.status === 'over' ? 'bg-rose-400' : 'bg-amber-300')}
            style={{ width: `${split.status === 'over' ? 100 : allocatedPercent}%` }}
          />
        </div>
        <p
          data-testid="split-allocation-status"
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-xs font-bold',
            statusTone === 'ok' ? 'text-emerald-300' : statusTone === 'warn' ? (split.status === 'over' ? 'text-rose-300' : 'text-amber-300') : 'text-white/50',
          )}
        >
          {statusTone === 'ok' ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={13} />}
          {statusText}
        </p>
      </div>

      {/* Who paid */}
      <div className="space-y-2">
        <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Who paid?</p>
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row) => {
            const active = payer.mode === 'single' && payer.key === row.key;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onPayerChange({ mode: 'single', key: row.key })}
                data-testid={`split-payer-${row.key}`}
                aria-pressed={active}
                className={cn(
                  'px-3 py-1.5 rounded-full text-2xs font-bold border transition-all cursor-pointer shadow-2xs',
                  active ? 'bg-[#18181B] border-[#18181B] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                {row.isCurrentUser ? 'You' : row.name || 'Unnamed'}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPayerChange({ mode: 'multiple' })}
            data-testid="split-payer-multiple"
            aria-pressed={payer.mode === 'multiple'}
            className={cn(
              'px-3 py-1.5 rounded-full text-2xs font-bold border transition-all cursor-pointer shadow-2xs',
              payer.mode === 'multiple' ? 'bg-[#18181B] border-[#18181B] text-white' : 'bg-white border-purple-200 text-purple-700 hover:bg-purple-50',
            )}
          >
            Multiple people
          </button>
        </div>

        {payer.mode === 'single' ? (
          <p className="text-2xs font-semibold text-slate-500">
            {payer.key === SELF_SPLIT_KEY ? 'You' : nameOf(payer.key)} paid the full {hasAmount ? format(split.total) : 'amount'}.
          </p>
        ) : (
          <div className="space-y-1.5 p-2.5 rounded-2xl bg-purple-50/50 border border-purple-100/80">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <p className="flex-1 min-w-0 text-xs font-bold text-slate-800 truncate">{row.isCurrentUser ? 'You' : row.name}</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.paidInput}
                  onChange={(e) => onRowChange(row.key, { paidInput: sanitizeDecimalInput(e.target.value) })}
                  aria-label={`Amount paid by ${row.isCurrentUser ? 'you' : row.name}`}
                  data-testid={`split-paid-${row.key}`}
                  placeholder="0.00"
                  className="w-24 sm:w-28 h-8 bg-white border border-purple-200/80 rounded-xl px-2.5 text-right font-bold text-xs sm:text-sm text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                />
              </div>
            ))}
            <p
              data-testid="split-payment-status"
              className={cn(
                'flex items-center gap-1.5 pt-1 text-2xs font-bold',
                payment.status === 'balanced' ? 'text-emerald-600' : 'text-amber-600',
              )}
            >
              {payment.status === 'balanced' ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={11} />}
              Paid {format(payment.allocated)} of {format(payment.total)}
              {payment.status === 'under' && ` · ${format(payment.remaining)} left`}
              {payment.status === 'over' && ` · ${format(-payment.remaining)} too much`}
            </p>
          </div>
        )}
      </div>

      {/* Settlement preview */}
      {evaluation.isValid && (
        <div className="space-y-2 p-3 rounded-2xl bg-slate-50/80 border border-slate-100" data-testid="split-settlement-preview">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Settlement</p>
            {selfBalance && (
              <p className={cn('text-2xs font-black', selfBalance.balance > 0 ? 'text-emerald-600' : selfBalance.balance < 0 ? 'text-rose-600' : 'text-slate-500')}>
                {selfBalance.balance > 0
                  ? `You get back ${format(selfBalance.receives)}`
                  : selfBalance.balance < 0
                    ? `You owe ${format(selfBalance.owes)}`
                    : 'You are even'}
              </p>
            )}
          </div>
          {settlement.transfers.length === 0 ? (
            <p className="text-xs font-semibold text-slate-500">Nobody owes anyone.</p>
          ) : (
            <ul className="space-y-1">
              {settlement.transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span className="truncate max-w-[35%] font-bold text-slate-800">{t.from === SELF_SPLIT_KEY ? 'You' : nameOf(t.from)}</span>
                  <ArrowRight size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate max-w-[35%] font-bold text-slate-800">{t.to === SELF_SPLIT_KEY ? 'You' : nameOf(t.to)}</span>
                  <span className="ml-auto font-black text-slate-900 shrink-0">{format(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
