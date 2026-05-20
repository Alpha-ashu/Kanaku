import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, KeyRound, AlertCircle, ChevronLeft, ShieldCheck, Eye, EyeOff, Lock } from 'lucide-react';
import { KANKULogo } from '@/app/components/ui/KANKULogo';
import { clearSecurityData, isPINSet, verifyPIN, storeMasterKey, backupPINKeys, restorePINKeys } from '@/lib/encryption';
import { isPinMissing, isPinServiceUnavailable, pinService } from '@/services/pinService';
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

 const hiddenInputRef = useRef<HTMLInputElement>(null);

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
 // Show create flow if:
 // 1. Server explicitly says no PIN, OR
 // 2. No local PIN (new user on fresh device or server error)
 const shouldCreate = serverHasNoPin || !hasLocalPin;
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

 const handleHiddenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (e.key === 'Backspace') { e.preventDefault(); deleteDigit(); }
 else if (/^\d$/.test(e.key)) { e.preventDefault(); appendDigit(e.key); }
 else if (e.key === 'Enter' && pin.length === 6) { e.preventDefault(); handleSubmit(); }
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

    try {
      if (isCreating) {
        if (createStage === 'enter') {
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
                  pinService.saveKeyBackup(`${backup.hash}|${backup.salt}`).catch(() => { });
                }
              }
            })
            .catch(() => { });
        }

        const key = await storeMasterKey(pin);
        await finalizeAuth(key, 'PIN created! Welcome to KANKU');

      } else {
        // Verify existing PIN (local-first) 
        // Guest mode: verify locally only, no server call.
        const localResult = await verifyPIN(pin);

        if (localResult.isValid && localResult.key) {
          // Local PIN correct - in non-guest mode also sync to server background
          if (!isGuestMode()) {
            pinService.verifyPin({ pin })
              .then(async serverResult => {
                if (!serverResult.success && isPinMissing(serverResult)) {
                  const repair = await pinService.createPin(pin);
                  if (repair.success) {
                    const backup = backupPINKeys();
                    if (backup.hash && backup.salt) {
                      pinService.saveKeyBackup(`${backup.hash}|${backup.salt}`).catch(() => { });
                    }
                  }
                }
              })
              .catch(() => { });
          }

          await finalizeAuth(localResult.key, 'Welcome back!');
          return;
        }

        // Local hash missing or mismatched - fall back to server 
        // (e.g. user cleared storage, or PIN was set on another device)
        const serverResult = await pinService.verifyPin({ pin });

        if (!serverResult.success) {
          if (isPinServiceUnavailable(serverResult)) {
            // Server down AND local failed no way to verify
            triggerShake('Unable to verify PIN right now. Please try again.');
          } else {
            triggerShake('Incorrect PIN. Please try again.');
          }
          setIsSubmitting(false);
          return;
        }

        // Server verified restore local keys from backup so future locks work
        const kbr = await pinService.getKeyBackup();
        if (kbr.success && kbr.backup) {
          const [hash, salt] = kbr.backup.split('|');
          if (hash && salt) restorePINKeys({ hash, salt });
        }
        const key = await storeMasterKey(pin); // re-derive and store locally
        await finalizeAuth(key, 'Welcome back!');
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
 const { error } = await supabase.auth.verifyOtp({
 email: user!.email,
 token: resetOtp,
 type: 'email'
 });
 if (error) throw error;

 const result = await pinService.resetCurrentUserPin();
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
 : 'Enter your PIN to access KANKU';

 // Loading skeleton 
 if (isLoading) {
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a56f0]">
 <div className="flex flex-col items-center gap-4">
 <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
 <KANKULogo className="w-9 h-9" />
 </div>
 <div className="w-7 h-7 border-3 border-white/30 border-t-white rounded-full animate-spin" />
 </div>
 </div>
 );
 }

 // Main render 
 return (
 <div
 className="fixed inset-0 z-50 overflow-y-auto bg-white flex items-center justify-center p-4"
 onClick={() => hiddenInputRef.current?.focus()}
 >
 {/* Hidden form - captures keyboard input, visually invisible, no aria-hidden (would block focus/keyboard) */}
 <form
 style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden' }}
 autoComplete="off"
 onSubmit={e => e.preventDefault()}
 >
 <input
 type="text"
 name="username"
 value={user?.email || ''}
 readOnly
 autoComplete="username"
 tabIndex={-1}
 />
 <input
 ref={hiddenInputRef}
 type="password"
 name="pin"
 inputMode="numeric"
 autoComplete="current-password"
 value={pin}
 onChange={() => { }}
 onKeyDown={handleHiddenKeyDown}
 tabIndex={0}
 />
 </form>

 <div className="w-full max-w-md p-6 md:p-8 flex flex-col">
 {/* Header */}
 <div className="pt-4 pb-6 flex flex-col items-center px-6">
 <div className="mb-4">
 <KANKULogo className="w-12 h-12" />
 </div>
 <h1 className="text-3xl font-black text-gray-900 tracking-tighter mb-1">KANKU</h1>
 <p className="text-sm text-gray-500 font-medium text-center max-w-[240px] leading-tight">{currentStepSub}</p>
 </div>

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
 className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors mt-2"
 >
 <ChevronLeft size={16} /> Back
 </button>
 )}
 </div>

 {/* PIN digit boxes */}
 <div className="flex justify-center gap-3 cursor-pointer" onClick={() => hiddenInputRef.current?.focus()}>
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
 </div>

 {/* Number pad */}
 <div className="hidden md:grid grid-cols-3 gap-3">
 {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
 <button
 key={n}
 type="button"
 onClick={() => appendDigit(String(n))}
 disabled={isSubmitting}
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
 className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 0
 </button>
 <button
 type="button"
 onClick={deleteDigit}
 disabled={isSubmitting}
 className="h-14 rounded-2xl bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-all text-gray-500 hover:text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 {isSubmitting ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : ''}
 </button>
 </div>

 {/* Sign out / different account */}
 {!isCreating && (
 <button
 type="button"
 onClick={handleSignOut}
 disabled={isLoggingOut || isSubmitting}
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
 className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
 autoFocus
 />
 </div>
 )}

 <div className="flex gap-3">
 <button
 type="button"
 onClick={() => setShowResetModal(false)}
 className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
 >
 Cancel
 </button>
 {resetOtpSent ? (
 <button
 type="button"
 onClick={handleVerifyOtpAndReset}
 disabled={isResettingPin || resetOtp.length < 6}
 className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
 >
 {isResettingPin ? 'Verifying...' : 'Verify & Reset'}
 </button>
 ) : (
 <button
 type="button"
 onClick={handleSendOtp}
 disabled={isResettingPin}
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


