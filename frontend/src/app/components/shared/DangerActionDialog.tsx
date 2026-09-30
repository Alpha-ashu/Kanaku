/**
 * Confirmation for the two irreversible account actions: delete the account,
 * and reset (wipe) its data. Used by every role's profile/settings screen.
 *
 * The server is the authority — it refuses admins and protected accounts, lists
 * wallet balances that block deletion, and checks the proof — so this dialog:
 *   1. asks the server first (/settings/account/deletion-check or
 *      /settings/step-up-methods) and shows any blocker instead of a form;
 *   2. says exactly what goes and what stays, and offers a download first;
 *   3. collects proof: the password, or a code emailed to the account (the only
 *      option for Google sign-in accounts), verified before the action;
 *   4. requires the confirm word typed, and locks against double submission.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, KeyRound, Loader2, Mail, RotateCcw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import {
  accountLifecycleService,
  type DeletionBlocker,
  type StepUpMethods,
  type StepUpProof,
} from '@/services/accountLifecycleService';

export type DangerAction = 'delete-account' | 'reset-data';

interface DangerActionDialogProps {
  action: DangerAction;
  /** The account's email — the code always goes to it. */
  accountEmail: string;
  onClose: () => void;
  /** Runs the action with the collected proof. Throw to show the error in the dialog. */
  onConfirm: (proof: StepUpProof | undefined) => Promise<void>;
  /** Optional "download a copy first". */
  onDownloadCopy?: () => Promise<void>;
}

type Phase = 'loading' | 'blocked' | 'form' | 'error';
type CodeState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

const COPY = {
  'delete-account': {
    title: 'Delete account',
    word: 'DELETE',
    button: 'Delete permanently',
    busy: 'Deleting…',
    icon: Trash2,
    lead: 'This permanently deletes your KANAKU account. It cannot be undone.',
    removed: [
      'Your profile, sign-in and settings',
      'All accounts, transactions, budgets, goals, loans and investments',
      'Bills, receipts, Vault documents and to-do lists',
      'Advisor bookings, session chats and any advisor application',
    ],
    kept: ['Coin purchase and session payment records, which we keep as financial records'],
  },
  'reset-data': {
    title: 'Reset all data',
    word: 'RESET',
    button: 'Reset my data',
    busy: 'Resetting…',
    icon: RotateCcw,
    lead: 'This erases your financial records on every device. Your account stays. It cannot be undone.',
    removed: [
      'Accounts, transactions, budgets, goals, loans, investments and gold',
      'Bills, recurring rules, to-do lists, friends and group expenses',
      'Notifications, import history and custom categories (defaults come back)',
    ],
    kept: [
      'Your profile, sign-in and PIN',
      'Your coin wallet and its history',
      'Advisor bookings, session chats and your advisor profile',
      'Vault documents',
    ],
  },
} as const;

