import React, { useState, useEffect } from 'react';
import { Shield, TrendingUp, Sparkles, ArrowRight, AlertTriangle, Calendar, Fingerprint, Lock, Eye, EyeOff, CheckCircle, Mail } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { motion } from 'framer-motion';
import { SignInForm } from './SignInForm';
import { SignUpForm } from './SignUpForm';
import { OTPVerification } from './OTPVerification';
import { PINSetup } from './PINSetup';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import { PrivacyPolicy } from '@/app/components/marketing/PrivacyPolicy';
import { Terms } from '@/app/components/marketing/Terms';
import { saveAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { api, TokenManager } from '@/lib/api';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';
import { enableGuestMode, isGuestMode, disableGuestMode, migrateGuestDataToUser, migrateGuestLocalStorage } from '@/lib/guestMode';
import { pinService, isPinMissing } from '@/services/pinService';
import { signIn as supabaseSignIn, signUp as supabaseSignUp, resendSignupConfirmation, DUPLICATE_ACCOUNT_MESSAGE } from '@/lib/supabase-helpers';
import { MailCheck } from 'lucide-react';

// Auth source of truth for the login UI. 'custom' (default) keeps the backend-issued
// JWT flow; 'supabase' (Option A) authenticates via Supabase Auth so the API client's
// (already Supabase-first) token resolution carries the Supabase session.
// See docs/AUTH_CONSOLIDATION_PLAN.md.
// Backend-managed auth (BFF) is the default: login/signup go through our own
// API and the client uses only the backend JWT. Set VITE_AUTH_CANONICAL=supabase
// to fall back to direct Supabase auth (legacy / emergency rollback).
const AUTH_CANONICAL = (import.meta.env.VITE_AUTH_CANONICAL || 'backend') as string;

/** Internal-only logger - never leaks raw errors to the browser console in production. */
const internalLog = {
 warn: (context: string, err?: unknown) => {
 if (import.meta.env.DEV) {
 // eslint-disable-next-line no-console
 console.warn(`[KANAKU/${context}]`, err instanceof Error ? err.message : err);
 }
 },
 error: (context: string, err?: unknown) => {
 if (import.meta.env.DEV) {
 // eslint-disable-next-line no-console
 console.error(`[KANAKU/${context}]`, err instanceof Error ? err.message : err);
 }
 },
};

type AuthStep =
 | 'welcome'
 | 'signin'
 | 'signup'
 | 'email-confirm'
 | 'otp-verify'
 | 'profile-setup'
 | 'salary-setup'
 | 'pin-setup'
 | 'complete'
 | 'privacy'
 | 'terms'
 | 'forgot-password'
 | 'reset-password'
 | 'reset-success'
 | 'reset-otp-verify';

interface UserProfile {
 firstName: string;
 lastName: string;
 email: string;
 mobile: string;
 dateOfBirth: string;
 jobType: string;
 jobIndustry: string;
 monthlyIncome: string;
}

interface SalaryAccount {
 bankName: string;
 accountName: string;
 accountType: string;
 openingBalance: string;
 salaryCreditDate: string;
 isPrimary: boolean;
}

interface AuthFlowProps {
 onBack?: () => void;
 initialStep?: AuthStep;
 onNavigate?: (page: string) => void;
 onLogin?: () => void;
 onGetStarted?: () => void;
}

export const AuthFlow: React.FC<AuthFlowProps> = ({ onBack, initialStep, onNavigate, onLogin, onGetStarted }) => {
 const [step, setStep] = useState<AuthStep>(initialStep || 'welcome');
 const [email, setEmail] = useState('');
 const [isNewUser, setIsNewUser] = useState(false);
 const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
 const [salaryAccount, setSalaryAccount] = useState<SalaryAccount | null>(null);
 const [isLoading, setIsLoading] = useState(false);
 const [showGuestCaution, setShowGuestCaution] = useState(false);
 const [psDob, setPsDob] = useState('');
 const [resendLoading, setResendLoading] = useState(false);

  const [forgotEmailState, setForgotEmailState] = useState('');
  const [forgotErrorState, setForgotErrorState] = useState('');
  const [forgotLoadingState, setForgotLoadingState] = useState(false);

  const [resetOtpState, setResetOtpState] = useState('');
  const [resetPasswordState, setResetPasswordState] = useState('');
  const [resetConfirmPasswordState, setResetConfirmPasswordState] = useState('');
  const [resetErrorState, setResetErrorState] = useState('');
  const [resetLoadingState, setResetLoadingState] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const [otpInputs, setOtpInputs] = useState<string[]>(Array(6).fill(''));
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const otpRefs = React.useRef<(HTMLInputElement | null)[]>([]);

 useEffect(() => {
   if (userProfile?.dateOfBirth) {
     setPsDob(userProfile.dateOfBirth);
   }
 }, [userProfile]);

  // Check if user is already partially through the flow
  useEffect(() => {
    const checkFlowState = async () => {
      const pendingEmail = localStorage.getItem('pending_auth_email');
      const flowStep = localStorage.getItem('auth_flow_step');
      const timestampStr = localStorage.getItem('auth_flow_step_timestamp');

      if (pendingEmail && flowStep) {
        const isResetStep = flowStep === 'reset-otp-verify' || flowStep === 'reset-password';
        if (isResetStep && timestampStr) {
          const ageSeconds = (Date.now() - parseInt(timestampStr, 10)) / 1000;
          if (ageSeconds > 30) {
            localStorage.removeItem('auth_flow_step');
            localStorage.removeItem('pending_auth_email');
            localStorage.removeItem('auth_flow_step_timestamp');
            return;
          }
        }
        setEmail(pendingEmail);
        setStep(flowStep as AuthStep);
      }
    };
    checkFlowState();
  }, []);

  useEffect(() => {
    const isResetFlow = step === 'reset-otp-verify' || step === 'reset-password' || step === 'reset-success';
    if (!isResetFlow && step !== 'forgot-password') {
      localStorage.removeItem('auth_flow_step');
      localStorage.removeItem('pending_auth_email');
      localStorage.removeItem('auth_flow_step_timestamp');
    }
  }, [step]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [resendCooldown]);

  const handleResendOTP = async () => {
    if (!email) {
      toast.error('Email address is missing.');
      return;
    }
    setIsResending(true);
    try {
      const res = await api.auth.forgotPassword(email);
      if (res.success) {
        toast.success('A new verification code has been sent to your email.');
        localStorage.setItem('auth_flow_step_timestamp', Date.now().toString());
        setResendCooldown(30);
      } else {
        toast.error(res.message || 'Failed to resend verification code.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend verification code.');
    } finally {
      setIsResending(false);
    }
  };

 // Guest Mode 
 const handleGuestMode = () => {
 setShowGuestCaution(true);
 };

 const confirmGuestMode = () => {
 enableGuestMode();
 // Reload so the app opens in guest mode (onboarding_completed = true)
 window.location.reload();
 };

 // Migrate any guest data when a guest user signs in / signs up
 const runGuestMigrationIfNeeded = async (userId: string) => {
 if (!isGuestMode()) return;
 try {
 migrateGuestLocalStorage();
 const summary = await migrateGuestDataToUser(userId);
 disableGuestMode();
 const total = Object.values(summary).reduce((a, b) => a + b, 0);
 if (total > 0) {
 toast.success(`${total} item${total > 1 ? 's' : ''} from your guest session have been saved to your account.`);
 }
 } catch {
 // Non-blocking - data stays local and will sync later
 }
 };


  const handleSignIn = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      // Option A: authenticate via Supabase. supabase-js persists the session, which
      // the API client uses for all backend calls + refresh.
      if (AUTH_CANONICAL === 'supabase') {
        const { user } = await supabaseSignIn(credentials.email, credentials.password);
        setEmail(credentials.email);
        setIsNewUser(false);
        if (user) await runGuestMigrationIfNeeded(user.id);
        localStorage.removeItem('auth_flow_step');
        localStorage.removeItem('pending_auth_email');
        if (user) localStorage.setItem('onboarding_completed', 'true');
        window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
        return;
      }

      const response = await api.auth.login({
        email: credentials.email,
        password: credentials.password,
      });

      if (!response.success) {
        throw new Error(response.message || 'Login failed');
      }

      const resData = response.data as any;
      const user = resData.user;
      const accessToken = resData.accessToken;

      // Refresh token is set as an HttpOnly cookie by the server — never in the
      // body. Only the access token is stored by JS.
      if (accessToken) {
        TokenManager.setAccessToken(accessToken);
      }

      setEmail(credentials.email);
      setIsNewUser(false);

      if (user) {
        await runGuestMigrationIfNeeded(user.id);
      }

      localStorage.removeItem('auth_flow_step');
      localStorage.removeItem('pending_auth_email');

      if (user) {
        localStorage.setItem('onboarding_completed', 'true');
      }

      window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
      return;
    } catch (error: any) {
      internalLog.error('handleSignIn', error);
      const isNetworkError =
        error?.name === 'AuthRetryableFetchError' ||
        error?.message?.includes('aborted') ||
        error?.message?.includes('fetch');
      // Supabase returns code 'email_not_confirmed' (HTTP 400) when the account
      // exists but the confirmation link hasn't been clicked. Detect this BEFORE
      // the generic 400 → invalid-credentials mapping, and route the user to the
      // confirmation screen (with a resend option) instead of a misleading
      // "incorrect password" message.
      const isEmailNotConfirmed =
        error?.code === 'email_not_confirmed' ||
        error?.message?.toLowerCase().includes('not confirmed');
      if (isEmailNotConfirmed) {
        setEmail(credentials.email);
        setIsNewUser(true);
        setStep('email-confirm');
        toast.error('Please confirm your email before signing in. We can resend the link below.');
        return;
      }
      const isInvalidCredentials =
        error?.message?.toLowerCase().includes('invalid login credentials') ||
        error?.status === 400 ||
        error?.code === 'INVALID_CREDENTIALS';
      let userMessage = 'Sign in failed. Please try again.';
      if (isNetworkError) userMessage = 'Unable to connect. Please check your internet connection and try again.';
      else if (isInvalidCredentials) userMessage = 'Incorrect email or password. Please check your details and try again.';
      toast.error(userMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (data: { firstName: string; lastName: string; email: string; mobile: string; password: string }) => {
    setIsLoading(true);
    try {
      // Option A: register via Supabase Auth.
      if (AUTH_CANONICAL === 'supabase') {
        const fullName = `${data.firstName} ${data.lastName}`.trim();
        const { user, session } = await supabaseSignUp(data.email, data.password, fullName);
        setEmail(data.email);
        setUserProfile({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          mobile: data.mobile,
          dateOfBirth: '',
          jobType: '',
          jobIndustry: '',
          monthlyIncome: '',
        });
        setIsNewUser(true);

        // Email confirmation ON → Supabase returns no session until the user
        // clicks the confirmation link. We must NOT advance into onboarding (the
        // user isn't authenticated yet); show the "confirm your email" screen and
        // halt the SignUpForm so it never shows its success screen.
        if (!session) {
          localStorage.removeItem('auth_flow_step');
          localStorage.removeItem('pending_auth_email');
          localStorage.removeItem('onboarding_completed');
          setStep('email-confirm');
          toast.success('Account created! Please confirm your email to continue.');
          const halt = new Error('EMAIL_CONFIRMATION_REQUIRED') as Error & { code?: string };
          halt.code = 'EMAIL_CONFIRMATION_REQUIRED';
          throw halt;
        }

        if (user) await runGuestMigrationIfNeeded(user.id);
        localStorage.removeItem('auth_flow_step');
        localStorage.removeItem('pending_auth_email');
        localStorage.removeItem('onboarding_completed');
        window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
        toast.success("Account created! Let's set up your profile.");
        return;
      }

      const response = await api.auth.register({
        name: `${data.firstName} ${data.lastName}`.trim(),
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        mobile: data.mobile,
      } as any);

      if (!response.success) {
        throw new Error(response.message || 'Registration failed');
      }

      const resData = response.data as any;
      const user = resData.user;
      const accessToken = resData.accessToken;

      // Refresh token is set as an HttpOnly cookie by the server — never in the
      // body. Only the access token is stored by JS.
      if (accessToken) {
        TokenManager.setAccessToken(accessToken);
      }

      setEmail(data.email);
      setUserProfile({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        mobile: data.mobile,
        dateOfBirth: '',
        jobType: '',
        jobIndustry: '',
        monthlyIncome: '',
      });
      setIsNewUser(true);

      if (user) {
        await runGuestMigrationIfNeeded(user.id);
      }

      localStorage.removeItem('auth_flow_step');
      localStorage.removeItem('pending_auth_email');
      localStorage.removeItem('onboarding_completed');
      window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
      toast.success("Account created! Let's set up your profile.");
    } catch (error: any) {
      // Not an error — signup succeeded but needs email confirmation. The step
      // is already switched and a success toast shown; re-throw only to halt the
      // SignUpForm (so it doesn't render its own success screen).
      if (error?.code === 'EMAIL_CONFIRMATION_REQUIRED') {
        throw error;
      }
      const isNetworkError = error?.name === 'AuthRetryableFetchError' || error?.message?.includes('aborted');
      const isServerError = error?.status === 500 || error?.message?.toLowerCase().includes('internal server error');
      const isDuplicateUser =
        error?.code === 'user_already_exists' ||
        error?.status === 422 ||
        error?.code === 'EMAIL_EXISTS' ||
        error?.message?.toLowerCase().includes('already registered');
      const isDuplicatePhone = error?.code === 'PHONE_EXISTS';

      let errMsg = error.message || 'Failed to create account';
      if (isNetworkError) {
        errMsg = 'Cannot connect to server. Please try again later.';
      } else if (isDuplicateUser || isDuplicatePhone) {
        // Generic, non-enumerable message — never confirms which detail is taken.
        errMsg = DUPLICATE_ACCOUNT_MESSAGE;
      } else if (isServerError) {
        errMsg = 'Signup is temporarily unavailable (server error). Please try again in a moment.';
      }

      toast.error(errMsg);
      // Re-throw so the SignUpForm halts and never shows its "Account Created"
      // success screen for a failed/duplicate registration. The parent owns the
      // user-facing message (toast above); the form only needs to stop.
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPVerified = async () => {
    if (isNewUser) {
      // New users skip AuthFlow onboarding and go to NewUserOnboarding in App.tsx
      localStorage.removeItem('auth_flow_step');
      localStorage.removeItem('pending_auth_email');
      window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
    } else {
      // Check if user already has PIN server-side before routing to pin-setup
      try {
        const status = await pinService.getStatus();
        const hasServerPin = status.success && !isPinMissing(status);
        const hasLocalPin = pinService.hasPin();

        if (hasServerPin || hasLocalPin) {
          // User already has PIN, skip to complete
          localStorage.setItem('onboarding_completed', 'true');
          localStorage.removeItem('auth_flow_step');
          localStorage.removeItem('pending_auth_email');
          window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
          return;
        }
      } catch {
        // If check fails, proceed to pin-setup to be safe
      }
      setStep('pin-setup');
      saveFlowState('pin-setup');
    }
  };

 const handleOTPSkip = async () => {
 // Limited mode - still allow entry
 if (isNewUser) {
 setStep('profile-setup');
 saveFlowState('profile-setup');
 } else {
 // Check if user already has PIN server-side before routing to pin-setup
 try {
 const status = await pinService.getStatus();
 const hasServerPin = status.success && !isPinMissing(status);
 const hasLocalPin = pinService.hasPin();

 if (hasServerPin || hasLocalPin) {
 // User already has PIN, skip to complete
 localStorage.setItem('onboarding_completed', 'true');
 localStorage.removeItem('auth_flow_step');
 localStorage.removeItem('pending_auth_email');
 window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
 return;
 }
 } catch {
 // If check fails, proceed to pin-setup to be safe
 }
 setStep('pin-setup');
 saveFlowState('pin-setup');
 }
 toast.info('You can verify your email later in Settings');
 };

 const handleProfileComplete = (profile: UserProfile) => {
 setUserProfile(profile);
 setStep('salary-setup');
 saveFlowState('salary-setup');
 };

 const handleSalarySetupComplete = async (account: SalaryAccount) => {
 setIsLoading(true);
 setSalaryAccount(account);

 try {
 const { data: { session } } = await supabase.auth.getSession();
 const user = session?.user ?? null;

 if (user) {
 const monthlyIncome = parseFloat(userProfile?.monthlyIncome || '0');
 const fullName = `${userProfile?.firstName ?? ''} ${userProfile?.lastName ?? ''}`.trim();
  const profilePayload = {
    firstName: userProfile?.firstName || null,
    lastName: userProfile?.lastName || null,
    phone: userProfile?.mobile || null,
    mobile: userProfile?.mobile || null,
    dateOfBirth: userProfile?.dateOfBirth || null,
    jobType: userProfile?.jobType || null,
    monthlyIncome: Number.isFinite(monthlyIncome) ? monthlyIncome : null,
  };

 localStorage.setItem('user_profile', JSON.stringify({
 displayName: fullName,
 firstName: userProfile?.firstName || '',
 lastName: userProfile?.lastName || '',
 email: userProfile?.email || user.email || '',
 mobile: userProfile?.mobile || '',
 dateOfBirth: userProfile?.dateOfBirth || '',
 jobType: userProfile?.jobType || '',
 salary: Number.isFinite(monthlyIncome) ? monthlyIncome * 12 : 0,
 monthlyIncome: Number.isFinite(monthlyIncome) ? monthlyIncome : 0,
 updatedAt: new Date().toISOString(),
 }));
 localStorage.setItem('profile_sync_pending', 'true');

  try {
  await api.auth.updateProfile(profilePayload);
  localStorage.removeItem('profile_sync_pending');
  } catch (profileError: any) {
  internalLog.warn('handleSalarySetupComplete/profileSync', profileError);
  const errMsg = profileError?.message || '';
  if (
    profileError?.code === 'PHONE_EXISTS' ||
    profileError?.status === 409 ||
    errMsg.toLowerCase().includes('phone')
  ) {
    toast.error('This phone number is already registered to another account. Please use a different phone number.');
    setStep('profile-setup');
    saveFlowState('profile-setup');
    setIsLoading(false);
    return;
  }
  }

 localStorage.setItem('device_id', localStorage.getItem('device_id') || generateDeviceId());
 }

 setStep('pin-setup');
 saveFlowState('pin-setup');
 } catch (error) {
 internalLog.error('handleSalarySetupComplete', error);
 toast.error('Failed to save profile. Please try again.');
 } finally {
 setIsLoading(false);
 }
 };

 const handlePINComplete = async (pin: string) => {
 setIsLoading(true);
 try {
 // Auto-provision accounts and setup
 await autoProvisionAccounts();

 // Clear auth flow state but DO NOT mark onboarding complete
 // New users will go through NewUserOnboarding which includes PIN setup
 localStorage.removeItem('auth_flow_step');
 localStorage.removeItem('pending_auth_email');

 toast.success('Setup complete! Welcome to KANAKU!');

 // Dispatch global event for other modules
 window.dispatchEvent(new CustomEvent('PROFILE_SETUP_COMPLETED', {
 detail: { profile: userProfile, salaryAccount }
 }));

 setStep('complete');
 } catch (error) {
 internalLog.error('handlePINComplete', error);
 toast.error('Setup failed. Please try again.');
 } finally {
 setIsLoading(false);
 }
 };

 const autoProvisionAccounts = async () => {
 try {
 const { data: { session } } = await supabase.auth.getSession();
 const user = session?.user ?? null;

 if (!user || !salaryAccount) return;

 const accountName = `${salaryAccount.bankName} - ${salaryAccount.accountName}`;
 const balance = parseFloat(salaryAccount.openingBalance) || 0;

 await saveAccountWithBackendSync({
 name: accountName,
 type: 'bank',
 balance,
 currency: 'INR',
 isActive: true,
 createdAt: new Date(),
 });
 toast.success('Salary account created!');
 } catch (error) {
 internalLog.error('autoProvisionAccounts', error);
 toast.error('Failed to create account. Please try again.');
 }
 };

 const generateDeviceId = (): string => {
 const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 localStorage.setItem('device_id', deviceId);
 return deviceId;
 };

 const handleResendConfirmation = async () => {
 if (!email || resendLoading) return;
 setResendLoading(true);
 try {
 await resendSignupConfirmation(email);
 toast.success('Confirmation email sent. Please check your inbox (and spam).');
 } catch (error: any) {
 // Generic, non-enumerable: never reveal whether the address exists/was already confirmed.
 internalLog.warn('handleResendConfirmation', error);
 toast.success('If that email needs confirmation, we just sent a new link.');
 } finally {
 setResendLoading(false);
 }
 };


 // Welcome Screen
 const renderWelcome = () => {
 const containerVariants = {
 hidden: { opacity: 0 },
 show: { opacity: 1, transition: { staggerChildren: 0.12 } }
 };
 const itemVariants = {
 hidden: { opacity: 0, y: 24 },
 show: { opacity: 1, y: 0, transition: { type:"spring" as const, stiffness: 300, damping: 24 } }
 };

 return (
 <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex flex-col font-sans select-none">
 {onNavigate && onLogin && onGetStarted && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={() => { setStep('signin'); onLogin(); }}
 onGetStarted={() => { setStep('signup'); onGetStarted(); }}
 currentPage="welcome"
 />
 )}
 {/* Subtle decorative blobs */}
 <div className="absolute inset-0 pointer-events-none overflow-hidden">
 <div className="absolute -top-[15%] -left-[10%] w-[60vw] h-[60vw] md:w-[40vw] md:h-[40vw] bg-blue-200/40 rounded-full blur-[80px]" />
 <div className="absolute top-[50%] -right-[10%] w-[50vw] h-[50vw] md:w-[35vw] md:h-[35vw] bg-indigo-200/30 rounded-full blur-[80px]" />
 </div>

 <motion.div
 variants={containerVariants}
 initial="hidden"
 animate="show"
 className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 sm:px-8 mt-24"
 >
 {/* Logo Section */}
 <motion.div variants={itemVariants} className="mb-10 text-center w-full max-w-sm">
 <div className="relative w-24 h-24 mx-auto mb-6">
 <motion.div
 animate={{ rotate: 360 }}
 transition={{ duration: 25, repeat: Infinity, ease:"linear" }}
 className="absolute inset-0 rounded-[2rem] border-2 border-blue-200 border-dashed"
 />
 <div className="absolute inset-2 bg-white rounded-3xl flex items-center justify-center shadow-sm">
 <KANAKULogo className="w-12 h-12 drop-shadow-sm" />
 </div>
 </div>
 <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
 KANAKU
 </h1>
 <p className="text-base sm:text-lg text-gray-500 font-medium max-w-[280px] sm:max-w-md mx-auto leading-relaxed">
 Experience the future of personal finance. Track, grow, and master your wealth seamlessly.
 </p>
 </motion.div>

 {/* Feature Pills */}
 <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-3 w-full max-w-sm mb-12">
 {[
 { icon: TrendingUp, text: 'Insights' },
 { icon: Shield, text: 'Secure' },
 { icon: Sparkles, text: 'Smart' },
 ].map((feature, i) => (
 <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-default">
 <feature.icon className="w-4 h-4 text-blue-600" />
 <span className="text-sm font-medium text-gray-700">{feature.text}</span>
 </div>
 ))}
 </motion.div>
 </motion.div>

 {/* Call To Actions */}
 <motion.div
 initial={{ opacity: 0, y: 40 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.5, type:"spring", stiffness: 300, damping: 30 }}
 className="relative z-10 px-6 sm:px-8 pb-12 w-full max-w-md mx-auto"
 >
 <div className="space-y-3">
 <motion.button data-testid="auth-flow-create-account"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 onClick={() => setStep('signup')}
 className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-2xl py-4 text-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
 >
 Create Account
 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
 </motion.button>

 <motion.button data-testid="auth-flow-sign-in"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 onClick={() => setStep('signin')}
 className="w-full bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-2xl py-4 font-semibold text-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2"
 >
 Sign In
 </motion.button>

 {/* Continue as Guest */}
 <motion.button data-testid="auth-flow-continue-as-guest"
 whileHover={{ scale: 1.01 }}
 whileTap={{ scale: 0.99 }}
 onClick={handleGuestMode}
 className="w-full text-gray-400 hover:text-gray-600 py-3 text-sm font-medium transition-colors"
 >
 Continue as Guest
 </motion.button>

 {onBack && (
 <button data-testid="auth-flow-back-to-landing-page"
 onClick={onBack}
 className="w-full mt-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors py-2"
 >
 Back to Landing Page
 </button>
 )}
 </div>
 </motion.div>

 {/* Guest Mode Caution Modal */}
 {showGuestCaution && (
 <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 20 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl"
 >
 <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
 <AlertTriangle className="text-amber-600" size={24} />
 </div>
 <h3 className="text-xl font-bold text-gray-900 mb-2">Continue as Guest?</h3>
 <p className="text-sm text-gray-600 mb-4 leading-relaxed">
 Guest mode stores all your financial data <strong>locally on this device only</strong>.
 </p>
 <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl mb-6 font-medium border border-red-100">
 If you forget your PIN, there is no way to recover it. You will have to reset the app and <strong>all your data will be permanently lost</strong>. Sign in to safely backup your data.
 </div>

 <div className="flex gap-3">
 <button data-testid="auth-flow-cancel"
 type="button"
 onClick={() => setShowGuestCaution(false)}
 className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors text-sm"
 >
 Cancel
 </button>
 <button data-testid="auth-flow-proceed-as-guest"
 type="button"
 onClick={confirmGuestMode}
 className="flex-[1.5] py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors text-sm shadow-md shadow-amber-500/20"
 >
 Proceed as Guest
 </button>
 </div>
 </motion.div>
 </div>
 )}
 </div>
 );
 };


 // Profile Setup Step
 const renderProfileSetup = () => (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
 <div className="p-6 border-b border-gray-200">
 <h2 className="text-xl font-semibold text-gray-800">Complete Your Profile</h2>
 <p className="text-sm text-gray-600 mt-1">Tell us a bit about yourself</p>
 </div>
 <form data-testid="auth-flow-form"
 className="p-6 space-y-4"
 onSubmit={(e) => {
 e.preventDefault();
 const formData = new FormData(e.target as HTMLFormElement);
 handleProfileComplete({
 // Read firstName/lastName/mobile from the actual form inputs (not stale state)
 firstName: (formData.get('firstName') as string) || userProfile?.firstName || '',
 lastName: (formData.get('lastName') as string) || userProfile?.lastName || '',
 email: email,
 mobile: (formData.get('mobile') as string) || userProfile?.mobile || '',
 dateOfBirth: formData.get('dob') as string,
 jobType: formData.get('jobType') as string,
 jobIndustry: formData.get('jobIndustry') as string,
 monthlyIncome: formData.get('income') as string,
 });
 }}
 >
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="ps-firstName" className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
 <input data-testid="auth-flow-first-name"
 type="text"
 id="ps-firstName"
 name="firstName"
 defaultValue={userProfile?.firstName}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 />
 </div>
 <div>
 <label htmlFor="ps-lastName" className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
 <input data-testid="auth-flow-last-name"
 type="text"
 id="ps-lastName"
 name="lastName"
 defaultValue={userProfile?.lastName}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 />
 </div>
 </div>

  <div>
    <label htmlFor="ps-dob" className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
    <div data-testid="auth-flow-div" 
      className="relative group w-full" 
      onClick={(e) => {
        const input = e.currentTarget.querySelector('input');
        if (input) (input as any).showPicker?.();
      }}
    >
      <div className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 text-sm text-left flex items-center justify-between bg-white min-h-[46px] cursor-pointer">
        <span className={psDob ? "text-gray-900" : "text-gray-400"}>
          {(() => {
            if (!psDob) return 'Select Date';
            try {
              const date = new Date(psDob);
              if (isNaN(date.getTime())) return psDob;
              const day = String(date.getDate()).padStart(2, '0');
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
            } catch (err) {
              return psDob;
            }
          })()}
        </span>
        <Calendar size={14} className="text-gray-400" />
      </div>
      <input data-testid="auth-flow-dob"
        type="date"
        id="ps-dob"
        name="dob"
        value={psDob}
        onChange={(e) => setPsDob(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer z-20"
        required
        max={new Date().toISOString().split('T')[0]}
      />
    </div>
  </div>

  <div>
  <label htmlFor="ps-mobile" className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
  <input data-testid="auth-flow-mobile"
  type="tel"
  id="ps-mobile"
  name="mobile"
  defaultValue={userProfile?.mobile}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
  placeholder="e.g. 9876543210"
  required
  />
  </div>

 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="ps-jobType" className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
 <select data-testid="auth-flow-job-type"
 id="ps-jobType"
 name="jobType"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option data-testid="auth-flow-select" value="">Select...</option>
 <option data-testid="auth-flow-full-time" value="full-time">Full-time</option>
 <option data-testid="auth-flow-part-time" value="part-time">Part-time</option>
 <option data-testid="auth-flow-self-employed" value="self-employed">Self-employed</option>
 <option data-testid="auth-flow-freelance" value="freelance">Freelance</option>
 <option data-testid="auth-flow-student" value="student">Student</option>
 <option data-testid="auth-flow-retired" value="retired">Retired</option>
 </select>
 </div>
 <div>
 <label htmlFor="ps-jobIndustry" className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
 <select data-testid="auth-flow-job-industry"
 id="ps-jobIndustry"
 name="jobIndustry"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option data-testid="auth-flow-select-2" value="">Select...</option>
 <option data-testid="auth-flow-it-technology" value="it">IT / Technology</option>
 <option data-testid="auth-flow-finance" value="finance">Finance</option>
 <option data-testid="auth-flow-healthcare" value="healthcare">Healthcare</option>
 <option data-testid="auth-flow-education" value="education">Education</option>
 <option data-testid="auth-flow-retail" value="retail">Retail</option>
 <option data-testid="auth-flow-other" value="other">Other</option>
 </select>
 </div>
 </div>

 <div>
 <label htmlFor="ps-income" className="block text-sm font-medium text-gray-700 mb-1">Monthly Income (INR)</label>
 <input data-testid="auth-flow-50000"
 type="number"
 id="ps-income"
 name="income"
 placeholder="50000"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 />
 </div>

 <button data-testid="auth-flow-button"
 type="submit"
 disabled={isLoading}
 className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
 >
 {isLoading ? 'Saving...' : 'Continue'}
 </button>
 </form>
 </div>
 </div>
 );

 // Salary Setup Step
 const renderSalarySetup = () => (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
 <div className="p-6 border-b border-gray-200">
 <h2 className="text-xl font-semibold text-gray-800">Salary Account Setup</h2>
 <p className="text-sm text-gray-600 mt-1">Link your salary account for automatic tracking</p>
 </div>
 <form data-testid="auth-flow-form-2"
 className="p-6 space-y-4"
 onSubmit={(e) => {
 e.preventDefault();
 const formData = new FormData(e.target as HTMLFormElement);
 handleSalarySetupComplete({
 bankName: formData.get('bankName') as string,
 accountName: formData.get('accountName') as string,
 accountType: 'bank',
 openingBalance: formData.get('balance') as string,
 salaryCreditDate: formData.get('creditDate') as string,
 isPrimary: formData.get('isPrimary') === 'on',
 });
 }}
 >
 <div>
 <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
 <select data-testid="auth-flow-bank-name"
 id="bankName"
 name="bankName"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option data-testid="auth-flow-select-your-bank" value="">Select your bank</option>
 <option data-testid="auth-flow-state-bank-of-india" value="SBI">State Bank of India</option>
 <option data-testid="auth-flow-hdfc-bank" value="HDFC">HDFC Bank</option>
 <option data-testid="auth-flow-icici-bank" value="ICICI">ICICI Bank</option>
 <option data-testid="auth-flow-axis-bank" value="Axis">Axis Bank</option>
 <option data-testid="auth-flow-kotak-mahindra-bank" value="Kotak">Kotak Mahindra Bank</option>
 <option data-testid="auth-flow-punjab-national-bank" value="PNB">Punjab National Bank</option>
 <option data-testid="auth-flow-other-2" value="other">Other</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
 <input data-testid="auth-flow-as-per-bank-records"
 type="text"
 name="accountName"
 placeholder="As per bank records"
 defaultValue={`${userProfile?.firstName} ${userProfile?.lastName}`}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (INR)</label>
 <input data-testid="auth-flow-0"
 type="number"
 name="balance"
 placeholder="0"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 />
 <p className="text-xs text-gray-500 mt-1">Optional - current balance in this account</p>
 </div>

 <div>
 <label htmlFor="creditDate" className="block text-sm font-medium text-gray-700 mb-1">Salary Credit Date</label>
 <select data-testid="auth-flow-credit-date"
 id="creditDate"
 name="creditDate"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option data-testid="auth-flow-select-date" value="">Select date</option>
 {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
 <option data-testid={`auth-flow-of-every-month-${day}`} key={day} value={day}>
 {day}{day === 1 || day === 21 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'} of every month
 </option>
 ))}
 </select>
 </div>

 <div className="flex items-center gap-2">
 <input data-testid="auth-flow-is-primary"
 type="checkbox"
 name="isPrimary"
 id="isPrimary"
 defaultChecked
 className="w-4 h-4 text-blue-600 border-gray-300 rounded"
 />
 <label htmlFor="isPrimary" className="text-sm text-gray-700">
 Set as primary account
 </label>
 </div>

 <div className="bg-blue-50 rounded-lg p-4">
 <p className="text-sm text-blue-800">
 <strong>Note:</strong> Your account will be automatically set up after PIN creation.
 You can add more accounts later.
 </p>
 </div>

 <button data-testid="auth-flow-button-2"
 type="submit"
 disabled={isLoading}
 className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
 >
 {isLoading ? 'Setting up...' : 'Continue to PIN Setup'}
 </button>
 </form>
 </div>
 </div>
 );

 // Confirm-your-email Screen (shown when Supabase requires email confirmation)
 const renderEmailConfirm = () => (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
 <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
 <MailCheck size={32} />
 </div>
 <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm your email</h2>
 <p className="text-sm text-gray-600 leading-relaxed mb-1">
 We&apos;ve sent a confirmation link to
 </p>
 <p className="text-sm font-semibold text-gray-900 mb-4 break-all">{email}</p>
 <p className="text-sm text-gray-500 leading-relaxed mb-6">
 Click the link in that email to activate your account, then sign in. The link
 may take a minute to arrive — remember to check your spam folder.
 </p>

 <button data-testid="auth-flow-button-3"
 type="button"
 onClick={handleResendConfirmation}
 disabled={resendLoading}
 className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors mb-3"
 >
 {resendLoading ? 'Sending…' : 'Resend confirmation email'}
 </button>
 <button data-testid="auth-flow-back-to-sign-in"
 type="button"
 onClick={() => setStep('signin')}
 className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
 >
 Back to Sign In
 </button>
 </div>
 </div>
 );

 // Completion Screen
 const renderComplete = () => (
 <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
 <div className="text-center">
 <div className="inline-flex items-center justify-center w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full mb-6">
 <Shield className="w-12 h-12 text-white" />
 </div>
 <h1 className="text-3xl font-bold text-white mb-4">
 You're All Set!
 </h1>
 <p className="text-blue-100 mb-8 max-w-md">
 Your account has been set up successfully. Start tracking your finances now!
 </p>
 <button data-testid="auth-flow-go-to-dashboard"
 onClick={() => {
 localStorage.setItem('onboarding_completed', 'true');
 window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
 }}
 className="py-3 px-8 bg-white text-blue-600 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors"
 >
 Go to Dashboard
 </button>
 </div>
 </div>
 );

  const getPasswordRequirements = (password: string) => {
    return {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
  };

  const renderForgotPassword = () => {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!forgotEmailState) {
        setForgotErrorState('Email address is required');
        return;
      }
      setForgotLoadingState(true);
      setForgotErrorState('');
      try {
        const res = await api.auth.forgotPassword(forgotEmailState);
        if (res.success) {
          setEmail(forgotEmailState);
          toast.success('Verification code sent to your email.');
          localStorage.setItem('auth_flow_step_timestamp', Date.now().toString());
          localStorage.setItem('auth_flow_step', 'reset-otp-verify');
          localStorage.setItem('pending_auth_email', forgotEmailState);
          setResendCooldown(30);
          setOtpInputs(Array(6).fill(''));
          setStep('reset-otp-verify');
        } else {
          setForgotErrorState(res.message || 'Failed to send verification code.');
        }
      } catch (err: any) {
        setForgotErrorState(err.message || 'Failed to send verification code.');
      } finally {
        setForgotLoadingState(false);
      }
    };

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-gray-100 w-full max-w-md overflow-hidden relative z-10"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          
          <div className="p-6 sm:p-8 flex flex-col items-center border-b border-gray-100/50">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-sm border border-blue-100/50">
              <Fingerprint className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center">Forgot Your Password?</h2>
            <p className="text-gray-500 mt-2 text-sm font-medium text-center max-w-xs">
              Enter your registered email address. We'll send you a verification code.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
            {forgotErrorState && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600 text-center font-semibold">{forgotErrorState}</p>
              </div>
            )}
            
            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-gray-500">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  data-testid="forgot-password-email-input"
                  id="forgot-email"
                  type="email"
                  value={forgotEmailState}
                  onChange={(e) => {
                    setForgotEmailState(e.target.value);
                    if (forgotErrorState) setForgotErrorState('');
                  }}
                  placeholder="Enter your email"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all duration-200 h-12"
                />
              </div>
            </div>

            <button
              data-testid="forgot-password-submit-button"
              type="submit"
              disabled={forgotLoadingState}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10 h-12 text-sm"
            >
              {forgotLoadingState ? 'Sending...' : 'Send Verification Code'}
            </button>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                data-testid="forgot-password-back"
                onClick={() => setStep('signin')}
                className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1.5"
              >
                <span>←</span> Back to Login
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  const renderResetOtpVerify = () => {
    const handleOtpChange = (index: number, val: string) => {
      const sanitized = val.replace(/\D/g, '').slice(-1);
      const newOtp = [...otpInputs];
      newOtp[index] = sanitized;
      setOtpInputs(newOtp);

      if (sanitized && index < 5) {
        otpRefs.current[index + 1]?.focus();
      }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (!otpInputs[index] && index > 0) {
          const newOtp = [...otpInputs];
          newOtp[index - 1] = '';
          setOtpInputs(newOtp);
          otpRefs.current[index - 1]?.focus();
        } else {
          const newOtp = [...otpInputs];
          newOtp[index] = '';
          setOtpInputs(newOtp);
        }
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (text.length > 0) {
        const newOtp = [...otpInputs];
        for (let i = 0; i < 6; i++) {
          newOtp[i] = text[i] || '';
        }
        setOtpInputs(newOtp);
        const focusIndex = Math.min(text.length, 5);
        otpRefs.current[focusIndex]?.focus();
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const code = otpInputs.join('');
      if (code.length < 6) {
        setResetErrorState('Please enter all 6 digits of the verification code.');
        return;
      }

      setResetLoadingState(true);
      setResetErrorState('');
      try {
        const res = await api.auth.verifyResetCode(email, code);
        if (res.success) {
          toast.success('Verification code verified successfully.');
          setResetOtpState(code);
          localStorage.setItem('auth_flow_step', 'reset-password');
          setStep('reset-password');
        } else {
          setResetErrorState(res.message || 'Invalid or expired verification code.');
        }
      } catch (err: any) {
        setResetErrorState(err.message || 'Invalid or expired verification code.');
      } finally {
        setResetLoadingState(false);
      }
    };

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-gray-100 w-full max-w-md overflow-hidden relative z-10"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          
          <div className="p-6 sm:p-8 flex flex-col items-center border-b border-gray-100/50">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-sm border border-blue-100/50">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center">Verify Your Email</h2>
            <p className="text-gray-500 mt-2 text-sm font-medium text-center max-w-xs">
              Enter the 6-digit verification code sent to your email.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {resetErrorState && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600 text-center font-semibold">{resetErrorState}</p>
              </div>
            )}
            
            <div className="flex justify-between gap-2 max-w-sm mx-auto">
              {Array(6).fill(0).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={otpInputs[i]}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  data-testid={`reset-otp-input-${i}`}
                  className="w-12 h-12 sm:w-14 sm:h-14 text-center text-lg font-bold text-gray-900 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all duration-200"
                />
              ))}
            </div>

            <button
              data-testid="otp-verify-submit-button"
              type="submit"
              disabled={resetLoadingState}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10 h-12 text-sm"
            >
              {resetLoadingState ? 'Verifying...' : 'Verify Code'}
            </button>

            <div className="flex flex-col items-center space-y-3 pt-2 text-sm font-semibold text-gray-500">
              <div className="flex items-center gap-1.5 select-none">
                <span>Didn't receive the code?</span>
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={resendCooldown > 0 || isResending}
                  className="text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : isResending ? 'Sending...' : 'Resend Code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('auth_flow_step', 'forgot-password');
                  setStep('forgot-password');
                }}
                className="hover:text-gray-800 transition-colors"
              >
                ← Back
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  const renderResetPassword = () => {
    const requirements = getPasswordRequirements(resetPasswordState);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!Object.values(requirements).every(Boolean)) {
        setResetErrorState('Password does not meet all security requirements.');
        return;
      }
      if (resetPasswordState !== resetConfirmPasswordState) {
        setResetErrorState('Passwords do not match.');
        return;
      }

      setResetLoadingState(true);
      setResetErrorState('');
      try {
        const res = await api.auth.resetPassword({
          email,
          otp: resetOtpState,
          newPassword: resetPasswordState,
        });
        if (res.success) {
          setForgotEmailState('');
          setResetOtpState('');
          setResetPasswordState('');
          setResetConfirmPasswordState('');
          setOtpInputs(Array(6).fill(''));
          localStorage.removeItem('auth_flow_step_timestamp');
          localStorage.removeItem('auth_flow_step');
          localStorage.removeItem('pending_auth_email');
          setStep('reset-success');
        } else {
          setResetErrorState(res.message || 'Failed to reset password.');
        }
      } catch (err: any) {
        setResetErrorState(err.message || 'Failed to reset password.');
      } finally {
        setResetLoadingState(false);
      }
    };

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-gray-100 w-full max-w-md overflow-hidden relative z-10"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          
          <div className="p-6 sm:p-8 flex flex-col items-center border-b border-gray-100/50">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-sm border border-blue-100/50">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center">Create New Password</h2>
            <p className="text-gray-500 mt-2 text-sm font-medium text-center max-w-xs">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            {resetErrorState && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600 text-center font-semibold">{resetErrorState}</p>
              </div>
            )}
            
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-xs font-semibold text-gray-500">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  data-testid="reset-password-password-input"
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={resetPasswordState}
                  onChange={(e) => {
                    setResetPasswordState(e.target.value);
                    if (resetErrorState) setResetErrorState('');
                  }}
                  placeholder="Min 8 characters"
                  required
                  className="w-full pl-10 pr-10 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all duration-200 h-12"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-gray-500">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  data-testid="reset-password-confirm-input"
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={resetConfirmPasswordState}
                  onChange={(e) => {
                    setResetConfirmPasswordState(e.target.value);
                    if (resetErrorState) setResetErrorState('');
                  }}
                  placeholder="Confirm your password"
                  required
                  className="w-full pl-10 pr-10 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all duration-200 h-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Password Requirements</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${requirements.minLength ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={requirements.minLength ? 'text-green-600 font-semibold' : 'text-gray-500'}>Min 8 characters</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${requirements.hasUpper ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={requirements.hasUpper ? 'text-green-600 font-semibold' : 'text-gray-500'}>One uppercase</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${requirements.hasLower ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={requirements.hasLower ? 'text-green-600 font-semibold' : 'text-gray-500'}>One lowercase</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${requirements.hasDigit ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={requirements.hasDigit ? 'text-green-600 font-semibold' : 'text-gray-500'}>One number</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${requirements.hasSpecial ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={requirements.hasSpecial ? 'text-green-600 font-semibold' : 'text-gray-500'}>One special character</span>
                </div>
              </div>
            </div>

            <button
              data-testid="reset-password-submit-button"
              type="submit"
              disabled={resetLoadingState}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10 h-12 text-sm"
            >
              {resetLoadingState ? 'Resetting...' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                localStorage.setItem('auth_flow_step', 'forgot-password');
                setStep('forgot-password');
              }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center h-12 text-sm"
            >
              Cancel
            </button>
          </form>
        </motion.div>
      </div>
    );
  };

  const renderResetSuccess = () => {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-gray-100 w-full max-w-md overflow-hidden relative z-10"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          
          <div className="p-6 sm:p-8 flex flex-col items-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 text-green-500 mb-6 shadow-sm border border-green-105">
              <CheckCircle className="w-8 h-8" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center">Password Reset Successfully</h2>
            <p className="text-gray-500 mt-2 text-sm font-medium text-center max-w-xs leading-relaxed">
              Your password has been updated successfully. You can now log in using your new password.
            </p>

            <button
              data-testid="reset-success-back-to-login"
              type="button"
              onClick={() => {
                localStorage.removeItem('auth_flow_step');
                localStorage.removeItem('pending_auth_email');
                localStorage.removeItem('auth_flow_step_timestamp');
                setStep('signin');
              }}
              className="w-full mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center shadow-md shadow-blue-500/10 h-12 text-sm"
            >
              Back to Login
            </button>
          </div>
        </motion.div>
      </div>
    );
  };
