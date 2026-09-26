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
            if (resData.user.name) {
              localStorage.setItem('user_name', resData.user.name);
              const first = resData.user.name.trim().split(/\s+/)[0];
              if (first) {
                localStorage.setItem('user_first_name', first);
              }
            }
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
    <div className="relative min-h-screen bg-gradient-to-br from-[#EDE9FE]/50 via-[#F5F4FE]/40 to-[#F8F9FD] text-slate-900 font-sans flex flex-col lg:flex-row overflow-x-hidden select-none">
      {/* Left Column: Branded SaaS Desktop Showcase */}
      <div className="hidden lg:block lg:w-1/2 xl:w-[48%] sticky top-0 h-screen overflow-hidden">
        <AuthShowcase />
      </div>

      {/* Right Column: OTP Verification Form */}
      <div className="w-full lg:w-1/2 xl:w-[52%] min-h-screen overflow-y-auto flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 relative z-10">
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-violet-300/20 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-indigo-200/20 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Top Bar: Brand + Navigation */}
        <div className="w-full flex items-center justify-between mb-4 sm:mb-6 max-w-lg mx-auto">
          <div className="flex items-center">
            <KanakuWordmark logoClassName="w-8 h-8 sm:w-9 sm:h-9" textClassName="text-xl sm:text-2xl font-black text-slate-900" />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              data-testid="otpverification-back"
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-all py-1.5 px-3 rounded-full bg-white/80 hover:bg-white border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95"
            >
              <span>←</span> Back
            </button>

            <div className="hidden sm:inline-flex items-center gap-1.5 text-2xs sm:text-xs font-bold text-emerald-700 bg-emerald-50/90 border border-emerald-200/80 px-2.5 py-1 rounded-full shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Encrypted connection</span>
            </div>
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
                className="w-full max-w-lg mx-auto p-6 sm:p-8 bg-white/95 backdrop-blur-2xl border border-emerald-100/90 shadow-[0_20px_50px_-12px_rgba(16,185,129,0.15)] rounded-[28px] sm:rounded-[36px] relative overflow-hidden text-center"
              >
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-transparent to-teal-50/20 pointer-events-none" />

                <div className="relative z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-200/80 flex items-center justify-center shadow-lg shadow-emerald-500/10"
                  >
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                  </motion.div>

                  <h2 className="text-2xl sm:text-[1.65rem] font-black text-slate-900 tracking-tight mb-2">
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
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-lg mx-auto p-6 sm:p-8 md:p-9 bg-white/95 backdrop-blur-2xl border border-slate-200/90 shadow-[0_20px_50px_-12px_rgba(112,144,176,0.14),0_1px_3px_rgba(0,0,0,0.04)] rounded-[28px] sm:rounded-[36px] relative overflow-hidden"
              >
                {/* Illustrated Badge (like in reference image) */}
                <div className="text-center mb-6">
                  <div className="relative mx-auto w-20 h-20 sm:w-22 sm:h-22 mb-4 flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/25 via-indigo-500/20 to-purple-500/15 rounded-3xl blur-xl" />
                    <div className="relative w-16 h-16 sm:w-18 sm:h-18 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-3xl shadow-lg shadow-violet-500/25 flex items-center justify-center text-white ring-4 ring-white">
                      <Mail className="w-8 h-8 sm:w-9 sm:h-9" />
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-md ring-2 ring-white">
                        <ShieldCheck className="w-4 h-4 text-slate-900" />
                      </div>
                    </div>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
                    Verify Your Email Address
                  </h1>
                  <p className="text-slate-500 mt-2 text-xs sm:text-sm font-normal leading-relaxed max-w-sm mx-auto">
                    We sent a 6-digit verification code to confirm your email address.
                  </p>

                  {/* Recipient banner & Change link */}
                  <div className="mt-4 p-3 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 text-left">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Sent to</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={email}>{email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onBack}
                      className="shrink-0 text-xs font-bold text-violet-600 hover:text-violet-700 hover:underline px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Change email
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-700 font-semibold leading-relaxed">{error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* OTP Label */}
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2.5 px-0.5">
                  <span className="uppercase tracking-wider">Enter OTP</span>
                  <span className="text-2xs font-semibold text-slate-400">6 digits</span>
                </div>

                {/* OTP Input Grid */}
                <div className="flex justify-between gap-2 sm:gap-2.5 mb-2 max-w-sm mx-auto">
                  {otp.map((digit, index) => (
                    <input
                      data-testid={`otpverification-input-${index}`}
                      key={index}
                      ref={el => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      placeholder="-"
                      onChange={e => handleOtpChange(index, e.target.value)}
                      onKeyDown={e => handleKeyDown(index, e)}
                      onPaste={handlePaste}
                      disabled={isLoading}
                      autoComplete="one-time-code"
                      className={`w-11 h-13 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-black border-2 rounded-2xl
                        focus:outline-none transition-all duration-200
                        ${digit
                          ? 'border-violet-600 bg-violet-50/40 text-violet-950 shadow-sm shadow-violet-500/10'
                          : 'border-slate-200/90 bg-slate-50/70 text-slate-900 placeholder:text-slate-300 hover:border-slate-300 focus:border-violet-600 focus:bg-white focus:ring-4 focus:ring-violet-500/15'
                        }
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    />
                  ))}
                </div>

                {/* Progress dot indicators (like in Reference 2) */}
                <div className="flex items-center justify-center gap-1.5 my-3.5">
                  {[0, 1, 2, 3, 4, 5].map(idx => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        otp[idx] ? 'w-5 bg-violet-600 shadow-xs' : 'w-1.5 bg-slate-200'
                      }`}
                    />
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 mb-5 mt-4">
                  <button
                    data-testid="otpverification-verify-email"
                    type="button"
                    onClick={() => handleVerifyOTP(otp.join(''))}
                    disabled={isLoading || otp.some(d => !d)}
                    className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 active:scale-[0.99] text-white font-bold rounded-2xl shadow-[0_8px_25px_-4px_rgba(124,58,237,0.35)] hover:shadow-[0_10px_30px_-4px_rgba(124,58,237,0.45)] transition-all text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 h-12 sm:h-13"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        <span>Verify Email</span>
                      </>
                    )}
                  </button>

                  {onVerifyLater && (
                    <button
                      type="button"
                      data-testid="otpverification-verify-later"
                      onClick={onVerifyLater}
                      disabled={isLoading}
                      className="w-full py-3 bg-slate-50/90 hover:bg-violet-50/60 text-slate-700 hover:text-violet-900 font-bold rounded-2xl transition-all text-xs border border-slate-200/90 hover:border-violet-200/80 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] shadow-2xs group"
                    >
                      <Clock className="w-4 h-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
                      <span>Verify Later (Continue in View-Only Mode)</span>
                    </button>
                  )}
                </div>

                {/* Resend Section */}
                <div className="pt-4 border-t border-slate-100 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500 font-medium mb-1">
                    <span>Didn't receive the code?</span>
                    {resendAttempts >= maxResendAttempts ? (
                      <span className="text-xs text-rose-500 font-semibold">Maximum resend attempts reached. Please wait.</span>
                    ) : (
                      <button
                        data-testid="otpverification-button"
                        type="button"
                        onClick={handleResendOTP}
                        disabled={resendCooldown > 0 || isResending}
                        className="text-xs text-violet-600 hover:text-violet-800 font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        {isResending
                          ? 'Sending...'
                          : resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : 'Resend Code'}
                      </button>
                    )}
                  </div>
                  <p className="text-2xs text-slate-400 mt-1">
                    Check your spam or junk folder if you don't see it in your inbox.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Legal Links */}
        <div className="pt-6 pb-2 text-center text-xs text-slate-400 font-medium select-none flex items-center justify-center flex-wrap gap-x-2.5 gap-y-1">
          <span>Local-First Private Ledger</span>
          <span className="text-slate-300">&bull;</span>
          <span>Encrypted End-to-End</span>
        </div>
      </div>
    </div>
  );
};
