import React, { useState, useEffect, useRef } from 'react';
import { Mail, CheckCircle, AlertCircle, RefreshCw, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, TokenManager } from '@/lib/api';
import { setLocalProfileVerification } from '@/hooks/useProfileVerification';

interface ProfileVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  email?: string;
  onVerified?: () => void;
}

export const ProfileVerificationModal: React.FC<ProfileVerificationModalProps> = ({
  isOpen,
  onClose,
  email: initialEmail,
  onVerified,
}) => {
  const [email, setEmail] = useState<string>(() => initialEmail || localStorage.getItem('user_email') || '');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    } else {
      const stored = localStorage.getItem('user_email');
      if (stored) setEmail(stored);
    }
  }, [initialEmail, isOpen]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen && resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [isOpen, resendCooldown]);

  useEffect(() => {
    if (isOpen) {
      setOtp(['', '', '', '', '', '']);
      setError(null);
      setVerifiedSuccess(false);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((digit) => digit !== '') && newOtp.join('').length === 6) {
      handleVerify(newOtp.join(''));
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
        handleVerify(pastedData);
      }
    }
  };

  const handleVerify = async (codeToVerify?: string) => {
    const code = codeToVerify || otp.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    const targetEmail = (email || localStorage.getItem('user_email') || '').trim();
    if (!targetEmail) {
      setError('Email address is missing. Please sign in again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.auth.verifyRegistrationOtp({
        email: targetEmail,
        code,
      });

      if (res.success) {
        const resData = (res.data as any) || {};
        if (resData.accessToken) {
          TokenManager.setAccessToken(resData.accessToken);
        }

        setLocalProfileVerification(true);
        setVerifiedSuccess(true);
        toast.success('Profile verified successfully! Record entry and editing unlocked.');

        setTimeout(() => {
          onVerified?.();
          onClose();
        }, 800);
      } else {
        setError(res.message || 'Invalid or expired verification code.');
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please check the code and try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    const targetEmail = (email || localStorage.getItem('user_email') || '').trim();
    if (!targetEmail) {
      toast.error('Email address missing. Please sign in again.');
      return;
    }

    setIsResending(true);
    setError(null);
    try {
      const res = await api.auth.resendRegistrationOtp(targetEmail);
      if (res.success) {
        setResendCooldown(30);
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        toast.success(`New verification code sent to ${targetEmail}`);
      } else {
        setError(res.message || 'Failed to resend code.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to resend code. Please try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-modal-title"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="verification-modal-title" className="text-base font-bold text-slate-900 leading-tight">
                Profile Verification
              </h3>
              <p className="text-xs text-slate-500 font-medium">Unlock full access & record entry</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {verifiedSuccess ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle className="w-9 h-9" />
              </div>
              <h4 className="text-lg font-black text-slate-900">Profile Verified!</h4>
              <p className="text-xs text-slate-500 mt-1">Full access granted. You can now add and edit records.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-5">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter the 6-digit code sent to your registered email:
                </p>
                <p className="text-xs font-bold text-violet-700 mt-0.5 break-all">
                  {email || 'your account email'}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium">{error}</p>
                </div>
              )}

              {/* 6 Digit Input */}
              <div className="flex justify-between gap-1.5 sm:gap-2 mb-6 max-w-xs mx-auto">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    data-testid={`profile-verification-otp-${index}`}
                    className={`w-11 h-12 text-center text-xl font-bold border-2 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/20 ${
                      digit
                        ? 'border-violet-600 bg-violet-50/40 text-violet-900'
                        : 'border-slate-200 bg-slate-50/50 text-slate-900 focus:border-violet-500 focus:bg-white'
                    }`}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleVerify()}
                  disabled={isLoading || otp.some((d) => !d)}
                  data-testid="profile-verification-submit-btn"
                  className="w-full py-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-md shadow-violet-500/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Verify Now & Unlock Access</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-xs cursor-pointer"
                >
                  Verify Later (Continue in View-Only Mode)
                </button>
              </div>

              {/* Resend */}
              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || isResending}
                  className="text-xs text-violet-600 hover:text-violet-800 font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isResending
                    ? 'Resending code...'
                    : resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Resend verification code'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
