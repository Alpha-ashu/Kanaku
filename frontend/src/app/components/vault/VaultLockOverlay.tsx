import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  KeyRound,
  AlertCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Loader2,
  Fingerprint,
  ScanFace,
  ChevronLeft,
} from 'lucide-react';
import { KANAKULogo, DISPLAY_FONT } from '@/app/components/ui/KANAKULogo';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { vaultService } from '@/services/vaultService';
import {
  type BiometricAvailability,
  getBiometricAvailability,
  isBiometricEnabled,
  unlockWithBiometrics,
} from '@/services/biometricAuthService';

interface VaultLockOverlayProps {
  onUnlocked: () => void;
  expectedPinLength?: number;
}

export const VaultLockOverlay: React.FC<VaultLockOverlayProps> = ({
  onUnlocked,
  expectedPinLength = 6,
}) => {
  const { user } = useAuth();

  const [pin, setPin] = useState('');
  const [targetPinLength, setTargetPinLength] = useState<number>(expectedPinLength);
  const [showReveal, setShowReveal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Forgot PIN Modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpInputs, setResetOtpInputs] = useState<string[]>(Array(6).fill(''));
  const resetOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Biometrics
  const [biometric, setBiometric] = useState<BiometricAvailability | null>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  // Hidden input ref for keyboard trapping
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Sync when expectedPinLength prop updates
  useEffect(() => {
    if (expectedPinLength && expectedPinLength >= 4) {
      setTargetPinLength(expectedPinLength);
    }
  }, [expectedPinLength]);

  // Fetch lock status on mount to know exact configured PIN length
  useEffect(() => {
    vaultService.getLockStatus()
      .then((status) => {
        if (status.pinLength && status.pinLength >= 4) {
          setTargetPinLength(status.pinLength);
        }
      })
      .catch(() => {});
  }, []);

  // Probe biometrics
  useEffect(() => {
    let mounted = true;
    (async () => {
      const avail = await getBiometricAvailability();
      if (!mounted) return;
      setBiometric(avail);
      setBiometricEnrolled(isBiometricEnabled());
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Compute number of display boxes: match target length, or expand if user types more
  const displayLength = Math.max(targetPinLength, pin.length);

  const triggerShake = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setPin('');
    setTimeout(() => {
      setShake(false);
    }, 500);
  };

  const appendDigit = (d: string) => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => (prev.length < 12 ? prev + d : prev));
  };

  const deleteDigit = () => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleVerify = useCallback(
    async (pinToVerify?: string) => {
      const currentPin = pinToVerify ?? pin;
      if (currentPin.length < 4 || isVerifying) return;

      setIsVerifying(true);
      setErrorMsg('');

      try {
        const res = await vaultService.verifyLock(currentPin);
        if (res.verified) {
          toast.success('Kanaku Vault unlocked');
          onUnlocked();
        } else {
          triggerShake('Incorrect PIN. Please try again.');
        }
      } catch (err: any) {
        triggerShake(err.message || 'Incorrect PIN. Please try again.');
      } finally {
        setIsVerifying(false);
      }
    },
    [pin, isVerifying, onUnlocked],
  );

  // Auto-verify when reaching targetPinLength
  useEffect(() => {
    if (pin.length === targetPinLength && targetPinLength >= 4 && !isVerifying) {
      const timer = setTimeout(() => {
        handleVerify();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [pin, targetPinLength, isVerifying, handleVerify]);

  // Physical keyboard listener
  useEffect(() => {
    if (isVerifying || showResetModal) return;

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
      } else if (e.key === 'Enter' && pin.length >= 4) {
        e.preventDefault();
        handleVerify();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isVerifying, showResetModal, pin, handleVerify]);

  // Biometric Unlock
  const handleBiometricUnlock = async () => {
    if (biometricBusy || isVerifying) return;
    setBiometricBusy(true);
    setErrorMsg('');

    try {
      const outcome = await unlockWithBiometrics();
      if (outcome.status === 'success') {
        setBiometricBusy(false);
        await handleVerify(outcome.pin);
      } else if (outcome.status === 'failed' || outcome.status === 'unavailable') {
        setErrorMsg(outcome.message || 'Biometric verification failed');
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  // Forgot PIN Flow
  const handleForgotPin = () => {
    if (!user?.email) {
      toast.error('No account email found. Please sign in again.');
      return;
    }
    setResetError('');
    setResetOtpSent(false);
    setResetOtpInputs(Array(6).fill(''));
    setShowResetModal(true);
  };

  const handleSendResetOtp = async () => {
    setIsResettingPin(true);
    setResetError('');
    try {
      await apiClient.post('/otp/send', {
        destination: user!.email,
        channel: 'email',
        purpose: 'sensitive_action',
      });
      setResetOtpInputs(Array(6).fill(''));
      setResetOtpSent(true);
      toast.success('Verification code sent to your email.');
    } catch (err: any) {
      setResetError(err.message || 'Failed to send verification code.');
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleResetOtpChange = (index: number, val: string) => {
    const sanitized = val.replace(/\D/g, '').slice(-1);
    const newOtp = [...resetOtpInputs];
    newOtp[index] = sanitized;
    setResetOtpInputs(newOtp);

    if (sanitized && index < 5) {
      resetOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleResetOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!resetOtpInputs[index] && index > 0) {
        const newOtp = [...resetOtpInputs];
        newOtp[index - 1] = '';
        setResetOtpInputs(newOtp);
        resetOtpRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...resetOtpInputs];
        newOtp[index] = '';
        setResetOtpInputs(newOtp);
      }
    }
  };

  const handleResetOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length > 0) {
      const newOtp = [...resetOtpInputs];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = text[i] || '';
      }
      setResetOtpInputs(newOtp);
      const focusIndex = Math.min(text.length, 5);
      resetOtpRefs.current[focusIndex]?.focus();
    }
  };

  const handleVerifyOtpAndUnlock = async () => {
    const code = resetOtpInputs.join('');
    if (code.length < 6) {
      setResetError('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsResettingPin(true);
    setResetError('');

    try {
      // 1. Verify OTP with backend
      await apiClient.post('/otp/verify', {
        destination: user!.email,
        purpose: 'sensitive_action',
        otp: code,
      });

      // 2. Reset Vault lock setting
      await vaultService.resetLock();

      setShowResetModal(false);
      toast.success('Vault unlocked! Lock PIN has been reset.');
      onUnlocked();
    } catch (err: any) {
      setResetError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsResettingPin(false);
    }
  };

  return (
    <div
      data-testid="vault-lock-overlay"
      className="fixed inset-0 z-[100] overflow-y-auto bg-white flex flex-col items-center justify-start sm:justify-center p-3 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-full select-none"
    >
      {/* Hidden input to prevent software keyboard conflict while retaining hardware input */}
      <input
        ref={hiddenInputRef}
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="w-full max-w-md p-3 sm:p-6 md:p-8 flex flex-col my-auto">
        {/* Header */}
        <div className="pt-2 sm:pt-4 pb-3 sm:pb-6 flex flex-col items-center px-4 sm:px-6">
          <div className="mb-2 sm:mb-4">
            <KANAKULogo className="w-10 h-10 sm:w-12 sm:h-12" />
          </div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-[0.02em] mb-1"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            KANAKU
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium text-center max-w-[260px] leading-tight">
            Enter your PIN to access Kanaku Vault
          </p>
        </div>

        {/* Card Content */}
        <div className="px-2 sm:px-6 md:px-8 flex flex-col gap-3.5 sm:gap-6">
          {/* Step label */}
          <div className="flex flex-col items-center text-center">
            <p className="text-2xs font-black uppercase tracking-[0.2em] text-purple-600 mb-0.5 sm:mb-1">
              Secure Vault Unlock
            </p>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Enter Vault PIN
            </h2>
          </div>

          {/* PIN Digit Boxes */}
          <div className="flex justify-center gap-1.5 sm:gap-2.5 flex-wrap">
            {Array.from({ length: displayLength }, (_, i) => {
              const isActive = i === pin.length;
              const isFilled = i < pin.length;
              const hasError = Boolean(errorMsg) && shake;
              const revealed = showReveal && i < pin.length ? pin[i] : undefined;

              return (
                <div
                  key={i}
                  className={`w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl sm:rounded-2xl border-2 flex items-center justify-center text-lg sm:text-xl font-black transition-all ${
                    hasError
                      ? 'border-red-400 bg-red-50 text-red-600'
                      : isActive
                      ? 'border-purple-600 bg-white ring-2 sm:ring-4 ring-purple-100'
                      : isFilled
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-gray-200 bg-white/50 text-transparent'
                  } ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
                >
                  {revealed !== undefined ? revealed : isFilled ? '●' : ''}
                  {isActive && (
                    <div className="w-[2px] sm:w-[2.5px] h-4 sm:h-5 bg-purple-600 animate-[blink_1s_infinite]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Show/Hide Toggle & Error Banner */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowReveal((r) => !r)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-purple-600 text-2xs font-bold transition-colors cursor-pointer"
            >
              {showReveal ? <EyeOff size={14} /> : <Eye size={14} />}
              {showReveal ? 'HIDE PIN' : 'SHOW PIN'}
            </button>

            <div className="min-h-5 mt-1">
              {errorMsg && (
                <p className="text-red-500 text-2xs font-bold text-center flex items-center justify-center gap-1">
                  <AlertCircle size={12} /> {errorMsg}
                </p>
              )}
            </div>
          </div>

          {/* Number Pad */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[280px] sm:max-w-[320px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => appendDigit(String(n))}
                disabled={isVerifying}
                className="h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all text-lg sm:text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-slate-100 shadow-2xs"
              >
                {n}
              </button>
            ))}

            {/* Bottom Row */}
            <button
              type="button"
              onClick={handleForgotPin}
              disabled={isVerifying}
              title="Forgot PIN? Reset via email"
              className="h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-50 active:bg-slate-100 transition-all text-gray-500 hover:text-purple-600 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <KeyRound size={18} />
            </button>

            <button
              type="button"
              onClick={() => appendDigit('0')}
              disabled={isVerifying}
              className="h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all text-lg sm:text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-slate-100 shadow-2xs"
            >
              0
            </button>

            <button
              type="button"
              onClick={deleteDigit}
              disabled={isVerifying}
              className="h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-50 active:bg-slate-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-lg"
            >
              {isVerifying ? (
                <Loader2 size={18} className="animate-spin text-purple-600" />
              ) : (
                '⌫'
              )}
            </button>
          </div>

          {/* Manual submit button if pin length is 4 or more */}
          {pin.length >= 4 && (
            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={isVerifying}
              className="w-full max-w-[280px] sm:max-w-[320px] mx-auto h-11 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs sm:text-sm font-bold shadow-sm shadow-purple-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>Unlock Vault</span>
                </>
              )}
            </button>
          )}

          {/* Biometric Unlock (if enrolled) */}
          {biometric?.available && biometricEnrolled && (
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={isVerifying || biometricBusy}
              className="flex items-center justify-center gap-2 mx-auto rounded-full border border-purple-200 bg-purple-50/50 hover:bg-purple-50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-purple-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {biometricBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : biometric.isFace ? (
                <ScanFace size={16} />
              ) : (
                <Fingerprint size={16} />
              )}
              {biometricBusy ? 'Verifying…' : `Unlock with ${biometric.label}`}
            </button>
          )}

          {/* Security Banner */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl sm:rounded-[24px] p-3 sm:p-4 flex flex-col items-center text-center gap-1.5 mt-1 sm:mt-2 mb-2">
            <ShieldCheck className="text-emerald-500" size={18} />
            <div>
              <p className="text-gray-900 text-2xs font-black uppercase tracking-wider mb-0.5">
                Vault Protected
              </p>
              <p className="text-gray-500 text-2xs leading-relaxed max-w-[260px]">
                Protected with zero-knowledge AES-256 encryption. Documents remain secure until unlocked.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot PIN Modal (Email OTP Verification) */}
      {showResetModal && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300">
          <div
            className="bg-white border border-slate-100 rounded-[32px] w-full max-w-sm p-6 md:p-8 shadow-2xl flex flex-col gap-5 animate-in fade-in-50 zoom-in-95 duration-200 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20 mb-1">
                <KeyRound className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Reset Vault PIN?
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 leading-relaxed max-w-[260px]">
                {resetOtpSent
                  ? `Enter the 6-digit verification code sent to ${user?.email || 'your email'}.`
                  : `We will send a secure verification code to ${user?.email || 'your email'} to reset your Vault PIN.`}
              </p>
            </div>

            {resetError && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 rounded-2xl p-3.5 text-xs font-semibold text-rose-700 animate-shake">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-500" />
                <p className="leading-snug">{resetError}</p>
              </div>
            )}

            {resetOtpSent && (
              <div className="flex flex-col gap-2">
                <label className="block text-2xs font-black uppercase tracking-widest text-slate-400 text-center">
                  Verification Code
                </label>
                <div className="flex justify-between gap-1.5 max-w-[280px] mx-auto w-full">
                  {Array(6)
                    .fill(0)
                    .map((_, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          resetOtpRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={resetOtpInputs[i]}
                        onChange={(e) => handleResetOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleResetOtpKeyDown(i, e)}
                        onPaste={handleResetOtpPaste}
                        data-testid={`vault-reset-otp-${i}`}
                        className="w-10 h-10 sm:w-11 sm:h-11 text-center text-lg font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all duration-200"
                        autoFocus={i === 0}
                      />
                    ))}
                </div>
                <button
                  type="button"
                  onClick={handleSendResetOtp}
                  disabled={isResettingPin}
                  className="self-center text-xs font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50 py-1 cursor-pointer"
                >
                  Didn't get code? Resend
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetOtpInputs(Array(6).fill(''));
                  setResetError('');
                }}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              {resetOtpSent ? (
                <button
                  type="button"
                  onClick={handleVerifyOtpAndUnlock}
                  disabled={isResettingPin || resetOtpInputs.join('').length < 6}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isResettingPin ? <Loader2 size={16} className="animate-spin" /> : null}
                  <span>Verify & Unlock</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendResetOtp}
                  disabled={isResettingPin}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isResettingPin ? <Loader2 size={16} className="animate-spin" /> : null}
                  <span>Send Code</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
