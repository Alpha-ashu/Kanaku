import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowLeft, RefreshCw, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import supabase from '@/utils/supabase/client';

interface OTPVerificationProps {
 email: string;
 onVerified: () => void;
 onBack: () => void;
 isNewUser?: boolean;
 /** If provided, the OTP step cannot be skipped - user MUST verify email */
 mandatory?: boolean;
}

export const OTPVerification: React.FC<OTPVerificationProps> = ({
 email,
 onVerified,
 onBack,
 isNewUser = false,
 mandatory = true,
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
 inputRefs.current[0]?.focus();
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
 // Focus last filled input
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
 // For new users, Supabase sends a 'signup' type token when the account is
 // unconfirmed (even when triggered via signInWithOtp). Try 'signup' first,
 // then 'email' as fallback for already-confirmed returning users.
 let verifySuccess = false;

 const { error: signupError } = await supabase.auth.verifyOtp({
 email,
 token: otpCode,
 type: 'signup',
 });

 if (!signupError) {
 verifySuccess = true;
 } else {
 // Fallback: try 'email' type (for confirmed users doing signInWithOtp)
 const { error: emailError } = await supabase.auth.verifyOtp({
 email,
 token: otpCode,
 type: 'email',
 });
 if (!emailError) {
 verifySuccess = true;
 }
 }

 if (!verifySuccess) {
 setError('Invalid or expired code. Please request a new one.');
 setOtp(['', '', '', '', '', '']);
 inputRefs.current[0]?.focus();
 return;
 }

 // Mark as verified in localStorage for sync-service
 localStorage.setItem('email_verified', 'true');
 localStorage.setItem('user_status', 'verified');
 setVerified(true);
 toast.success('Email verified successfully! Welcome to KANAKU ');

 // Short delay to show success state before navigating
 setTimeout(() => onVerified(), 800);
 } catch (err: any) {
 setError('Verification failed. Please try again.');
 setOtp(['', '', '', '', '', '']);
 inputRefs.current[0]?.focus();
 } finally {
 setIsLoading(false);
 }
 };

 const handleResendOTP = async () => {
 if (resendAttempts >= maxResendAttempts) {
 setError('Maximum resend attempts reached. Please wait a few minutes before trying again.');
 return;
 }
 if (resendCooldown > 0) return;

 setIsResending(true);
 setError(null);
 try {
 // First try resend without creating user (standard case: user exists, just needs new code)
 const { error: resendError } = await supabase.auth.signInWithOtp({
 email,
 options: { shouldCreateUser: false },
 });

 if (resendError) {
 // 422 = user account doesn't exist yet (signup may have failed server-side)
 // or the email hasn't been confirmed - try with shouldCreateUser: true
 if (resendError.status === 422 || resendError.message?.toLowerCase().includes('user')) {
 const { error: createError } = await supabase.auth.signInWithOtp({
 email,
 options: { shouldCreateUser: true },
 });
 if (createError) throw createError;
 } else {
 throw resendError;
 }
 }

 setResendAttempts(prev => prev + 1);
 setResendCooldown(60);
 setOtp(['', '', '', '', '', '']);
 inputRefs.current[0]?.focus();
 toast.success(`New code sent to ${email}`);
 } catch (err: any) {
 const status = err?.status;
 // 429 = Supabase rate limit (max 3 emails/hour on free tier)
 if (status === 429 || err?.message?.toLowerCase().includes('rate limit')) {
 setError('Email rate limit reached - Supabase allows 3 emails/hour on the free plan. Please wait ~1 hour or configure a custom SMTP provider in your Supabase dashboard.');
 setResendCooldown(300); // 5 min cooldown to stop further attempts
 } else if (status === 500) {
 setError('Email sending is currently unavailable (Supabase server error). Please go back and try signing up again, or check your Supabase SMTP settings.');
 } else {
 toast.error(err?.message || 'Failed to resend code. Please try again in a minute.');
 }
 } finally {
 setIsResending(false);
 }
 };

 if (verified) {
 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
 <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
 <CheckCircle className="w-10 h-10 text-green-600" />
 </div>
 <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h2>
 <p className="text-gray-600">Setting up your account...</p>
 </div>
 </div>
 );
 }

 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
 {/* Header */}
 <div className="p-6 border-b border-gray-200">
 <button
 onClick={onBack}
 className="flex items-center text-gray-600 hover:text-gray-800 mb-4 transition-colors"
 >
 <ArrowLeft className="w-4 h-4 mr-2" />
 Back
 </button>
 <div className="text-center">
 <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
 <Mail className="w-8 h-8 text-blue-600" />
 </div>
 <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
 <p className="text-sm text-gray-600">We sent a 6-digit code to</p>
 <p className="text-sm font-semibold text-blue-600 mt-1">{email}</p>
 {mandatory && (
 <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-3 py-1 inline-block">
 Email verification is required to continue
 </p>
 )}
 </div>
 </div>

 {/* OTP Input */}
 <div className="p-6">
 {error && (
 <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
 <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
 <p className="text-sm text-red-600">{error}</p>
 </div>
 )}

 <div className="flex justify-center gap-2 mb-6">
 {otp.map((digit, index) => (
 <input
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
 className={`w-12 h-14 text-center text-2xl font-semibold border-2 rounded-xl
 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all
 ${digit ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white'}
 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'}
 `}
 />
 ))}
 </div>

 {/* Loading indicator */}
 {isLoading && (
 <div className="flex items-center justify-center gap-2 mb-4 text-blue-600">
 <RefreshCw className="w-5 h-5 animate-spin" />
 <span className="text-sm font-medium">Verifying...</span>
 </div>
 )}

 {/* Manual verify button */}
 {!isLoading && otp.every(d => d !== '') && (
 <button
 onClick={() => handleVerifyOTP(otp.join(''))}
 className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors mb-4"
 >
 Verify Email
 </button>
 )}

 {/* Resend Section */}
 <div className="text-center mb-4">
 <p className="text-sm text-gray-500 mb-2">Didn't receive the code?</p>
 {resendAttempts >= maxResendAttempts ? (
 <p className="text-sm text-red-500">Maximum resend attempts reached. Please wait before retrying.</p>
 ) : (
 <button
 onClick={handleResendOTP}
 disabled={resendCooldown > 0 || isResending}
 className="text-sm text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
 >
 {isResending ? (
 'Sending...'
 ) : resendCooldown > 0 ? (
 `Resend in ${resendCooldown}s`
 ) : (
 `Resend Code (${maxResendAttempts - resendAttempts} left)`
 )}
 </button>
 )}
 </div>

 {/* Check spam notice */}
 <div className="text-center mb-4">
 <p className="text-xs text-gray-400">
 Check your spam/junk folder if you don't see the email
 </p>
 </div>

 {/* Security Info */}
 <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
 <div className="flex items-start gap-3">
 <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
 <div className="text-sm">
 <p className="font-semibold text-blue-800 mb-1">Why verify your email?</p>
 <ul className="text-xs text-blue-700 space-y-1">
 <li> Secure your financial data</li>
 <li> Enable cloud sync across devices</li>
 <li> Recover your account if you forget PIN</li>
 <li> Receive important security alerts</li>
 </ul>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};
