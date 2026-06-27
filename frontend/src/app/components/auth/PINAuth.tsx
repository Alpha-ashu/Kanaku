import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, KeyRound, AlertCircle, ChevronLeft, ShieldCheck, Eye, EyeOff, Lock } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { clearSecurityData, isPINSet, verifyPIN, storeMasterKey, backupPINKeys, restorePINKeys } from '@/lib/encryption';
import { isPinMissing, isPinServiceUnavailable, isSessionExpired, pinService } from '@/services/pinService';
import { toast } from 'sonner';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { isGuestMode } from '@/lib/guestMode';
import supabase from '@/utils/supabase/client';

interface PINAuthProps {
 onAuthenticated: (encryptionKey: string) => void;
}


export const PINAuth: React.FC<PINAuthProps> = ({ onAuthenticated }) => {
 const { signOut, user } = useAuth();

 // State 
 const [isCreating, setIsCreating] = useState(false);
 const [createStage, setCreateStage] = useState<'enter' | 'confirm'>('enter');
 const [pin, setPin] = useState('');
 const [firstPin, setFirstPin] = useState(''); // stores first entry during create
 const [showReveal, setShowReveal] = useState(false);
 const [isLoading, setIsLoading] = useState(true); // loading while checking server
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [shake, setShake] = useState(false);
 const [errorMsg, setErrorMsg] = useState('');
 const [showResetModal, setShowResetModal] = useState(false);
 const [isResettingPin, setIsResettingPin] = useState(false);
 const [isLoggingOut, setIsLoggingOut] = useState(false);
 const [resetError, setResetError] = useState('');
 const [resetOtpSent, setResetOtpSent] = useState(false);
 const [resetOtp, setResetOtp] = useState('');
 // True when this lock screen was reached via the inactivity auto-lock, so we
 // can explain why the user is being asked for their PIN again.
 const [lockedForInactivity, setLockedForInactivity] = useState(false);
 // True when the server rejected the unlock because the session is too old to
 // refresh — we then show a "Sign in again" button instead of a wrong-PIN hint.
 const [sessionExpired, setSessionExpired] = useState(false);
 const [isReLoggingIn, setIsReLoggingIn] = useState(false);

 const hiddenInputRef = useRef<HTMLInputElement>(null);

 // Read (and consume) the auto-lock reason flag set by SecurityContext.
 useEffect(() => {
 try {
 if (sessionStorage.getItem('KANAKU_lock_reason') === 'inactivity') {
 setLockedForInactivity(true);
 sessionStorage.removeItem('KANAKU_lock_reason');
 }
 } catch {
 /* sessionStorage unavailable — no banner, no harm */
 }
 }, []);

 // Init 
 useEffect(() => {
 let mounted = true;
 (async () => {
 try {
 // Guest mode: no server calls - PIN is local only
 if (isGuestMode()) {
 if (mounted) {
 setIsCreating(!isPINSet());
 setIsLoading(false);
 }
 return;
 }

 const status = await pinService.getStatus();
 const hasLocalPin = isPINSet();

 if (status.success && !hasLocalPin) {
 const kbr = await pinService.getKeyBackup();
 if (kbr.success && kbr.backup) {
 const [hash, salt] = kbr.backup.split('|');
 if (hash && salt) restorePINKeys({ hash, salt });
 }
 }

  if (mounted) {
    const serverHasNoPin = isPinMissing(status);
    // Show create flow ONLY if the server explicitly has no PIN configured.
    // If the server has a PIN, we show the enter/verify screen so the user can
    // type it in to verify and restore the local encryption keys.
    const shouldCreate = serverHasNoPin;
    setIsCreating(shouldCreate);
    setIsLoading(false);
  }
 } catch {
 // Network/server error -> if no local PIN, assume new user and show create flow
 if (mounted) {
 const hasLocalPin = isPINSet();
 setIsCreating(!hasLocalPin);
 setIsLoading(false);
 }
 }
 })();
 return () => { mounted = false; };
 }, []);

 // Always focus hidden input on mount & when pin changes
 useEffect(() => {
 if (!isLoading) hiddenInputRef.current?.focus();
 }, [isLoading, isCreating, createStage]);

 // Helpers 
 const triggerShake = (msg: string) => {
 setErrorMsg(msg);
 setShake(true);
 setPin('');
 setTimeout(() => setShake(false), 500);
 };

  const finalizeAuth = useCallback(async (key: string, msg: string) => {
  if (Capacitor.isNativePlatform()) {
  await Preferences.set({ key: 'user_authenticated', value: 'true' });
  }
  console.log('[KANAKU Startup] PIN Verified & Application Unlocked');
  toast.success(msg);
  onAuthenticated(key);
  }, [onAuthenticated]);

 // PIN input handler (hidden input + numpad both write here) 
  const appendDigit = (d: string) => {
    if (isSubmitting) return;
    setErrorMsg('');
    setPin(prev => prev.length < 6 ? prev + d : prev);
  };

  const deleteDigit = () => {
    if (isSubmitting) return;
    setErrorMsg('');
    setPin(prev => prev.slice(0, -1));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting) return;
    setErrorMsg('');
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(val);
  };

  const handleHiddenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pin.length === 6) {
      e.preventDefault();
      handleSubmit();
    }
  };

 // Auto-submit when 6 digits entered
 useEffect(() => {
 if (pin.length === 6 && !isSubmitting) {
 const t = setTimeout(handleSubmit, 120);
 return () => clearTimeout(t);
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pin]);

  // Submit logic 
  const handleSubmit = async () => {
    if (pin.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    setSessionExpired(false);

    try {
      if (isCreating) {
        if (createStage === 'enter') {
          // Check if PIN is weak
          if (pinService.isWeakPin(pin)) {
            triggerShake('PIN is too weak. Avoid sequential, repeating, or common patterns.');
            setIsSubmitting(false);
            return;
          }
          // Move to confirm stage
          setFirstPin(pin);
          setPin('');
          setCreateStage('confirm');
          setIsSubmitting(false);
          return;
        }

        // Confirm stage - check match
        if (pin !== firstPin) {
          triggerShake("PINs don't match. Try again.");
          setCreateStage('enter');
          setFirstPin('');
          setIsSubmitting(false);
          return;
        }

        // Server sync is best-effort - always proceed after PINs match.
        // Guest mode: skip server entirely.
        if (!isGuestMode()) {
          pinService.createPin(pin)
            .then(result => {
              if (result.success) {
                const backup = backupPINKeys();
                if (backup.hash && backup.salt) {
                  pinService.verifySecurity().then(sec => {
                    if (sec.success && sec.securityToken) {
                      pinService.saveKeyBackup(`${backup.hash}|${backup.salt}`, sec.securityToken).catch(() => { });
                    }
                  }).catch(() => { });
                }
              }
            })
            .catch(() => { });
        }

        const key = await storeMasterKey(pin);
        await finalizeAuth(key, 'PIN created! Welcome to KANAKU');

      } else {
        // Guest mode: verify locally only, no server call.
        if (isGuestMode()) {
          const localResult = await verifyPIN(pin);
          if (localResult.isValid && localResult.key) {
            await finalizeAuth(localResult.key, 'Welcome back!');
          } else {
            triggerShake('Incorrect PIN. Please try again.');
            setIsSubmitting(false);
          }
          return;
        }

        // Non-guest mode: Must call server-side verification first to prevent PIN bypasses.
        const serverResult = await pinService.verifyPin({ pin });

        if (serverResult.success) {
          // Server verified the PIN successfully!
          let localResult = await verifyPIN(pin);
          if (!localResult.isValid || !localResult.key) {
            // Local keys are missing/mismatched (e.g., storage cleared) -> restore from server backup
            const kbr = await pinService.getKeyBackup();
            if (kbr.success && kbr.backup) {
              const [hash, salt] = kbr.backup.split('|');
              if (hash && salt) restorePINKeys({ hash, salt });
            }
            localResult = await verifyPIN(pin);
          }

          // If we still don't have local keys, re-derive them using the validated PIN
          const key = localResult.key || await storeMasterKey(pin);
          await finalizeAuth(key, 'Welcome back!');
        } else {
          // Server verification failed
          if (isPinServiceUnavailable(serverResult)) {
            // Server is unreachable -> fall back to checking local hash to support offline access
            const localResult = await verifyPIN(pin);
            if (localResult.isValid && localResult.key) {
              await finalizeAuth(localResult.key, 'Welcome back! (Offline Mode)');
              return;
            }
            triggerShake('Unable to verify PIN right now. Please try again.');
          } else if (isSessionExpired(serverResult)) {
            // The session is too old to refresh — a valid PIN can't recover it.
            // Surface a re-login action rather than a misleading "wrong PIN".
            setSessionExpired(true);
            triggerShake(serverResult.message || 'Invalid or expired session');
          } else {
            // Server explicitly rejected the PIN (incorrect PIN, locked, or expired)
            triggerShake(serverResult.message || 'Incorrect PIN. Please try again.');
          }
          setIsSubmitting(false);
        }
      }
    } catch {
      triggerShake('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

 const handleSignOut = async () => {
 setIsLoggingOut(true);
 try {
 setShowResetModal(false);
 pinService.clearPinData();
 clearSecurityData();
 await signOut();
 } catch {
 toast.error('Failed to sign out. Please try again.');
 } finally {
 setIsLoggingOut(false);
 }
 };

 // Session expired beyond recovery: clear the dead session and return to the
 // login page so the user gets a fresh sign-in instead of a stuck PIN screen.
 const handleReLogin = async () => {
 setIsReLoggingIn(true);
 try {
 pinService.clearPinData();
 clearSecurityData();
 await signOut();
 } catch {
 /* best-effort — proceed regardless so the user is never stranded */
 } finally {
 // Soft, coordinated logout (no page reload): signOut() above clears `user`
 // so the Login screen renders via state; the event re-locks the PIN.
 if (typeof window !== 'undefined') {
 window.dispatchEvent(new CustomEvent('KANAKU_SESSION_EXPIRED', { detail: { reason: 'pin_relogin' } }));
 }
 setIsReLoggingIn(false);
 }
 };

 const handleForgotPin = () => {
 if (!user?.email) {
 toast.error('Email not found. Cannot reset PIN.');
 return;
 }
 setResetError('');
 setResetOtpSent(false);
 setResetOtp('');
 setShowResetModal(true);
 };

 const handleSendOtp = async () => {
 setIsResettingPin(true);
 setResetError('');
 try {
 const { error } = await supabase.auth.signInWithOtp({ email: user!.email });
 if (error) throw error;
 setResetOtpSent(true);
 toast.success('Verification code sent to your email.');
 } catch (err: any) {
 setResetError(err.message || 'Failed to send verification code.');
 } finally {
 setIsResettingPin(false);
 }
 };

  const handleVerifyOtpAndReset = async () => {
    setIsResettingPin(true);
    setResetError('');
    try {
      const { data: otpData, error } = await supabase.auth.verifyOtp({
        email: user!.email,
        token: resetOtp,
        type: 'email'
      });
      if (error) throw error;

      // Forgot-PIN path: the user has no PIN to verify, so prove the step-up
      // with the freshly-issued Supabase session token from the OTP check.
      const freshAuthToken = otpData?.session?.access_token;
      const secResult = await pinService.verifySecurity({ freshAuthToken });
      if (!secResult.success || !secResult.securityToken) {
        setResetError(secResult.message || 'Security verification failed');
        return;
      }

      const result = await pinService.resetCurrentUserPin(secResult.securityToken);
      if (!result.success) {
        setResetError(result.message || 'Failed to reset PIN on server');
        return;
      }

 clearSecurityData();
 pinService.clearPinData();

 setShowResetModal(false);
 setPin('');
 setFirstPin('');
 setIsCreating(true);
 setCreateStage('enter');
 toast.success('PIN reset successfully. Please create a new PIN.');
 } catch (err: any) {
 setResetError(err.message || 'Invalid verification code.');
 } finally {
 setIsResettingPin(false);
 }
 };

 // Derived display 
 const currentStepLabel = isCreating
 ? createStage === 'enter' ? 'Create your PIN' : 'Confirm your PIN'
 : 'Enter your PIN';

 const currentStepSub = isCreating
 ? createStage === 'enter'
 ? 'Choose a 6-digit PIN to secure your account'
 : 'Re-enter the same PIN to confirm'
 : 'Enter your PIN to access KANAKU';

 // Loading skeleton 
 if (isLoading) {
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a56f0]">
 <div className="flex flex-col items-center gap-4">
 <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
 <KANAKULogo className="w-9 h-9" />
 </div>
 <div className="w-7 h-7 border-3 border-white/30 border-t-white rounded-full animate-spin" />
 </div>
 </div>
 );
 }

 // Main render 
 return (
 <div data-testid="pinauth-div"
 className="fixed inset-0 z-50 overflow-y-auto bg-white flex items-center justify-center p-4"
 onClick={() => hiddenInputRef.current?.focus()}
 >
 {/* Hidden form - offscreen (not zero-size) so mobile browsers keep keyboard open after each digit */}
 <form data-testid="pinauth-form"
 className="pin-hidden-input-container"
 autoComplete="off"
 onSubmit={e => e.preventDefault()}
 >
 <input data-testid="pinauth-username"
 type="text"
 name="username"
 value={user?.email || ''}
 readOnly
 autoComplete="username"
 tabIndex={-1}
 aria-label="Username"
 aria-hidden="true"
 />
 <input
 ref={hiddenInputRef}
 type="password"
 name="pin"
 inputMode="numeric"
 autoComplete="one-time-code"
 value={pin}
 onChange={handleInputChange}
 onKeyDown={handleHiddenKeyDown}
 tabIndex={0}
 aria-label="PIN entry"
 data-testid="pin-auth-hidden-input"
 />
 </form>

 <div className="w-full max-w-md p-6 md:p-8 flex flex-col">
 {/* Header */}
 <div className="pt-4 pb-6 flex flex-col items-center px-6">
 <div className="mb-4">
 <KANAKULogo className="w-12 h-12" />
 </div>
 <h1 className="text-3xl font-black text-gray-900 tracking-tighter mb-1">KANAKU</h1>
 <p className="text-sm text-gray-500 font-medium text-center max-w-[240px] leading-tight">{currentStepSub}</p>
 </div>

 {/* Inactivity auto-lock notice */}
 {lockedForInactivity && !isCreating && (
 <div
 data-testid="pinauth-inactivity-banner"
 role="status"
 className="mx-6 mb-4 flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"
 >
 <Lock size={16} className="flex-shrink-0 text-amber-600" />
 <p className="text-xs font-medium leading-snug">
 Locked due to inactivity. Enter your PIN to continue.
 </p>
 </div>
 )}

 {/* Card Content */}
 <div className="px-8 flex flex-col gap-6">
 {/* Step label + back button for confirm stage */}
 <div className="flex flex-col items-center text-center">
 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">
 {isCreating ? `Step ${createStage === 'enter' ? '1' : '2'} of 2` : 'Secure Unlock'}
 </p>
 <h2 className="text-2xl font-black text-gray-900 tracking-tight">{currentStepLabel}</h2>
 {isCreating && createStage === 'confirm' && (
 <button
 type="button"
 onClick={() => { setCreateStage('enter'); setPin(''); setFirstPin(''); setErrorMsg(''); }}
 data-testid="pin-auth-confirm-back-button"
 className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors mt-2"
 >
 <ChevronLeft size={16} /> Back
 </button>
 )}
 </div>

 {/* PIN digit boxes */}
 <div data-testid="pinauth-div-2" className="flex justify-center gap-3 cursor-pointer" onClick={() => hiddenInputRef.current?.focus()}>
 {Array.from({ length: 6 }, (_, i) => {
 const isActive = i === pin.length;
 const isFilled = i < pin.length;
 const hasError = !!errorMsg && shake;
 const revealed = showReveal && i < pin.length ? pin[i] : undefined;

 return (
 <div
 key={i}
 className={`w-11 h-11 md:w-14 md:h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${hasError
 ? 'border-red-400 bg-red-50 text-red-600'
 : isActive
 ? 'border-gray-900 bg-white ring-4 ring-gray-100'
 : isFilled
 ? 'border-gray-900 bg-gray-900 text-white'
 : 'border-gray-200 bg-white/50 text-transparent'
 } ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
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
 onClick={() => setShowReveal(r => !r)}
 data-testid="pin-auth-reveal-toggle"
 className="flex items-center gap-1.5 text-gray-400 hover:text-gray-900 text-[10px] font-bold transition-colors"
 >
 {showReveal ? <EyeOff size={14} /> : <Eye size={14} />}
 {showReveal ? 'HIDE PIN' : 'SHOW PIN'}
 </button>
 <div className="h-4 mt-1">
 {errorMsg && (
 <p className="text-red-500 text-[10px] font-bold text-center flex items-center justify-center gap-1">
 <AlertCircle size={12} /> {errorMsg}
 </p>
 )}
 </div>
 {/* Session too old to refresh — let the user re-login instead of being stuck. */}
 {sessionExpired && (
 <button
 type="button"
 onClick={handleReLogin}
 disabled={isReLoggingIn}
 data-testid="pin-auth-relogin-button"
 className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none"
 >
 <LogOut size={15} />
 {isReLoggingIn ? 'Redirecting…' : 'Sign in again'}
 </button>
 )}
 </div>

 {/* Number pad */}
 <div className="hidden md:grid grid-cols-3 gap-3">
 {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
 <button
 key={n}
 type="button"
 onClick={() => appendDigit(String(n))}
 disabled={isSubmitting}
 data-testid={`pin-auth-digit-${n}`}
 className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 {n}
 </button>
 ))}
 {/* Bottom row */}
 {!isCreating && !isGuestMode() ? (
 <button
 type="button"
 onClick={handleForgotPin}
 disabled={isSubmitting}
 title="Forgot PIN"
 data-testid="pin-auth-forgot-pin-button"
 className="h-14 rounded-2xl bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 <KeyRound size={20} />
 </button>
 ) : (
 <div /> /* empty cell */
 )}
 <button
 type="button"
 onClick={() => appendDigit('0')}
 disabled={isSubmitting}
 data-testid="pin-auth-digit-0"
 className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 0
 </button>
 <button
 type="button"
 onClick={deleteDigit}
 disabled={isSubmitting}
 data-testid="pin-auth-delete-button"
 className="h-14 rounded-2xl bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 {isSubmitting ? (
   <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
 ) : (
   '⌫'
 )}
 </button>
 </div>

 {/* Sign out / different account */}
 {!isCreating && (
 <button
 type="button"
 onClick={handleSignOut}
 disabled={isLoggingOut || isSubmitting}
 data-testid="pin-auth-signout-button"
 className="flex items-center justify-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors py-1"
 >
 <LogOut size={15} />
 {isLoggingOut ? 'Signing out...' : 'Use a different account'}
 </button>
 )}

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

 {/* Forgot PIN modal */}
 {showResetModal && (
 <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
 <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
 <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
 <KeyRound className="text-amber-600" size={22} />
 </div>
 <h3 className="text-lg font-bold text-gray-900 mb-1">Reset your PIN?</h3>
 <p className="text-sm text-gray-500 mb-5 leading-relaxed">
 {resetOtpSent ? 'Enter the 6-digit code sent to your email to reset your PIN.' : 'We will send a confirmation code to your email. You can create a new PIN after verification.'}
 </p>

 {resetError && (
 <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
 <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
 {resetError}
 </div>
 )}

 {resetOtpSent && (
 <div className="mb-5">
 <input
 type="text"
 maxLength={6}
 value={resetOtp}
 onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
 placeholder="Enter 6-digit code"
 data-testid="pin-reset-otp-input"
 className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
 autoFocus
 />
 </div>
 )}

 <div className="flex gap-3">
 <button
 type="button"
 onClick={() => setShowResetModal(false)}
 data-testid="pin-reset-cancel-button"
 className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
 >
 Cancel
 </button>
 {resetOtpSent ? (
 <button
 type="button"
 onClick={handleVerifyOtpAndReset}
 disabled={isResettingPin || resetOtp.length < 6}
 data-testid="pin-reset-verify-button"
 className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
 >
 {isResettingPin ? 'Verifying...' : 'Verify & Reset'}
 </button>
 ) : (
 <button
 type="button"
 onClick={handleSendOtp}
 disabled={isResettingPin}
 data-testid="pin-reset-send-button"
 className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
 >
 {isResettingPin ? 'Sending...' : 'Send Code'}
 </button>
 )}
 </div>
 </div>
 </div>
 )}

 {/* Keyframe styles */}
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


