import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ShieldCheck, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { backupPINKeys, isPINSet, restorePINKeys, storeMasterKey, verifyPIN } from '@/lib/encryption';
import { isPinMissing, isPinServiceUnavailable, pinService } from '@/services/pinService';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';

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

  // Keep hidden input focused
  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [step]);

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

      if (!result.success && step !== 'enter' && !isPinServiceUnavailable(result)) {
        setError(result.message || 'PIN request failed. Please try again.');
        setIsLoading(false);
        return;
      }

      if (step === 'enter' && !isPINSet()) {
        const keyBackupResult = await pinService.getKeyBackup();
        if (keyBackupResult.success && keyBackupResult.backup) {
          const [hash, salt] = keyBackupResult.backup.split('|');
          if (hash && salt) {
            restorePINKeys({ hash, salt });
          }
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

      const backup = backupPINKeys();
      if (backup.hash && backup.salt) {
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

        const backupResult = await pinService.saveKeyBackup(`${backup.hash}|${backup.salt}`, securityToken);
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
    ? 'Enter your PIN' 
    : 'Create your PIN';

  const currentStepSub = step === 'confirm'
    ? 'Re-enter the same PIN to confirm'
    : step === 'enter'
    ? 'Please enter your 6 digit PIN'
    : 'Choose a 6-digit PIN to secure your account';

  return (
    <div data-testid="pinsetup-div" 
      className="fixed inset-0 z-50 overflow-y-auto bg-white flex items-center justify-center p-4"
      onClick={() => hiddenInputRef.current?.focus()}
    >
      <form data-testid="pinsetup-form"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden' }}
        autoComplete="off"
        onSubmit={e => e.preventDefault()}
      >
        <input
          ref={hiddenInputRef}
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="new-password"
          value={currentPinVal}
          onChange={handleInputChange}
          tabIndex={0}
          data-testid="pin-setup-hidden-input"
        />
      </form>

      <div className="w-full max-w-md p-6 md:p-8 flex flex-col">
        {/* Header */}
        <div className="pt-4 pb-6 flex flex-col items-center px-6">
          <div className="mb-4">
            <KANAKULogo className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter mb-1">KANAKU</h1>
          <p className="text-sm text-gray-500 font-medium text-center max-w-[240px] leading-tight">
            {currentStepSub}
          </p>
        </div>

        {/* Card Content */}
        <div className="px-8 flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">
              {step !== 'enter' ? `Step ${step === 'create' ? '1' : '2'} of 2` : 'Secure Unlock'}
            </p>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{currentStepLabel}</h2>
            {step === 'confirm' && (
              <button
                type="button"
                onClick={() => { setStep('create'); setPin(''); setConfirmPin(''); setError(null); }}
                data-testid="pin-setup-confirm-back-button"
                className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors mt-2"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>

          {/* PIN digit boxes */}
          <div data-testid="pinsetup-div-2" className="flex justify-center gap-3 cursor-pointer" onClick={() => hiddenInputRef.current?.focus()}>
            {Array.from({ length: 6 }, (_, i) => {
              const isActive = i === currentPinVal.length;
              const isFilled = i < currentPinVal.length;
              const revealed = showPin && isFilled ? currentPinVal[i] : undefined;

              return (
                <div
                  key={i}
                  className={`w-11 h-11 md:w-14 md:h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                    isActive
                      ? 'border-gray-900 bg-white ring-4 ring-gray-100'
                      : isFilled
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white/50 text-transparent'
                  } ${error && pin.length === 6 ? 'border-red-400 bg-red-50 text-red-600' : ''}`}
                >
                  {revealed !== undefined ? revealed : isFilled ? '●' : ''}
                  {isActive && <div className="w-[2.5px] h-5 bg-gray-900 animate-[blink_1s_infinite]" />}
                </div>
              );
            })}
          </div>

          {/* Show/hide toggle + error */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowPin(r => !r)}
              data-testid="pin-setup-reveal-toggle"
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-900 text-[10px] font-bold transition-colors"
            >
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPin ? 'HIDE PIN' : 'SHOW PIN'}
            </button>
            <div className="h-6 mt-1 flex items-center justify-center">
              {error && (
                <p className="text-red-500 text-[10px] font-bold text-center">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Number pad */}
          <div className="hidden md:grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => appendDigit(String(n))}
                disabled={isLoading}
                data-testid={`pin-setup-digit-${n}`}
                className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
              >
                {n}
              </button>
            ))}
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                disabled={isLoading}
                data-testid="pin-setup-back-nav-button"
                className="h-14 rounded-2xl bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronLeft size={20} />
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={() => appendDigit('0')}
              disabled={isLoading}
              data-testid="pin-setup-digit-0"
              className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
            >
              0
            </button>
            <button
              type="button"
              onClick={deleteDigit}
              disabled={isLoading}
              data-testid="pin-setup-delete-button"
              className="h-14 rounded-2xl bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none animate-none"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                '⌫'
              )}
            </button>
          </div>

          {/* Security banner */}
          <div className="bg-gray-100/50 border border-gray-100 rounded-[28px] p-5 flex flex-col items-center text-center gap-2 mt-2 mb-4">
            <ShieldCheck className="text-emerald-500" size={20} />
            <div>
              <p className="text-gray-900 text-[11px] font-black uppercase tracking-wider mb-1">Secure Encryption</p>
              <p className="text-gray-500 text-[10px] leading-relaxed max-w-[220px]">
                Your financial data stays encrypted on this device. Only PIN verification metadata is stored securely.
              </p>
            </div>
          </div>
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
