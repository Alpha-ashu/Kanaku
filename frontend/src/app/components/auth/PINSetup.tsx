import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ShieldCheck, ChevronLeft, Delete } from 'lucide-react';
import { toast } from 'sonner';
import { isPINSet, restorePINKeyBackup, serializePINKeyBackup, storeMasterKey, verifyPIN } from '@/lib/encryption';
import { isPinAlreadySet, isPinMissing, isPinServiceUnavailable, pinService } from '@/services/pinService';
import { KANAKULogo, DISPLAY_FONT } from '@/app/components/ui/KANAKULogo';
import { useUserDisplayName } from '@/hooks/useUserDisplayName';

interface PINSetupProps {
  onComplete: (pin: string) => void;
  onBack?: () => void;
  isExistingUser?: boolean;
  existingPinRequired?: boolean;
}

export const PINSetup: React.FC<PINSetupProps> = ({
  onComplete,
  onBack,
  existingPinRequired = false,
}) => {
  const displayName = useUserDisplayName('User');
  const [step, setStep] = useState<'create' | 'confirm' | 'enter'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existingPinRequired) {
      setStep('enter');
    }
  }, [existingPinRequired]);

  const currentPinVal = step === 'confirm' ? confirmPin : pin;

  const appendDigit = (d: string) => {
    if (isLoading) return;
    setError(null);
    if (currentPinVal.length < 6) {
      const newVal = currentPinVal + d;
      if (step === 'confirm') {
        setConfirmPin(newVal);
      } else {
        setPin(newVal);
      }
    }
  };

  const deleteDigit = () => {
    if (isLoading) return;
    setError(null);
    if (currentPinVal.length > 0) {
      const newVal = currentPinVal.slice(0, -1);
      if (step === 'confirm') {
        setConfirmPin(newVal);
      } else {
        setPin(newVal);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    setError(null);
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (step === 'confirm') {
      setConfirmPin(val);
    } else {
      setPin(val);
    }
  };

  const validateAndProceed = (enteredPin: string) => {
    if (step === 'create') {
      if (pinService.isWeakPin(enteredPin)) {
        setError('PIN is too weak. Avoid sequential, repeating, or common patterns.');
        setPin('');
        return;
      }
      setStep('confirm');
      setConfirmPin('');
    } else if (step === 'confirm') {
      if (pin !== enteredPin) {
        setError('PINs do not match. Try again.');
        setConfirmPin('');
        setPin('');
        setStep('create');
        return;
      }
      handleSubmit(enteredPin);
    } else {
      handleSubmit(enteredPin);
    }
  };

  // Global physical keyboard handler (desktop / hardware keyboard support without invoking OS virtual keyboard on mobile)
  useEffect(() => {
    if (isLoading) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        document.activeElement.tagName === 'INPUT' &&
        document.activeElement !== hiddenInputRef.current
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === 'Enter' && currentPinVal.length === 6) {
        e.preventDefault();
        validateAndProceed(currentPinVal);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isLoading, currentPinVal, step]);

  useEffect(() => {
    if (currentPinVal.length === 6) {
      const t = setTimeout(() => {
        validateAndProceed(currentPinVal);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [pin, confirmPin, step]);

  const handleSubmit = async (candidatePin: string) => {
    setIsLoading(true);
    try {
      const result = step === 'enter'
        ? await pinService.verifyPin({ pin: candidatePin })
        : await pinService.createPin(candidatePin);

      if (step === 'enter' && !result.success) {
        if (isPinServiceUnavailable(result)) {
          setError('PIN verification service unavailable. Access denied for security.');
          setIsLoading(false);
          return;
        }
        setError(result.message || 'PIN verification failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // The server already holds a PIN for this account, so there is nothing to
      // create — switch to verifying it instead of dead-ending on the error.
      //
      // Reaching here is normal, not exotic: this screen is entered on the
      // strength of a /pin/status lookup, and that lookup is inconclusive
      // whenever the backend is cold, throttled, or the session is still
      // settling after OTP verification. Before this branch existed, the create
      // step answered 400 and left the user with no control that could move the
      // flow forward — permanently stuck in onboarding.
      if (!result.success && step !== 'enter' && isPinAlreadySet(result)) {
        setStep('enter');
        setPin('');
        setConfirmPin('');
        setError('This account already has a PIN. Enter it to continue.');
        setIsLoading(false);
        return;
      }

      if (!result.success && step !== 'enter' && !isPinServiceUnavailable(result)) {
        setError(result.message || 'PIN request failed. Please try again.');
        setIsLoading(false);
        return;
      }

      if (step === 'enter' && !isPINSet()) {
        const keyBackupResult = await pinService.getKeyBackup();
        if (keyBackupResult.success && keyBackupResult.backup) {
          restorePINKeyBackup(keyBackupResult.backup);
        }
      }

      const localResult = await verifyPIN(candidatePin);
      if (!localResult.isValid) {
        await storeMasterKey(candidatePin);
      }

      if (!result.success && step !== 'enter') {
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        pinService.markPinCreatedLocally(expiresAt);
        pinService.markPendingServerSync();
      }

      const backupPayload = serializePINKeyBackup();
      if (backupPayload) {
        if (result.success && step === 'enter' && localResult.isValid) {
          pinService.markPinVerifiedLocally();
        }

        let securityToken: string | undefined;
        if (result.success) {
          const secResult = await pinService.verifySecurity();
          if (secResult.success) {
            securityToken = secResult.securityToken;
          }
        }

        const backupResult = await pinService.saveKeyBackup(backupPayload, securityToken);
        if (!backupResult.success && !isPinServiceUnavailable(backupResult) && !isPinMissing(backupResult)) {
          console.warn('PIN key backup refresh failed during setup:', backupResult.message);
        }
      }

      localStorage.setItem('pin_created_at', new Date().toISOString());
      localStorage.setItem('pin_expiry', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString());

      toast.success(
        step === 'enter'
          ? 'PIN verified successfully!'
          : result.success
          ? 'PIN created successfully!'
          : 'PIN created on this device. Server sync is pending.'
      );
      onComplete(candidatePin);
    } catch (err) {
      setError('Failed to save PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentStepLabel = step === 'confirm' 
    ? 'Confirm your PIN' 
    : step === 'enter' 
    ? `Welcome back, ${displayName}` 
    : 'Create your PIN';

  const currentStepSub = step === 'confirm'
    ? 'Re-enter the same PIN to confirm'
    : step === 'enter'
    ? 'Enter your PIN to unlock KANAKU'
    : 'Choose a 6-digit PIN to secure your account';

  return (
    <div
      data-testid="pinsetup-div"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f9fc] flex flex-col items-center justify-center p-4 sm:p-6 min-h-full select-none"
    >
      <form
        data-testid="pinsetup-form"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden' }}
        autoComplete="off"
        onSubmit={e => e.preventDefault()}
      >
        <input
          ref={hiddenInputRef}
          type="tel"
          name="kanaku-pin-setup"
          id="kanaku-pin-setup"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          value={currentPinVal}
          onChange={handleInputChange}
          readOnly={true}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="pin-setup-hidden-input"
        />
      </form>

      <div className="w-full max-w-[340px] sm:max-w-sm px-2 py-4 sm:py-6 flex flex-col items-center my-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-5">
          <KANAKULogo className="w-14 h-14 sm:w-16 sm:h-16" />
        </div>

        <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight text-center leading-snug">
          {currentStepLabel}
        </h1>
        <p className="text-sm sm:text-base text-slate-500 font-normal text-center mt-1.5 leading-snug">
          {currentStepSub}
        </p>

        {step === 'confirm' && (
          <button
            type="button"
            onClick={() => { setStep('create'); setPin(''); setConfirmPin(''); setError(null); }}
            data-testid="pin-setup-confirm-back-button"
            className="flex items-center gap-1 text-slate-500 hover:text-slate-900 text-xs sm:text-sm font-medium transition-colors mt-2"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}

        {/* PIN digit dots */}
        <div data-testid="pinsetup-div-2" className="flex justify-center items-center gap-3.5 sm:gap-4 my-6 sm:my-8">
          {Array.from({ length: 6 }, (_, i) => {
            const isFilled = i < currentPinVal.length;
            const hasError = !!error && currentPinVal.length === 6;

            return (
              <span
                key={i}
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full transition-all duration-200 ${
                  hasError
                    ? 'border-2 border-red-500 bg-red-100 scale-110 animate-[shake_0.4s_ease-in-out]'
                    : isFilled
                    ? 'bg-[#7c3aed] ring-2 ring-violet-200 shadow-[0_0_8px_rgba(124,58,237,0.35)] scale-110'
                    : 'border-2 border-slate-300 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {/* Error message or revealed PIN */}
        <div className="flex flex-col items-center min-h-[22px] mb-2 sm:mb-3">
          {error ? (
            <p className="text-red-500 text-xs font-medium text-center">
              {error}
            </p>
          ) : showPin && currentPinVal.length > 0 ? (
            <p className="text-xs font-mono tracking-widest text-violet-600 font-bold">
              {currentPinVal}
            </p>
          ) : null}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-y-4 gap-x-6 sm:gap-y-5 sm:gap-x-7 w-full max-w-[280px] sm:max-w-[310px] mx-auto place-items-center">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => appendDigit(String(n))}
              disabled={isLoading}
              data-testid={`pin-setup-digit-${n}`}
              className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full aspect-square bg-white border border-slate-200/80 shadow-[0_4px_14px_-2px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:border-slate-300 active:scale-95 active:bg-slate-100 transition-all flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none"
            >
              <span className="text-2xl sm:text-[28px] font-semibold text-slate-800 leading-none">
                {n}
              </span>
            </button>
          ))}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isLoading}
              data-testid="pin-setup-back-nav-button"
              aria-label="Back"
              className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full aspect-square bg-transparent hover:bg-slate-100/70 active:scale-95 transition-all text-slate-500 hover:text-slate-800 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronLeft size={26} />
            </button>
          ) : (
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px]" />
          )}
          <button
            type="button"
            onClick={() => appendDigit('0')}
            disabled={isLoading}
            data-testid="pin-setup-digit-0"
            className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full aspect-square bg-white border border-slate-200/80 shadow-[0_4px_14px_-2px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:border-slate-300 active:scale-95 active:bg-slate-100 transition-all flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none"
          >
            <span className="text-2xl sm:text-[28px] font-semibold text-slate-800 leading-none">
              0
            </span>
          </button>
          <button
            type="button"
            onClick={deleteDigit}
            disabled={isLoading || currentPinVal.length === 0}
            data-testid="pin-setup-delete-button"
            aria-label="Delete digit"
            className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full aspect-square bg-transparent hover:bg-slate-100/70 active:scale-95 transition-all text-slate-500 hover:text-slate-800 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Delete size={24} className="text-slate-600 stroke-[1.8]" />
            )}
          </button>
        </div>

        {/* Reveal toggle */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setShowPin(r => !r)}
            data-testid="pin-setup-reveal-toggle"
            className="hover:text-slate-600 font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
