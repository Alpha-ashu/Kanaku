import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, KeyRound, AlertCircle, ChevronLeft, ShieldCheck, Eye, EyeOff, Lock, Loader2, Fingerprint, ScanFace } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { clearSecurityData, isPINSet, verifyPIN, storeMasterKey, serializePINKeyBackup, restorePINKeyBackup } from '@/lib/encryption';
import { isPinMissing, isPinServiceUnavailable, isSessionExpired, pinService } from '@/services/pinService';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isGuestMode } from '@/lib/guestMode';
import supabase from '@/utils/supabase/client';
import { apiClient } from '@/lib/api';
import {
  type BiometricAvailability,
  enableBiometricUnlock,
  getBiometricAvailability,
  isBiometricEnabled,
  isBiometricOfferDismissed,
  isBiometricSuppressed,
  dismissBiometricOffer,
  suppressBiometricForSession,
  unlockWithBiometrics,
} from '@/services/biometricAuthService';

import {
  formatLockCountdown,
  getPinLockState,
  recordPinFailure,
  resetPinAttempts,
} from '@/lib/pinAttemptGuard';
import { trackPinVerify } from '@/lib/pinUnlockCoordinator';

interface PINAuthProps {
 onAuthenticated: (encryptionKey: string) => void;
}

/**
 * How long the unlock waits for the server before proceeding on local proof
 * alone. Long enough that a healthy backend answers inline; short enough that a
 * cold or unreachable one never holds the keypad hostage.
 */
const SERVER_VERIFY_BUDGET_MS = 1200;
const SERVER_VERIFY_PENDING = Symbol('pin-server-verify-pending');


