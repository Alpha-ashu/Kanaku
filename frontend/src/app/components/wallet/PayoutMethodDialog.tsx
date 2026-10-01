/**
 * Add or change where withdrawals are paid: a UPI ID or a bank account.
 *
 * The server stores the details encrypted and shows them back only masked. A
 * change needs the account password or a code emailed to the account, because
 * redirecting payouts is the first thing a stolen session would try — the
 * server checks that proof, this dialog only collects it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, KeyRound, Landmark, Loader2, Mail, ShieldCheck, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { accountLifecycleService, type StepUpMethods, type StepUpProof } from '@/services/accountLifecycleService';
import { announceWalletChange, walletService, type PayoutDetailsInput, type PayoutMethodType } from '@/services/walletService';

interface PayoutMethodDialogProps {
  accountEmail: string;
  current: { method: PayoutMethodType; label: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

type CodeState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

// Mirrors the server's checks so mistakes show before the round trip.
const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const HOLDER = /^[\p{L} .'-]{2,100}$/u;

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20';

export const PayoutMethodDialog: React.FC<PayoutMethodDialogProps> = ({ accountEmail, current, onClose, onSaved }) => {
  const lock = useSubmitLock();
  const [method, setMethod] = useState<PayoutMethodType>(current?.method ?? 'UPI');
  const [upiId, setUpiId] = useState('');
  const [holder, setHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountConfirm, setAccountConfirm] = useState('');
  const [ifsc, setIfsc] = useState('');

  const [methods, setMethods] = useState<StepUpMethods | null>(null);
  const [proofMethod, setProofMethod] = useState<'password' | 'email_code'>('email_code');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    accountLifecycleService.stepUpMethods()
      .then((available) => {
        if (cancelled) return;
        setMethods(available);
        setProofMethod(available.password ? 'password' : 'email_code');
      })
      .catch(async (err) => {
        if (!cancelled) setError(failureText(await describeApiFailure(err, 'Could not prepare the confirmation step.')));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, onClose]);

  const cleanAccount = accountNumber.replace(/[\s-]/g, '');
  const details: PayoutDetailsInput | null = useMemo(() => {
    if (method === 'UPI') {
      const value = upiId.trim().toLowerCase();
      return UPI_ID.test(value) ? { method: 'UPI', upiId: value } : null;
    }
    const branch = ifsc.trim().toUpperCase();
    const confirmed = cleanAccount === accountConfirm.replace(/[\s-]/g, '');
    return HOLDER.test(holder.trim()) && /^\d{9,18}$/.test(cleanAccount) && confirmed && IFSC.test(branch)
      ? { method: 'BANK', accountHolder: holder.trim(), accountNumber: cleanAccount, ifsc: branch }
      : null;
  }, [method, upiId, holder, cleanAccount, accountConfirm, ifsc]);

  const fieldHint = (() => {
    if (method === 'UPI') return upiId.trim() && !details ? 'Enter a UPI ID like name@bank.' : '';
    if (accountConfirm && cleanAccount !== accountConfirm.replace(/[\s-]/g, '')) return 'The account numbers do not match.';
    if (ifsc.trim() && !IFSC.test(ifsc.trim().toUpperCase())) return 'IFSC codes have 11 characters, like HDFC0001234.';
    if (accountNumber && !/^\d{9,18}$/.test(cleanAccount)) return 'Account numbers have 9 to 18 digits.';
    return '';
  })();

  const proof: StepUpProof | undefined =
    proofMethod === 'password' ? (password ? { method: 'password', password } : undefined)
      : codeState === 'verified' ? { method: 'email_code' } : undefined;

  const canSave = Boolean(details) && Boolean(proof) && !busy;

  const sendCode = lock(async () => {
    setError('');
    setCodeState('sending');
    try {
      await accountLifecycleService.sendEmailCode(accountEmail);
      setCode('');
      setCodeState('sent');
    } catch (err) {
      setCodeState('idle');
      setError(failureText(await describeApiFailure(err, 'Could not send the code. Please try again.')));
    }
  });

  const verifyCode = lock(async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setError('');
    setCodeState('verifying');
    try {
      await accountLifecycleService.verifyEmailCode(accountEmail, code);
      setCodeState('verified');
    } catch (err) {
      setCodeState('sent');
      setError(failureText(await describeApiFailure(err, 'That code did not work. Check it or send a new one.')));
    }
  });

  const save = lock(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!details || !proof) return;
    setBusy(true);
    setError('');
    try {
      await walletService.savePayoutMethod(details, proof);
      announceWalletChange();
      onSaved();
    } catch (err) {
      const failure = await describeApiFailure(err, 'Your payout details could not be saved.');
      if (failure.code === 'STEP_UP_CODE_REQUIRED') {
        setCodeState('idle');
        setCode('');
      } else if (failure.code === 'STEP_UP_FAILED') {
        setPassword('');
      }
      setError(failureText(failure));
      setBusy(false);
    }
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-method-title"
        data-testid="payout-method-dialog"
        className="flex max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] w-full sm:max-w-md flex-col overflow-hidden rounded-t-[28px] sm:rounded-[32px] border border-slate-100 bg-white shadow-2xl"
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 p-5 sm:p-6 text-white">
          <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition hover:bg-white/30 disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <div className="relative mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Landmark size={22} />
          </div>
          <h2 id="payout-method-title" className="relative pr-10 text-xl font-bold tracking-tight">
            {current ? 'Change payout details' : 'Add payout details'}
          </h2>
          <p className="relative mt-1 text-sm leading-relaxed text-white/80">
            {current ? `Withdrawals now go to ${current.label}.` : 'Where should we pay your withdrawals?'}
          </p>
        </div>

        <form onSubmit={save} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 space-y-5" noValidate>
          <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1" role="tablist" aria-label="Payout method">
            {(['UPI', 'BANK'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => { setMethod(m); setError(''); }}
                data-testid={`payout-method-${m.toLowerCase()}`}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition',
                  method === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                )}
              >
                {m === 'UPI' ? <Smartphone size={14} /> : <Landmark size={14} />}
                {m === 'UPI' ? 'UPI ID' : 'Bank account'}
              </button>
            ))}
          </div>

          <fieldset className="space-y-3" disabled={busy}>
            {method === 'UPI' ? (
              <div>
                <label htmlFor="payout-upi" className="mb-1.5 block text-sm font-medium text-slate-700">UPI ID</label>
                <input
                  id="payout-upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@bank"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  data-testid="payout-upi"
                  className={inputClass}
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="payout-holder" className="mb-1.5 block text-sm font-medium text-slate-700">Account holder name</label>
                  <input id="payout-holder" value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="name" data-testid="payout-holder" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="payout-account" className="mb-1.5 block text-sm font-medium text-slate-700">Account number</label>
                  <input id="payout-account" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off" data-testid="payout-account" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="payout-account-confirm" className="mb-1.5 block text-sm font-medium text-slate-700">Re-enter account number</label>
                  <input
                    id="payout-account-confirm"
                    value={accountConfirm}
                    onChange={(e) => setAccountConfirm(e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    inputMode="numeric"
                    autoComplete="off"
                    data-testid="payout-account-confirm"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="payout-ifsc" className="mb-1.5 block text-sm font-medium text-slate-700">IFSC code</label>
                  <input
                    id="payout-ifsc"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    placeholder="HDFC0001234"
                    maxLength={11}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    data-testid="payout-ifsc"
                    className={cn(inputClass, 'font-mono tracking-wider')}
                  />
                </div>
              </>
            )}
            {fieldHint && <p className="text-xs font-semibold text-amber-700" data-testid="payout-hint">{fieldHint}</p>}
          </fieldset>

          <fieldset className="space-y-3" disabled={busy || !methods}>
            <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ShieldCheck size={14} /> Confirm it&apos;s you
            </legend>

            {methods?.password && (
              <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1" role="tablist" aria-label="How to confirm">
                {(['password', 'email_code'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={proofMethod === m}
                    onClick={() => { setProofMethod(m); setError(''); }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition',
                      proofMethod === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                    )}
                  >
                    {m === 'password' ? <KeyRound size={14} /> : <Mail size={14} />}
                    {m === 'password' ? 'Password' : 'Email code'}
                  </button>
                ))}
              </div>
            )}

            {proofMethod === 'password' ? (
              <div>
                <label htmlFor="payout-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                <input
                  id="payout-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="payout-password"
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  We&apos;ll email a 6-digit code to <span className="font-semibold text-slate-900">{methods?.email ?? 'your account email'}</span>.
                </p>
                {codeState === 'verified' ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700" data-testid="payout-code-verified">
                    <CheckCircle2 size={16} /> Code verified
                  </p>
                ) : codeState === 'idle' || codeState === 'sending' ? (
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={codeState === 'sending'}
                    data-testid="payout-send-code"
                    className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {codeState === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    Email me a code
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <label htmlFor="payout-code" className="sr-only">Verification code</label>
                    <input
                      id="payout-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code"
                      data-testid="payout-code"
                      className={cn(inputClass, 'min-w-0 flex-1 tracking-widest')}
                    />
                    <button
                      type="button"
                      onClick={() => void verifyCode()}
                      disabled={codeState === 'verifying' || code.length !== 6}
                      className="shrink-0 rounded-full bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {codeState === 'verifying' ? <Loader2 size={15} className="animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {error && <p role="alert" data-testid="payout-error" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

          <p className="text-xs text-slate-500">
            Saved encrypted. Only a masked version is shown in the app, and we email you whenever these details change.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              data-testid="payout-save"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default PayoutMethodDialog;