export const DangerActionDialog: React.FC<DangerActionDialogProps> = ({
  action,
  accountEmail,
  onClose,
  onConfirm,
  onDownloadCopy,
}) => {
  const copy = COPY[action];
  const Icon = copy.icon;
  const lock = useSubmitLock();

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState('');
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [requiresProof, setRequiresProof] = useState(true);
  const [openBookings, setOpenBookings] = useState(0);
  const [methods, setMethods] = useState<StepUpMethods>({ password: false, emailCode: true, email: null });
  const [method, setMethod] = useState<'password' | 'email_code'>('email_code');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError('');
    try {
      if (action === 'delete-account') {
        const check = await accountLifecycleService.deletionCheck();
        setMethods(check.methods);
        setRequiresProof(check.requiresProof);
        setOpenBookings(check.openBookings);
        setMethod(check.methods.password ? 'password' : 'email_code');
        if (!check.allowed) {
          setBlockers(check.blockers);
          setPhase('blocked');
          return;
        }
      } else {
        const available = await accountLifecycleService.stepUpMethods();
        setMethods(available);
        setMethod(available.password ? 'password' : 'email_code');
      }
      setPhase('form');
    } catch (err) {
      setLoadError(failureText(await describeApiFailure(err, 'Could not check your account right now.')));
      setPhase('error');
    }
  }, [action]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const proof: StepUpProof | undefined = useMemo(() => {
    if (!requiresProof) return undefined;
    if (method === 'password') return password ? { method: 'password', password } : undefined;
    return codeState === 'verified' ? { method: 'email_code' } : undefined;
  }, [requiresProof, method, password, codeState]);

  const confirmWordOk = typed.trim().toUpperCase() === copy.word;
  const canSubmit = phase === 'form' && confirmWordOk && (!requiresProof || Boolean(proof)) && !busy;

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

  const submit = lock(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(proof);
    } catch (err) {
      const failure = await describeApiFailure(err, action === 'delete-account'
        ? 'Your account could not be deleted. Nothing was removed.'
        : 'Your data could not be reset. Nothing was removed.');
      const details = failure.details as { blockers?: DeletionBlocker[] } | undefined;
      if (details?.blockers?.length) {
        setBlockers(details.blockers);
        setPhase('blocked');
      } else if (failure.code === 'STEP_UP_CODE_REQUIRED') {
        // The code was used or expired: start the code step again.
        setCodeState('idle');
        setCode('');
      } else if (failure.code === 'STEP_UP_FAILED') {
        setPassword('');
      }
      setError(failureText(failure));
      setBusy(false);
    }
  });

  const downloadCopy = lock(async () => {
    if (!onDownloadCopy) return;
    setDownloading(true);
    try {
      await onDownloadCopy();
    } catch (err) {
      setError(failureText(await describeApiFailure(err, 'The download did not finish. Please try again.')));
    } finally {
      setDownloading(false);
    }
  });

  // Portalled to <body>: rendered inside the page, the dialog is trapped in the
  // content area's stacking context and the mobile bottom nav (a sibling of
  // that area) sat on top of it, swallowing taps on the confirm button.
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="danger-action-title"
        data-testid={`danger-dialog-${action}`}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-2xl sm:rounded-[32px]"
      >
        <div className="relative shrink-0 bg-gradient-to-br from-red-600 to-rose-700 p-5 text-white sm:p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            data-testid="danger-dialog-close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition hover:bg-white/30 disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Icon size={22} />
          </div>
          <h2 id="danger-action-title" className="pr-10 text-xl font-bold tracking-tight">{copy.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-red-100">{copy.lead}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {phase === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
              <Loader2 size={18} className="animate-spin" /> Checking your account…
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4 py-2">
              <p role="alert" className="text-sm text-rose-700">{loadError}</p>
              <button type="button" onClick={() => void load()} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
                Try again
              </button>
            </div>
          )}

          {phase === 'blocked' && (
            <div className="space-y-4" data-testid="danger-dialog-blocked">
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <p className="text-sm font-bold text-amber-900">This account can&apos;t be deleted yet</p>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-amber-900">
                    {blockers.map((b) => <li key={`${b.code}:${b.message}`}>{b.message}</li>)}
                  </ul>
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-full rounded-full bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200">
                Close
              </button>
            </div>
          )}

          {phase === 'form' && (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <section aria-label="What happens" className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 font-bold text-slate-900">Removed</p>
                  <ul className="list-disc space-y-1 pl-5 text-slate-600">
                    {copy.removed.map((line) => <li key={line}>{line}</li>)}
                    {action === 'delete-account' && openBookings > 0 && (
                      <li>{openBookings} upcoming session{openBookings === 1 ? '' : 's'} will be cancelled and the other person told</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-bold text-slate-900">Kept</p>
                  <ul className="list-disc space-y-1 pl-5 text-slate-600">
                    {copy.kept.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              </section>

              {onDownloadCopy && (
                <button
                  type="button"
                  onClick={() => void downloadCopy()}
                  disabled={downloading || busy}
                  data-testid="danger-dialog-download"
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download a copy of my data first
                </button>
              )}

              {requiresProof && (
                <fieldset className="space-y-3" disabled={busy}>
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Confirm it&apos;s you</legend>

                  {methods.password && (
                    <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1" role="tablist" aria-label="How to confirm">
                      {(['password', 'email_code'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={method === m}
                          onClick={() => { setMethod(m); setError(''); }}
                          data-testid={`danger-dialog-method-${m}`}
                          className={cn(
                            'flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition',
                            method === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                          )}
                        >
                          {m === 'password' ? <KeyRound size={14} /> : <Mail size={14} />}
                          {m === 'password' ? 'Password' : 'Email code'}
                        </button>
                      ))}
                    </div>
                  )}

                  {method === 'password' ? (
                    <div>
                      <label htmlFor="danger-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                      <input
                        id="danger-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        data-testid="danger-dialog-password"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-600">
                        We&apos;ll email a 6-digit code to <span className="font-semibold text-slate-900">{methods.email ?? 'your account email'}</span>.
                      </p>
                      {codeState === 'verified' ? (
                        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700" data-testid="danger-dialog-code-verified">
                          <CheckCircle2 size={16} /> Code verified
                        </p>
                      ) : codeState === 'idle' || codeState === 'sending' ? (
                        <button
                          type="button"
                          onClick={() => void sendCode()}
                          disabled={codeState === 'sending'}
                          data-testid="danger-dialog-send-code"
                          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {codeState === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                          Email me a code
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <label htmlFor="danger-code" className="sr-only">Verification code</label>
                          <input
                            id="danger-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="6-digit code"
                            data-testid="danger-dialog-code"
                            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm tracking-widest text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                          />
                          <button
                            type="button"
                            onClick={() => void verifyCode()}
                            disabled={codeState === 'verifying' || code.length !== 6}
                            data-testid="danger-dialog-verify-code"
                            className="shrink-0 rounded-full bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {codeState === 'verifying' ? <Loader2 size={15} className="animate-spin" /> : 'Verify'}
                          </button>
                        </div>
                      )}
                      {codeState === 'sent' && (
                        <button type="button" onClick={() => void sendCode()} className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline">
                          Send a new code
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>
              )}

              <div>
                <label htmlFor="danger-confirm-word" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Type <span className="font-mono font-bold text-rose-700">{copy.word}</span> to confirm
                </label>
                <input
                  id="danger-confirm-word"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={busy}
                  data-testid="danger-dialog-confirm-word"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 font-mono text-sm uppercase tracking-wider text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              {error && <p role="alert" data-testid="danger-dialog-error" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

              <div className="flex gap-3 pt-1">
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
                  disabled={!canSubmit}
                  data-testid="danger-dialog-confirm"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {busy ? copy.busy : copy.button}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DangerActionDialog;
