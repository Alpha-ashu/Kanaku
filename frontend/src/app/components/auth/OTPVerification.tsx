import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowLeft, RefreshCw, Shield, AlertCircle, CheckCircle, ShieldCheck, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { api, TokenManager } from '@/lib/api';
import { setLocalProfileVerification } from '@/hooks/useProfileVerification';
import { KanakuWordmark } from '@/app/components/ui/KANAKULogo';
import { AuthShowcase } from './AuthShowcase';

interface OTPVerificationProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
  isNewUser?: boolean;
  /** If provided, the OTP step cannot be skipped - user MUST verify email */
  mandatory?: boolean;
  onVerifyLater?: () => void;
}

export const OTPVerification: React.FC<OTPVerificationProps> = ({
  email,
  onVerified,
  onBack,
  isNewUser = false,
  mandatory = true,
  onVerifyLater,
}) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendAttempts, setResendAttempts] = useState(0);
  const maxResendAttempts = 3;
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Focus first input on mount
  useEffect(() => {
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 300);
  }, []);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newOtp.every(digit => digit !== '') && newOtp.join('').length === 6) {
      handleVerifyOTP(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length > 0) {
      const newOtp = [...otp];
      pastedData.split('').forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtp(newOtp);
      const lastIndex = Math.min(pastedData.length, 5);
      inputRefs.current[lastIndex]?.focus();
      if (pastedData.length === 6) {
        handleVerifyOTP(pastedData);
      }
    }
  };

  const handleVerifyOTP = async (otpCode: string) => {
    if (otpCode.length !== 6) return;
    setIsLoading(true);
    setError(null);

    try {
      // First try Backend API email OTP verification
      try {
        const res = await api.auth.verifyRegistrationOtp({
          email,
          code: otpCode,
        });

        if (res.success && res.data) {
          const resData = res.data as any;
          if (resData.accessToken) {
            TokenManager.setAccessToken(resData.accessToken);
          }
          if (resData.user) {
            localStorage.setItem('user_email', resData.user.email);
            localStorage.setItem('user_name', resData.user.name);
          }
          localStorage.setItem('email_verified', 'true');
          localStorage.setItem('user_status', 'verified');
          setLocalProfileVerification(true);
          sessionStorage.removeItem('kanaku_dev_otp');
          setVerified(true);
          toast.success('Email verified successfully! Welcome to Kanaku.');
          setTimeout(() => onVerified(), 1200);
          return;
        }
      } catch (backendErr: unknown) {
        // Report what actually went wrong.
        //
        // This used to swallow every non-INVALID_OTP failure and fall through to
        // `supabase.auth.verifyOtp()` — for a code Supabase never issued, since
        // registration mints it through the backend's own OTP service. That call
        // always failed, and the user was told "Invalid or expired verification
        // code" whatever the real cause was: a 502 because the mail provider was
        // down, a 500, a 429, or no network at all. They would then retype a
        // perfectly good code, fail again, and have no way to learn that the
        // problem was not their code.
        const err = backendErr as { code?: string; status?: number; message?: string };
        const clearInput = () => {
          setOtp(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        };

        if (err?.code === 'INVALID_OTP' || err?.code === 'INVALID_OTP_FORMAT') {
          // The one case where the code really is wrong: keep the server's
          // wording (it distinguishes expired from incorrect, and reports
          // remaining attempts).
          setError(err.message || 'Invalid or expired verification code.');
          clearInput();
          return;
        }

        if (err?.code === 'OTP_SEND_FAILED' || err?.status === 502) {
          setError('We could not reach the verification service. Please try "Resend code" in a moment.');
          return; // keep what they typed — it may well be correct
        }

        if (err?.status === 429) {
          setError('Too many attempts. Please wait a moment before trying again.');
          return;
        }

        setError(
          err?.message
            || 'We could not verify your code right now. Please try again in a moment.',
        );
        return;
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please check the code and try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendAttempts >= maxResendAttempts) {
      toast.error('Maximum resend attempts reached. Please wait a few minutes.');
      return;
    }
    if (resendCooldown > 0) return;

    setIsResending(true);
    setError(null);
    try {
      // Backend resend
      const res = await api.auth.resendRegistrationOtp(email);
      if (res.success) {
        setResendAttempts(prev => prev + 1);
        setResendCooldown(30);
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        toast.success(`New verification code sent to ${email}`);
        return;
      }

      // No Supabase fallback here, deliberately.
      //
      // It used to call `supabase.auth.signInWithOtp()` when the backend resend
      // failed. That is worse than doing nothing: registration codes are minted
      // and checked by the BACKEND's OTP service, so the fallback emailed the
      // user a second, Supabase-issued code that `verifyRegistrationOtp` can
      // never accept — and then reported success. The user would enter the
      // newest code they received and be told it was invalid, indefinitely.
      toast.error('We could not send a new code right now. Please try again in a moment.');
    } catch (err: unknown) {
      const error = err as { code?: string; status?: number; message?: string };
      // 429 carries a retry window; anything else is a delivery failure the
      // user can only wait out. Either way, say which it is.
      if (error?.status === 429) {
        toast.error('Too many requests. Please wait a moment before asking for another code.');
      } else {
        toast.error(error?.message || 'Failed to resend code. Please try again in a moment.');
      }
    } finally {
      setIsResending(false);
    }
  };

  // Masked email for display
  const maskedEmail = (() => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visibleStart = local.slice(0, 2);
    const maskedPart = local.length > 4 ? '•'.repeat(Math.min(local.length - 3, 6)) : '•'.repeat(2);
    const visibleEnd = local.length > 3 ? local.slice(-1) : '';
    return `${visibleStart}${maskedPart}${visibleEnd}@${domain}`;
  })();

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans flex flex-col lg:flex-row overflow-x-hidden select-none">
      {/* Left Column: Branded SaaS Desktop Showcase */}
      <div className="hidden lg:block lg:w-1/2 xl:w-[48%] sticky top-0 h-screen overflow-hidden">
        <AuthShowcase />
      </div>

      {/* Right Column: OTP Verification Form */}
      <div className="w-full lg:w-1/2 xl:w-[52%] min-h-screen overflow-y-auto flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 relative z-10">
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-violet-100/35 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-blue-100/25 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Top Bar: Brand + Navigation */}
        <div className="w-full flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center">
            <KanakuWordmark logoClassName="w-8 h-8" textClassName="text-xl" />
          </div>

          <button
            data-testid="otpverification-back"
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors py-1.5 px-3 rounded-xl hover:bg-slate-100"
          >
            <span>←</span> Back
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Encrypted connection</span>
          </div>
        </div>

        {/* Centered Form / Content Card */}
        <div className="flex-1 flex flex-col justify-center my-auto w-full py-2 sm:py-4">
          <AnimatePresence mode="wait">
            {verified ? (
              /* ── Success State ── */
              <motion.div
                key="verified-success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-lg mx-auto p-6 sm:p-8 bg-white border border-emerald-100/80 shadow-[0_10px_30px_-4px_rgba(16,185,129,0.12)] rounded-[28px] sm:rounded-[32px] relative overflow-hidden text-center"
              >
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-transparent to-teal-50/20 pointer-events-none" />

                <div className="relative z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-200/80 flex items-center justify-center shadow-lg shadow-emerald-500/10"
                  >
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                  </motion.div>

                  <h2 className="text-2xl sm:text-[1.65rem] font-extrabold text-slate-900 tracking-tight mb-2">
                    Email Verified!
                  </h2>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
                    Your identity is confirmed. Full access has been unlocked — setting up your account now…
                  </p>

                  <div className="mt-6 flex items-center justify-center gap-2 text-emerald-600">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-bold">Preparing your dashboard…</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ── OTP Entry State ── */
              <motion.div
                key="otp-entry"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-lg mx-auto p-4 sm:p-6 bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] rounded-[28px] sm:rounded-[32px] relative overflow-hidden"
              >
                {/* Header */}
                <div className="pb-4 sm:pb-5 border-b border-slate-100 mb-4 sm:mb-5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100/80 text-xs font-bold mb-2.5">
                    <Sparkles size={13} className="text-purple-600" />
                    <span>Email Verification</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-snug">
                    Verify Your Email
                  </h1>
                  <p className="text-slate-500 mt-1.5 text-xs sm:text-sm font-normal leading-relaxed">
                    Enter the 6-digit code we sent to complete your registration.
                  </p>
                </div>

                {/* Email destination card */}
                <div className="mb-5 p-3 bg-violet-50/60 border border-violet-100/80 rounded-xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 shadow-xs">
                    <Mail className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs text-violet-500/80 font-semibold uppercase tracking-wider mb-0.5">Sent to</p>
                    <p className="text-sm font-bold text-violet-900 truncate">{maskedEmail || email}</p>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 font-medium">{error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* OTP Input Grid */}
                <div className="flex justify-between gap-2 sm:gap-3 mb-6 max-w-sm mx-auto px-2">
                  {otp.map((digit, index) => (
                    <input
                      data-testid={`otpverification-input-${index}`}
                      key={index}
                      ref={el => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(index, e.target.value)}
                      onKeyDown={e => handleKeyDown(index, e)}
                      onPaste={handlePaste}
                      disabled={isLoading}
                      autoComplete="one-time-code"
                      className={`w-11 h-13 sm:w-13 sm:h-[3.5rem] text-center text-xl sm:text-2xl font-bold border-2 rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-violet-500/25 transition-all duration-200
                        ${digit
                          ? 'border-violet-600 bg-violet-50/50 text-violet-900 shadow-sm shadow-violet-500/10'
                          : 'border-slate-200 bg-slate-50/50 text-slate-900 hover:border-slate-300 focus:border-violet-500 focus:bg-white'
                        }
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    />
                  ))}
                </div>

                {/* Loading indicator */}
                <AnimatePresence>
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-2 mb-4 text-violet-600"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-xs font-bold">Verifying your code…</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Buttons */}
                <div className="space-y-2.5 mb-5">
                  <button
                    data-testid="otpverification-verify-email"
                    type="button"
                    onClick={() => handleVerifyOTP(otp.join(''))}
                    disabled={isLoading || otp.some(d => !d)}
                    className="w-full py-3.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify Now</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid="otpverification-verify-later"
                    onClick={() => {
                      if (onVerifyLater) {
                        onVerifyLater();
                      } else {
                        setLocalProfileVerification(false);
                        toast.info('Entering View-Only Mode. You can verify your profile anytime to add records.');
                        onVerified();
                      }
                    }}
                    disabled={isLoading}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-xs border border-slate-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Verify Later (Continue in View-Only Mode)
                  </button>
                </div>

                {/* Resend Section */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-center mb-3">
                    <p className="text-xs text-slate-400 font-medium mb-2">Didn't receive the code?</p>
                    {resendAttempts >= maxResendAttempts ? (
                      <p className="text-xs text-red-500 font-semibold">Maximum resend attempts reached. Please wait before retrying.</p>
                    ) : (
                      <button
                        data-testid="otpverification-button"
                        type="button"
                        onClick={handleResendOTP}
                        disabled={resendCooldown > 0 || isResending}
                        className="text-xs text-violet-600 hover:text-violet-800 font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        {isResending
                          ? 'Sending…'
                          : resendCooldown > 0
                          ? `Resend code in ${resendCooldown}s`
                          : `Resend Code (${maxResendAttempts - resendAttempts} left)`}
                      </button>
                    )}
                  </div>

                  <p className="text-center text-2xs text-slate-400 mb-4">
                    Check your spam/junk folder if you don't see the email
                  </p>
                </div>

                {/* Security Info Card */}
                <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-100/80">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 mb-1.5">Why verify your email?</p>
                      <ul className="text-2xs text-slate-500 space-y-1 leading-relaxed">
                        <li className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                          Secure your financial data with encryption
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                          Enable cloud sync across all devices
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                          Recover your account if you forget your PIN
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                          Receive important security alerts
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Legal Links */}
        <div className="pt-6 pb-2 text-center text-xs text-slate-400 font-medium select-none flex items-center justify-center flex-wrap gap-x-2 gap-y-1">
          <span>Local-First Private Ledger</span>
          <span className="text-slate-300">&bull;</span>
          <span>Encrypted End-to-End</span>
        </div>
      </div>
    </div>
  );
};