// Main render
 switch (step) {
 case 'welcome':
 return renderWelcome();
 case 'forgot-password':
 return renderForgotPassword();
 case 'reset-otp-verify':
 return renderResetOtpVerify();
 case 'reset-password':
 return renderResetPassword();
 case 'reset-success':
 return renderResetSuccess();
 case 'signin':
 return (
 <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
 {/* Premium animated decorative blobs */}
 <div className="absolute inset-0 pointer-events-none overflow-hidden">
 <motion.div
 animate={{
 x: [0, 40, -20, 0],
 y: [0, -40, 20, 0],
 scale: [1, 1.1, 0.9, 1],
 }}
 transition={{
 duration: 20,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute -top-[15%] -left-[10%] w-[60vw] h-[60vw] md:w-[40vw] md:h-[40vw] bg-blue-200/30 rounded-full blur-[80px]"
 />
 <motion.div
 animate={{
 x: [0, -30, 40, 0],
 y: [0, 50, -30, 0],
 scale: [1, 0.9, 1.1, 1],
 }}
 transition={{
 duration: 25,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute top-[40%] -right-[10%] w-[50vw] h-[50vw] md:w-[35vw] md:h-[35vw] bg-indigo-200/25 rounded-full blur-[80px]"
 />
 <motion.div
 animate={{
 x: [0, 30, -30, 0],
 y: [0, 30, -40, 0],
 }}
 transition={{
 duration: 22,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute -bottom-[10%] left-[20%] w-[40vw] h-[40vw] bg-purple-200/20 rounded-full blur-[80px]"
 />
 </div>

 {onNavigate && onLogin && onGetStarted && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={() => { setStep('signin'); onLogin(); }}
 onGetStarted={() => { setStep('signup'); onGetStarted(); }}
 currentPage="signin"
 />
 )}

 <motion.div
 initial={{ opacity: 0, y: 20, scale: 0.98 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
 className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-white/60 w-full max-w-md overflow-hidden relative z-10"
 >
 <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
 <div className="p-6 sm:p-8 border-b border-gray-100/50">
 <button data-testid="auth-flow-back"
 onClick={() => setStep('welcome')}
 className="text-gray-500 hover:text-gray-800 transition-colors mb-5 flex items-center gap-1.5 text-sm font-semibold group animate-none"
 >
 <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back
 </button>
 <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome Back</h2>
 <p className="text-gray-500 mt-1.5 text-sm font-medium">Sign in to continue your financial journey.</p>
 </div>
 <div className="p-6 sm:p-8 pt-6">
 <SignInForm
 onSwitchToSignUp={() => setStep('signup')}
 onSubmit={handleSignIn}
 onForgotPassword={() => setStep('forgot-password')}
 />
 </div>
 </motion.div>
 </div>
 );
 case 'signup':
 return (
 <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24 select-none overflow-hidden">
 {/* Premium animated decorative blobs */}
 <div className="absolute inset-0 pointer-events-none overflow-hidden">
 <motion.div
 animate={{
 x: [0, 40, -20, 0],
 y: [0, -40, 20, 0],
 scale: [1, 1.1, 0.9, 1],
 }}
 transition={{
 duration: 20,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute -top-[15%] -left-[10%] w-[60vw] h-[60vw] md:w-[40vw] md:h-[40vw] bg-blue-200/30 rounded-full blur-[80px]"
 />
 <motion.div
 animate={{
 x: [0, -30, 40, 0],
 y: [0, 50, -30, 0],
 scale: [1, 0.9, 1.1, 1],
 }}
 transition={{
 duration: 25,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute top-[40%] -right-[10%] w-[50vw] h-[50vw] md:w-[35vw] md:h-[35vw] bg-indigo-200/25 rounded-full blur-[80px]"
 />
 <motion.div
 animate={{
 x: [0, 30, -30, 0],
 y: [0, 30, -40, 0],
 }}
 transition={{
 duration: 22,
 repeat: Infinity,
 ease: "easeInOut",
 }}
 className="absolute -bottom-[10%] left-[20%] w-[40vw] h-[40vw] bg-purple-200/20 rounded-full blur-[80px]"
 />
 </div>

 {onNavigate && onLogin && onGetStarted && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={() => { setStep('signin'); onLogin(); }}
 onGetStarted={() => { setStep('signup'); onGetStarted(); }}
 currentPage="signup"
 />
 )}

 <motion.div
 initial={{ opacity: 0, y: 20, scale: 0.98 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
 className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.06)] border border-white/60 w-full max-w-md overflow-hidden relative z-10"
 >
 <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
 <div className="p-6 sm:p-8 border-b border-gray-100/50">
 <button data-testid="auth-flow-back-2"
 onClick={() => setStep('welcome')}
 className="text-gray-500 hover:text-gray-800 transition-colors mb-5 flex items-center gap-1.5 text-sm font-semibold group animate-none"
 >
 <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back
 </button>
 <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create Account</h2>
 <p className="text-gray-500 mt-1.5 text-sm font-medium">Join KANAKU to start mastering your wealth.</p>
 </div>
 <div className="p-6 sm:p-8 pt-6">
 <SignUpForm
 onSwitchToSignIn={() => setStep('signin')}
 onSubmit={handleSignUp}
 onViewTerms={() => setStep('terms')}
 onViewPrivacy={() => setStep('privacy')}
 />
 </div>
 </motion.div>
 </div>
 );
 case 'privacy':
 return (
 <PrivacyPolicy
 onBack={() => setStep('signup')}
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 />
 );
 case 'terms':
 return (
 <Terms
 onBack={() => setStep('signup')}
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 />
 );
 case 'otp-verify':
 return (
 <OTPVerification
 email={email}
 isNewUser={isNewUser}
 mandatory={true}
 onVerified={handleOTPVerified}
 onBack={() => setStep('signup')}
 />
 );
 case 'email-confirm':
 return renderEmailConfirm();
 case 'profile-setup':
 return renderProfileSetup();
 case 'salary-setup':
 return renderSalarySetup();
 case 'pin-setup':
 return (
 <PINSetup
 onComplete={handlePINComplete}
 existingPinRequired={!isNewUser}
 />
 );
 case 'complete':
 return renderComplete();
 default:
 return renderWelcome();
 }
};