export const PINAuth: React.FC<PINAuthProps> = ({ onAuthenticated }) => {
 const { signOut, user } = useAuth();

 // State 
 const [isCreating, setIsCreating] = useState(false);
 const [createStage, setCreateStage] = useState<'enter' | 'confirm'>('enter');
 const [pin, setPin] = useState('');
 const [firstPin, setFirstPin] = useState(''); // stores first entry during create
 const [showReveal, setShowReveal] = useState(false);
 // Only block on the server when we genuinely cannot tell create-from-enter, i.e.
 // there are no local PIN keys. A returning user (the overwhelmingly common case)
 // starts at `false` and gets the keypad on the very first paint — a lazy initialiser
 // rather than an effect, so not even one frame of spinner is shown.
 const [isLoading, setIsLoading] = useState(() => !isPINSet() && !isGuestMode());
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [shake, setShake] = useState(false);
 const [errorMsg, setErrorMsg] = useState('');
 const [showResetModal, setShowResetModal] = useState(false);
 const [isResettingPin, setIsResettingPin] = useState(false);
 const [isLoggingOut, setIsLoggingOut] = useState(false);
 const [resetError, setResetError] = useState('');
 const [resetOtpSent, setResetOtpSent] = useState(false);
 const [resetOtpInputs, setResetOtpInputs] = useState<string[]>(Array(6).fill(''));
 const resetOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

 // Biometric unlock (native only). `biometric` is null until the capability probe
 // resolves, so nothing biometric-shaped renders on web or on a device without it.
 const [biometric, setBiometric] = useState<BiometricAvailability | null>(null);
 const [biometricEnrolled, setBiometricEnrolled] = useState(false);
 const [biometricBusy, setBiometricBusy] = useState(false);
 // Set after a successful *typed* unlock when biometrics are available but not yet
 // enrolled — holds the verified PIN just long enough to offer enrolment.
 const [enrolOffer, setEnrolOffer] = useState<{ pin: string } | null>(null);
 // Held while the enrolment offer is on screen — the unlock is already authorised,
 // we are just deferring the hand-off until the user answers.
 const [pendingUnlock, setPendingUnlock] = useState<{ key: string; msg: string } | null>(null);
 const autoPromptedRef = useRef(false);

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
 // True when this lock screen was reached via the inactivity auto-lock, so we
 // can explain why the user is being asked for their PIN again.
 const [lockedForInactivity, setLockedForInactivity] = useState(false);
 // True when the server rejected the unlock because the session is too old to
 // refresh — we then show a "Sign in again" button instead of a wrong-PIN hint.
 const [sessionExpired, setSessionExpired] = useState(false);
 const [isReLoggingIn, setIsReLoggingIn] = useState(false);
 // Brute-force throttle. `lockRemainingMs` ticks down while a lockout is active.
 const [lockRemainingMs, setLockRemainingMs] = useState(() => getPinLockState().remainingMs);

 const hiddenInputRef = useRef<HTMLInputElement>(null);
 const isPinLocked = lockRemainingMs > 0;

 // The on-screen numpad is now rendered on every viewport (it used to be
 // `hidden md:grid`). On a touch device the offscreen input would raise the OS
 // keyboard on top of it, leaving two competing keypads fighting for the same
 // digits. `inputMode="none"` keeps the input focusable — so hardware keyboards
 // and password managers still work — while telling the browser not to show the
 // virtual keyboard, making the numpad the single touch input surface.
 const isCoarsePointer = typeof window !== 'undefined'
   && typeof window.matchMedia === 'function'
   && window.matchMedia('(pointer: coarse)').matches;

 // Count the active lockout down to zero, then re-enable the keypad.
 useEffect(() => {
   if (lockRemainingMs <= 0) return;
   const timer = setInterval(() => {
     const { remainingMs } = getPinLockState();
     setLockRemainingMs(remainingMs);
     if (remainingMs <= 0) {
       setErrorMsg('');
       clearInterval(timer);
     }
   }, 500);
   return () => clearInterval(timer);
 }, [isPinLocked]);

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
 //
 // PERF: the keypad must never wait on the network.
 //
 // This used to `await pinService.getStatus()` (and sometimes getKeyBackup() after
 // it) before flipping `isLoading`, so the full-screen blue spinner below covered
 // the keypad for the length of a round-trip — and worse, when the access token has
 // expired that call 401s, triggers refreshAccessToken(), and retries, so it is two
 // to three sequential requests against a possibly cold backend before a user can
 // type a single digit.
 //
 // A returning user already has everything needed locally: isPINSet() tells us the
 // encryption keys exist, which means "show the enter keypad". The server call only
 // decides create-vs-enter for someone with NO local PIN, and restores the key
 // backup — both fine to resolve in the background and reconcile afterwards.
 useEffect(() => {
 let mounted = true;

 const hasLocalPin = isPINSet();

 // Local PIN present ⇒ unambiguously "enter your PIN". Render the keypad now and
 // let the server call below run behind it.
 //
 // No local PIN is genuinely ambiguous — a brand-new user (create) and a returning
 // user on fresh storage (enter) look identical from here, and guessing "create"
 // would let someone set a PIN that disagrees with the server's. That case still
 // waits for the authoritative answer.
 if (hasLocalPin) {
   setIsCreating(false);
   setIsLoading(false);
 }

 // Guest mode is local-only — nothing to reconcile.
 if (isGuestMode()) {
   setIsCreating(!hasLocalPin);
   setIsLoading(false);
   return () => { mounted = false; };
 }

 (async () => {
 try {
 const status = await pinService.getStatus();

 if (status.success && !isPINSet()) {
 const kbr = await pinService.getKeyBackup();
 if (kbr.success && kbr.backup) {
 restorePINKeyBackup(kbr.backup);
 }
 }

 if (mounted) {
   // Reconcile the optimistic guess. Only the server can say authoritatively
   // that no PIN exists, so a user who guessed "enter" is switched to "create"
   // here (and vice versa) once we know.
   setIsCreating(isPinMissing(status));
   setIsLoading(false);
 }
 } catch {
 // Network/server error. A user with a local PIN is already on the keypad; one
 // without has nothing else to go on, so fall back to the create flow as before.
 if (mounted) {
   if (!isPINSet()) setIsCreating(true);
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

 /**
  * Single funnel for every rejected unlock: shake, and advance the brute-force
  * throttle. Once the free attempts are spent this arms an increasing lockout.
  */
 const registerFailedAttempt = (msg: string) => {
   const state = recordPinFailure();
   if (state.locked) {
     setLockRemainingMs(state.remainingMs);
     triggerShake(`Too many attempts. Try again in ${formatLockCountdown(state.remainingMs)}.`);
     return;
   }
   triggerShake(msg);
 };

  const finalizeAuth = useCallback(async (key: string, msg: string) => {
  // NOTE: this used to also write a `user_authenticated` Capacitor Preference.
  // Nothing ever read it — SecurityContext owns unlock state via sessionStorage
  // `session_active` — so it was write-only state with four separate clear-up
  // sites to keep in sync. Removed rather than kept limping.
  console.log('[KANAKU Startup] PIN Verified & Application Unlocked');
  toast.success(msg);
  onAuthenticated(key);
  }, [onAuthenticated]);

  /**
   * Single exit point for every successful unlock (create, guest, server-verified,
   * offline fallback). Before letting the user through, this is the one moment we
   * hold a PIN that is known-good — so it is also the only safe moment to offer
   * biometric enrolment without asking them to type it again.
   */
  const completeUnlock = useCallback(async (key: string, msg: string, verifiedPin: string) => {
    // If locked due to inactivity, bypass enrolment offer to avoid blocking the user
    if (lockedForInactivity) {
      await finalizeAuth(key, msg);
      return;
    }

    const canOffer =
      biometric?.available &&
      !isBiometricEnabled() &&
      !isBiometricOfferDismissed() &&
      !isGuestMode();

    if (canOffer) {
      setEnrolOffer({ pin: verifiedPin });
      setPendingUnlock({ key, msg });
      setIsSubmitting(false);
      return;
    }

    await finalizeAuth(key, msg);
  }, [biometric, finalizeAuth, lockedForInactivity]);

 // Probe biometric capability once. Runs on every platform but resolves to
 // `available: false` off-device, which keeps the render path free of platform checks.
 useEffect(() => {
   let mounted = true;
   (async () => {
     const availability = await getBiometricAvailability();
     if (!mounted) return;
     setBiometric(availability);
     setBiometricEnrolled(isBiometricEnabled());
   })();
   return () => { mounted = false; };
 }, []);

 /**
  * Unlocks via biometrics. The retrieved PIN is pushed into `pin` state rather than
  * verified here, so it flows through exactly the same auto-submit → server verify →
  * key derivation path as a typed PIN. Biometrics replace typing, not verification.
  */
 const handleBiometricUnlock = useCallback(async () => {
   if (biometricBusy || isSubmitting) return;
   setBiometricBusy(true);
   setErrorMsg('');

   try {
     const outcome = await unlockWithBiometrics();

     switch (outcome.status) {
       case 'success':
         setPin(outcome.pin);
         break;
       case 'cancelled':
         // Deliberate dismissal — stop auto-prompting so the keypad is usable.
         suppressBiometricForSession();
         break;
       case 'unavailable':
         suppressBiometricForSession();
         setBiometricEnrolled(isBiometricEnabled());
         setErrorMsg(outcome.message);
         break;
       case 'failed':
         suppressBiometricForSession();
         setErrorMsg(outcome.message);
         break;
     }
   } finally {
     setBiometricBusy(false);
   }
 }, [biometricBusy, isSubmitting]);

 /** Accepts the enrolment offer, then hands off the unlock that was held pending. */
 const handleAcceptEnrolment = useCallback(async () => {
   if (!enrolOffer || !pendingUnlock || biometricBusy) return;
   setBiometricBusy(true);

   const label = user?.email || 'KANAKU account';
   const result = await enableBiometricUnlock(enrolOffer.pin, label);

   if (result.ok) {
     setBiometricEnrolled(true);
     toast.success(`${biometric?.label ?? 'Biometric'} unlock enabled`);
   } else if (result.message) {
     toast.error(result.message);
   }

   // Whether or not enrolment succeeded, the PIN was already verified — never
   // strand the user on this screen.
   const unlock = pendingUnlock;
   setEnrolOffer(null);
   setPendingUnlock(null);
   setBiometricBusy(false);
   await finalizeAuth(unlock.key, unlock.msg);
 }, [enrolOffer, pendingUnlock, biometricBusy, user, biometric, finalizeAuth]);

 /** Declines the offer. `permanent` stops us asking again until Settings re-arms it. */
 const handleDeclineEnrolment = useCallback(async (permanent: boolean) => {
   if (!pendingUnlock) return;
   if (permanent) dismissBiometricOffer();

   const unlock = pendingUnlock;
   setEnrolOffer(null);
   setPendingUnlock(null);
   await finalizeAuth(unlock.key, unlock.msg);
 }, [pendingUnlock, finalizeAuth]);

 // Auto-prompt once per mount, as soon as we know biometrics are enrolled and the
 // screen is in "enter your PIN" mode (never during PIN creation).
 useEffect(() => {
   if (autoPromptedRef.current) return;
   if (isLoading || isCreating || sessionExpired || isPinLocked) return;
   if (!biometric?.available || !biometricEnrolled) return;
   if (isBiometricSuppressed()) return;

   autoPromptedRef.current = true;
   void handleBiometricUnlock();
 }, [isLoading, isCreating, sessionExpired, isPinLocked, biometric, biometricEnrolled, handleBiometricUnlock]);

 // PIN input handler (hidden input + numpad both write here) 
  const appendDigit = (d: string) => {
    if (isSubmitting || isPinLocked) return;
    setErrorMsg('');
    setPin(prev => prev.length < 6 ? prev + d : prev);
  };

  const deleteDigit = () => {
    if (isSubmitting || isPinLocked) return;
    setErrorMsg('');
    setPin(prev => prev.slice(0, -1));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting || isPinLocked) return;
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

 // Auto-submit when 6 digits entered.
 //
 // Suppressed while the biometric enrolment offer is up: that unlock is already
 // authorised and merely deferred, but the offscreen PIN input keeps focus behind
 // the modal, so a stray keystroke would edit `pin`, re-fire this effect and run a
 // second verification over the top of the pending one.
 useEffect(() => {
 if (pin.length === 6 && !isSubmitting && !enrolOffer && !isPinLocked) {
 const t = setTimeout(handleSubmit, 120);
 return () => clearTimeout(t);
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pin, enrolOffer, isPinLocked]);

  // Submit logic
  const handleSubmit = async () => {
    if (pin.length !== 6 || isSubmitting) return;

    // Re-read rather than trusting the ticking state: a reload during a lockout
    // remounts with a fresh timer, and the persisted deadline is authoritative.
    const lockState = getPinLockState();
    if (lockState.locked) {
      setLockRemainingMs(lockState.remainingMs);
      triggerShake(`Too many attempts. Try again in ${formatLockCountdown(lockState.remainingMs)}.`);
      return;
    }

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
        // storeMasterKey writes the verifier, so the backup payload must be
        // serialised AFTER it — not before.
        const key = await storeMasterKey(pin);

        if (!isGuestMode()) {
          const backupPayload = serializePINKeyBackup();
          pinService.createPin(pin)
            .then(result => {
              if (result.success && backupPayload) {
                pinService.verifySecurity().then(sec => {
                  if (sec.success && sec.securityToken) {
                    pinService.saveKeyBackup(backupPayload, sec.securityToken).catch(() => { });
                  }
                }).catch(() => { });
              }
            })
            .catch(() => { });
        }

        await completeUnlock(key, 'PIN created! Welcome to KANAKU', pin);

      } else {
        // Fast path: verify against local encryption key first
        const localResult = await verifyPIN(pin);

        // Guest mode: verify locally only, no server call.
        if (isGuestMode()) {
          if (localResult.isValid && localResult.key) {
            resetPinAttempts();
            await finalizeAuth(localResult.key, 'Welcome back!');
          } else {
            registerFailedAttempt('Incorrect PIN. Please try again.');
            setIsSubmitting(false);
          }
          return;
        }

        // Local PIN is valid — unlock without waiting on the network.
        //
        // The server call still matters (it establishes the server-side PIN-unlock
        // that the backend pinGate consumes), but AWAITING it before unlocking was
        // a real regression: pinService.post walks every API base candidate with a
        // 25s deadline each and can add a token-refresh retry on top, so against a
        // cold backend the keypad froze for the better part of a minute — and then
        // unlocked anyway, because the only server verdict acted on was session
        // expiry.
        //
        // Instead: give the server a short budget to answer. A fast answer is
        // honoured inline; a slow one keeps running in the background and re-locks
        // through the normal event path if it turns out to be fatal.
        if (localResult.isValid && localResult.key) {
          resetPinAttempts();

          const verifyPromise = pinService
            .verifyPin({ pin })
            .catch((serverErr) => {
              console.warn('[PINAuth] Server PIN verify failed:', serverErr);
              return null;
            });

          // Publish it so the API layer can tell "server unlock not established
          // YET" from "genuinely locked" when a gated endpoint answers 403 during
          // the window between local unlock and this request landing.
          trackPinVerify(verifyPromise.then((r) => r?.success === true));

          const raced = await Promise.race([
            verifyPromise,
            new Promise<typeof SERVER_VERIFY_PENDING>((resolve) =>
              setTimeout(() => resolve(SERVER_VERIFY_PENDING), SERVER_VERIFY_BUDGET_MS),
            ),
          ]);

          if (raced !== SERVER_VERIFY_PENDING && raced && isSessionExpired(raced)) {
            setSessionExpired(true);
            triggerShake(raced.message || 'Session expired. Please sign in again.');
            setIsSubmitting(false);
            return;
          }

          if (raced === SERVER_VERIFY_PENDING) {
            // Still in flight — unlock now, but keep watching. A late "session
            // expired" must still tear the session down rather than be dropped.
            void verifyPromise.then((late) => {
              if (late && isSessionExpired(late) && typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('KANAKU_SESSION_EXPIRED', { detail: { reason: 'pin_verify_late' } }),
                );
              }
            });
          }

          await completeUnlock(localResult.key, 'Welcome back!', pin);
          return;
        }

        // If local keys are missing or mismatched, check with server
        try {
          const serverResult = await pinService.verifyPin({ pin });
          if (serverResult.success) {
            const kbr = await pinService.getKeyBackup();
            if (kbr.success && kbr.backup) {
              restorePINKeyBackup(kbr.backup);
            }
            const key = await storeMasterKey(pin);
            resetPinAttempts();
            await completeUnlock(key, 'Welcome back!', pin);
            return;
          }

          if (isSessionExpired(serverResult)) {
            setSessionExpired(true);
            triggerShake(serverResult.message || 'Session expired. Please sign in again.');
          } else {
            registerFailedAttempt(serverResult.message || 'Incorrect PIN. Please try again.');
          }
        } catch {
          registerFailedAttempt('Incorrect PIN. Please try again.');
        }
        setIsSubmitting(false);
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
      resetPinAttempts();
      await signOut();
    } catch {
      toast.error('Failed to sign out. Please try again.');
    } finally {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('KANAKU_SESSION_EXPIRED', { detail: { reason: 'user_signout' } }));
      }
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
      resetPinAttempts();
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
 setResetOtpInputs(Array(6).fill(''));
 setShowResetModal(true);
 };

  const handleSendOtp = async () => {
    setIsResettingPin(true);
    setResetError('');
    try {
      await apiClient.post('/otp/send', {
        destination: user!.email,
        channel: 'email',
        purpose: 'sensitive_action',
      });
      setResetOtpSent(true);
      toast.success('Verification code sent to your email.');
    } catch (err: any) {
      setResetError(err.message || 'Failed to send verification code.');
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleVerifyOtpAndReset = async () => {
    const code = resetOtpInputs.join('');
    if (code.length < 6) {
      setResetError('Please enter all 6 digits of the verification code.');
      return;
    }
    // Prevent client-side SQL injection / bypass by ensuring the code is strictly a 6-digit number
    if (!/^\d{6}$/.test(code)) {
      setResetError('Invalid verification code format. Only numeric digits are allowed.');
      return;
    }

    setIsResettingPin(true);
    setResetError('');
    try {
      await apiClient.post('/otp/verify', {
        destination: user!.email,
        purpose: 'sensitive_action',
        otp: code,
      });

      // Obtain security token (the backend accepts recent OTP verification)
      const secResult = await pinService.verifySecurity();
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
      // A verified OTP reset is a legitimate recovery — clear any active lockout
      // so the user can immediately create a new PIN.
      resetPinAttempts();
      setLockRemainingMs(0);

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
 inputMode={isCoarsePointer ? 'none' : 'numeric'}
 autoComplete="one-time-code"
 value={pin}
 onChange={handleInputChange}
 onKeyDown={handleHiddenKeyDown}
 readOnly={isPinLocked}
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

 {/* Brute-force lockout notice */}
 {isPinLocked && (
 <div
 data-testid="pinauth-throttle-banner"
 role="alert"
 className="mx-6 mb-4 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
 >
 <Lock size={16} className="flex-shrink-0 text-red-600" />
 <p className="text-xs font-medium leading-snug">
 Too many incorrect attempts. Try again in {formatLockCountdown(lockRemainingMs)}
 {!isGuestMode() && ', or reset your PIN by email'}.
 </p>
 </div>
 )}

 {/* Inactivity auto-lock notice */}
 {lockedForInactivity && !isCreating && !isPinLocked && (
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
 <div className="grid grid-cols-3 gap-3 w-full max-w-[320px] mx-auto">
 {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
 <button
 key={n}
 type="button"
 onClick={() => appendDigit(String(n))}
 disabled={isSubmitting || isPinLocked}
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
 disabled={isSubmitting || isPinLocked}
 data-testid="pin-auth-digit-0"
 className="h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all text-xl font-semibold text-gray-900 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
 >
 0
 </button>
 <button
 type="button"
 onClick={deleteDigit}
 disabled={isSubmitting || isPinLocked}
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

 {/* Biometric unlock. Rendered only on a device that has it enrolled for this
     account — the auto-prompt already fired once, so this is the retry affordance
     for anyone who dismissed it or came back to the screen. */}
 {!isCreating && biometric?.available && biometricEnrolled && (
 <button
 type="button"
 onClick={() => void handleBiometricUnlock()}
 disabled={isSubmitting || biometricBusy || isPinLocked}
 data-testid="pin-auth-biometric-button"
 className="flex items-center justify-center gap-2 mx-auto rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
 >
 {biometricBusy ? (
   <Loader2 size={17} className="animate-spin" />
 ) : biometric.isFace ? (
   <ScanFace size={17} />
 ) : (
   <Fingerprint size={17} />
 )}
 {biometricBusy ? 'Waiting…' : `Unlock with ${biometric.label}`}
 </button>
 )}

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
 Your PIN never leaves this device — only a salted, slow-to-crack verifier is stored. Nothing financial loads or syncs until you unlock.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Biometric enrolment offer. Shown once, immediately after a verified PIN entry —
     the only moment we hold a known-good PIN without asking the user to retype it.
     The unlock is already authorised; every path out of here calls finalizeAuth. */}
  {enrolOffer && (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white/95 border border-slate-100 rounded-[32px] w-full max-w-sm p-6 md:p-8 shadow-2xl flex flex-col gap-6 animate-in fade-in-50 zoom-in-95 duration-200 select-none">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-2">
            {biometric?.isFace
              ? <ScanFace className="text-white" size={24} />
              : <Fingerprint className="text-white" size={24} />}
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            Unlock with {biometric?.label ?? 'biometrics'}?
          </h3>
          <p className="text-sm font-semibold text-slate-500 leading-relaxed max-w-[280px]">
            Skip the keypad next time. Your PIN is stored in this device's secure hardware
            and never leaves it — you can still use your PIN whenever you want.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void handleAcceptEnrolment()}
            disabled={biometricBusy}
            data-testid="pin-auth-biometric-enrol-accept"
            className="w-full h-12 rounded-2xl bg-slate-900 text-white text-sm font-bold transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {biometricBusy && <Loader2 size={16} className="animate-spin" />}
            {biometricBusy ? 'Setting up…' : `Enable ${biometric?.label ?? 'biometrics'}`}
          </button>
          <button
            type="button"
            onClick={() => void handleDeclineEnrolment(false)}
            disabled={biometricBusy}
            data-testid="pin-auth-biometric-enrol-later"
            className="w-full h-11 rounded-2xl bg-transparent text-slate-600 text-sm font-bold transition-colors hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void handleDeclineEnrolment(true)}
            disabled={biometricBusy}
            data-testid="pin-auth-biometric-enrol-never"
            className="w-full text-slate-400 text-xs font-semibold transition-colors hover:text-slate-600 disabled:opacity-60 disabled:pointer-events-none"
          >
            Don't ask again
          </button>
        </div>
      </div>
    </div>
  )}

 {/* Forgot PIN modal */}
  {showResetModal && (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300">
      <div 
        className="bg-white/95 border border-slate-100 rounded-[32px] w-full max-w-sm p-6 md:p-8 shadow-2xl flex flex-col gap-6 animate-in fade-in-50 zoom-in-95 duration-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-2">
            <KeyRound className="text-white" size={24} />
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Reset your PIN?</h3>
          <p className="text-sm font-semibold text-slate-500 leading-relaxed max-w-[260px]">
            {resetOtpSent 
              ? 'Enter the 6-digit code sent to your email to verify and reset your PIN.' 
              : 'We will send a secure confirmation code to your email. You can create a new PIN after verification.'}
          </p>
        </div>

        {resetError && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs font-semibold text-rose-700 animate-shake">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-500" />
            <p className="leading-snug">{resetError}</p>
          </div>
        )}

        {resetOtpSent && (
          <div className="flex flex-col gap-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
              Verification Code
            </label>
            <div className="flex justify-between gap-1.5 max-w-[280px] mx-auto w-full">
              {Array(6).fill(0).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => { resetOtpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={resetOtpInputs[i]}
                  onChange={(e) => handleResetOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleResetOtpKeyDown(i, e)}
                  onPaste={handleResetOtpPaste}
                  data-testid={`reset-otp-input-${i}`}
                  className="w-10 h-10 sm:w-11 sm:h-11 text-center text-lg font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all duration-200"
                  autoFocus={i === 0}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setShowResetModal(false); setResetOtpInputs(Array(6).fill('')); setResetError(''); }}
            data-testid="pin-reset-cancel-button"
            className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all duration-200"
          >
            Cancel
          </button>
          {resetOtpSent ? (
            <button
              type="button"
              onClick={handleVerifyOtpAndReset}
              disabled={isResettingPin || resetOtpInputs.join('').length < 6}
              data-testid="pin-reset-verify-button"
              className="flex-1 py-3.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isResettingPin ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>Verify</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={isResettingPin}
              data-testid="pin-reset-send-button"
              className="flex-1 py-3.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isResettingPin ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>Send Code</span>
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


