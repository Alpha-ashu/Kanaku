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
} from 'lucide-react';
import { DISPLAY_FONT } from '@/app/components/ui/KANAKULogo';
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

  const triggerShake = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setPin('');
    setTimeout(() => {
      setShake(false);
    }, 500);
  };

  const appendDigit = useCallback((d: string) => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => (prev.length < 12 ? prev + d : prev));
  }, [isVerifying]);

  const deleteDigit = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

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
      } catch (err) {
        triggerShake((err as Error)?.message || 'Incorrect PIN. Please try again.');
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
  }, [isVerifying, showResetModal, pin, handleVerify, appendDigit, deleteDigit]);

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
    } catch (err) {
      setResetError((err as Error)?.message || 'Failed to send verification code.');
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
    } catch (err) {
      setResetError((err as Error)?.message || 'Invalid or expired verification code.');
    } finally {
      setIsResettingPin(false);
    }
  };

  return (
    <div
      data-testid="vault-lock-overlay"
      className="w-full max-w-sm mx-auto flex flex-col items-center justify-center py-2 sm:py-4 px-2 sm:px-4 select-none"
    >
      {/* Hidden input to capture physical keyboard input without triggering browser credential autofill */}
      <input
        ref={hiddenInputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        name="kanaku-vault-pin"
        id="kanaku-vault-pin"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="w-full flex flex-col gap-2.5 sm:gap-3.5">
        {/* Compact Security Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25 flex items-center justify-center mb-1.5">
            <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h2
            className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Kanaku Vault
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 font-medium max-w-[260px] leading-tight mt-0.5">
            Enter your 4–12 digit PIN to unlock
          </p>
        </div>

        {/* PIN Dots Section */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          {/* PIN Dots Display Pill */}
          <div
            data-testid="vault-pin-dots-container"
            onClick={() => hiddenInputRef.current?.focus()}
            className={`w-full max-w-[270px] sm:max-w-[300px] mx-auto min-h-[46px] sm:min-h-[50px] px-3.5 py-2 rounded-2xl bg-white border-2 flex items-center justify-center transition-all cursor-pointer ${
              shake && errorMsg
                ? 'border-red-400 bg-red-50/60 shadow-sm shadow-red-500/20 animate-[shake_0.4s_ease-in-out]'
                : pin.length > 0
                ? 'border-blue-600 ring-4 ring-blue-100/60 shadow-sm shadow-blue-500/15'
                : 'border-slate-200/90 hover:border-slate-300 bg-slate-50/50'
            }`}
          >
            {pin.length === 0 ? (
              /* Empty state: 4 subtle dot slots */
              <div className="flex items-center gap-2.5 sm:gap-3 py-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 transition-all ${
                      i === 0
                        ? 'border-blue-600 bg-blue-50 scale-105'
                        : 'border-slate-300 bg-transparent'
                    }`}
                  >
                    {i === 0 && (
                      <div className="w-full h-full rounded-full bg-blue-600/30 animate-ping" />
                    )}
                  </div>
                ))}
              </div>
            ) : !showReveal ? (
              /* Masked PIN Dots */
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap py-1">
                {pin.split('').map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full transition-all duration-150 transform scale-100 ${
                      shake && errorMsg
                        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                        : 'bg-blue-600 shadow-[0_0_8px_rgba(147,51,234,0.4)]'
                    } animate-in zoom-in-50 duration-150`}
                  />
                ))}
                {/* If less than 4 digits typed, show placeholder slots for remaining */}
                {pin.length < 4 &&
                  Array.from({ length: 4 - pin.length }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-300 bg-transparent scale-90"
                    />
                  ))}
                {/* Active blinking cursor */}
                {pin.length < 12 && !(shake && errorMsg) && (
                  <div className="w-[2px] h-4 bg-blue-600 rounded-full animate-[blink_1s_infinite] ml-0.5" />
                )}
              </div>
            ) : (
              /* Revealed Digit Chips */
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap py-0.5">
                {pin.split('').map((digit, i) => (
                  <div
                    key={i}
                    className="w-6 h-7 sm:w-7 sm:h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 font-black text-sm sm:text-base flex items-center justify-center animate-in zoom-in-75 duration-100"
                  >
                    {digit}
                  </div>
                ))}
                {pin.length < 12 && (
                  <div className="w-[2px] h-5 bg-blue-600 rounded-full animate-[blink_1s_infinite] ml-0.5" />
                )}
              </div>
            )}
          </div>

          {/* Show/Hide Toggle & Error Banner */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowReveal((r) => !r)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-blue-600 text-2xs font-bold transition-colors cursor-pointer py-0.5"
            >
              {showReveal ? <EyeOff size={13} /> : <Eye size={13} />}
              {showReveal ? 'HIDE PIN' : 'SHOW PIN'}
            </button>

            <div className="min-h-[18px] flex items-center justify-center">
              {errorMsg && (
                <p className="text-red-500 text-2xs font-bold text-center flex items-center justify-center gap-1 animate-in fade-in-50 duration-150">
                  <AlertCircle size={12} /> {errorMsg}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 w-full max-w-[270px] sm:max-w-[300px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => appendDigit(String(n))}
              disabled={isVerifying}
              className="h-11 sm:h-13 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all text-lg sm:text-xl font-bold text-slate-800 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-slate-200/80 shadow-2xs touch-manipulation select-none"
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
            className="h-11 sm:h-13 rounded-2xl bg-transparent hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all text-slate-500 hover:text-blue-600 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer touch-manipulation"
          >
            <KeyRound size={18} />
          </button>

          <button
            type="button"
            onClick={() => appendDigit('0')}
            disabled={isVerifying}
            className="h-11 sm:h-13 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all text-lg sm:text-xl font-bold text-slate-800 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-slate-200/80 shadow-2xs touch-manipulation select-none"
          >
            0
          </button>

          <button
            type="button"
            onClick={deleteDigit}
            disabled={isVerifying}
            className="h-11 sm:h-13 rounded-2xl bg-transparent hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all text-slate-500 hover:text-slate-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-lg touch-manipulation"
          >
            {isVerifying ? (
              <Loader2 size={18} className="animate-spin text-blue-600" />
            ) : (
              '⌫'
            )}
          </button>
        </div>

        {/* Unlock Action Button */}
        <button
          type="button"
          onClick={() => handleVerify()}
          disabled={pin.length < 4 || isVerifying}
          className={`w-full max-w-[270px] sm:max-w-[300px] mx-auto h-11 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            pin.length >= 4
              ? 'bg-[#18181B] hover:bg-black active:bg-zinc-900 text-white shadow-sm active:scale-98'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/60'
          }`}
        >
          {isVerifying ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <Lock size={15} />
              <span>{pin.length >= 4 ? 'Unlock Vault' : 'Enter 4–12 Digits'}</span>
            </>
          )}
        </button>

        {/* Biometric Unlock (if enrolled) */}
        {biometric?.available && biometricEnrolled && (
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={isVerifying || biometricBusy}
            className="flex items-center justify-center gap-2 mx-auto rounded-full border border-blue-200 bg-blue-50/60 hover:bg-blue-50 px-4 py-1.5 text-xs font-bold text-blue-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {biometricBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : biometric.isFace ? (
              <ScanFace size={14} />
            ) : (
              <Fingerprint size={14} />
            )}
            {biometricBusy ? 'Verifying…' : `Unlock with ${biometric.label}`}
          </button>
        )}

        {/* Compact 1-line Security Footer */}
        <div className="flex items-center justify-center gap-1.5 text-slate-400 text-2xs font-medium py-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>AES-256 Zero-Knowledge Protection</span>
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
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-1">
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
                        autoComplete="one-time-code"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        value={resetOtpInputs[i]}
                        onChange={(e) => handleResetOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleResetOtpKeyDown(i, e)}
                        onPaste={handleResetOtpPaste}
                        data-testid={`vault-reset-otp-${i}`}
                        className="w-10 h-10 sm:w-11 sm:h-11 text-center text-lg font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                        autoFocus={i === 0}
                      />
                    ))}
                </div>
                <button
                  type="button"
                  onClick={handleSendResetOtp}
                  disabled={isResettingPin}
                  className="self-center text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 py-1 cursor-pointer"
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
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isResettingPin ? <Loader2 size={16} className="animate-spin" /> : null}
                  <span>Verify & Unlock</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendResetOtp}
                  disabled={isResettingPin}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
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
