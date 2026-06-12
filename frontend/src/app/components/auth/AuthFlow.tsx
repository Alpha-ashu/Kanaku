import React, { useState, useEffect } from 'react';
import { Shield, TrendingUp, Sparkles, ArrowRight, AlertTriangle, Calendar } from 'lucide-react';
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
 | 'otp-verify'
 | 'profile-setup'
 | 'salary-setup'
 | 'pin-setup'
 | 'complete'
 | 'privacy'
 | 'terms';

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

 if (pendingEmail && flowStep) {
 setEmail(pendingEmail);
 setStep(flowStep as AuthStep);
 }
 };
 checkFlowState();
 }, []);

 const saveFlowState = (currentStep: AuthStep) => {
 localStorage.setItem('auth_flow_step', currentStep);
 if (email) {
 localStorage.setItem('pending_auth_email', email);
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
      const refreshToken = resData.refreshToken;

      if (accessToken && refreshToken) {
        TokenManager.setTokens(accessToken, refreshToken);
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
      const refreshToken = resData.refreshToken;

      if (accessToken && refreshToken) {
        TokenManager.setTokens(accessToken, refreshToken);
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
      window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
      toast.success("Account created! Let's set up your profile.");
    } catch (error: any) {
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
      } else if (isDuplicateUser) {
        errMsg = 'This email is already registered. Sign in instead or use a different email.';
      } else if (isDuplicatePhone) {
        errMsg = 'This phone number is already registered to another account. Please use a different phone number.';
      } else if (isServerError) {
        errMsg = 'Signup is temporarily unavailable (server error). Please try again in a moment.';
      }

      toast.error(errMsg);
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
 } catch (profileError) {
 internalLog.warn('handleSalarySetupComplete/profileSync', profileError);
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
 <motion.button
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 onClick={() => setStep('signup')}
 className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-2xl py-4 text-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
 >
 Create Account
 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
 </motion.button>

 <motion.button
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 onClick={() => setStep('signin')}
 className="w-full bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-2xl py-4 font-semibold text-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2"
 >
 Sign In
 </motion.button>

 {/* Continue as Guest */}
 <motion.button
 whileHover={{ scale: 1.01 }}
 whileTap={{ scale: 0.99 }}
 onClick={handleGuestMode}
 className="w-full text-gray-400 hover:text-gray-600 py-3 text-sm font-medium transition-colors"
 >
 Continue as Guest
 </motion.button>

 {onBack && (
 <button
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
 <button
 type="button"
 onClick={() => setShowGuestCaution(false)}
 className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors text-sm"
 >
 Cancel
 </button>
 <button
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
 <form
 className="p-6 space-y-4"
 onSubmit={(e) => {
 e.preventDefault();
 const formData = new FormData(e.target as HTMLFormElement);
 handleProfileComplete({
 // Read firstName/lastName from the actual form inputs (not stale state)
 firstName: (formData.get('firstName') as string) || userProfile?.firstName || '',
 lastName: (formData.get('lastName') as string) || userProfile?.lastName || '',
 email: email,
 mobile: userProfile?.mobile || '',
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
 <input
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
 <input
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
    <div 
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
      <input
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

 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="ps-jobType" className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
 <select
 id="ps-jobType"
 name="jobType"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value="">Select...</option>
 <option value="full-time">Full-time</option>
 <option value="part-time">Part-time</option>
 <option value="self-employed">Self-employed</option>
 <option value="freelance">Freelance</option>
 <option value="student">Student</option>
 <option value="retired">Retired</option>
 </select>
 </div>
 <div>
 <label htmlFor="ps-jobIndustry" className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
 <select
 id="ps-jobIndustry"
 name="jobIndustry"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value="">Select...</option>
 <option value="it">IT / Technology</option>
 <option value="finance">Finance</option>
 <option value="healthcare">Healthcare</option>
 <option value="education">Education</option>
 <option value="retail">Retail</option>
 <option value="other">Other</option>
 </select>
 </div>
 </div>

 <div>
 <label htmlFor="ps-income" className="block text-sm font-medium text-gray-700 mb-1">Monthly Income (INR)</label>
 <input
 type="number"
 id="ps-income"
 name="income"
 placeholder="50000"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 />
 </div>

 <button
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
 <form
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
 <select
 id="bankName"
 name="bankName"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value="">Select your bank</option>
 <option value="SBI">State Bank of India</option>
 <option value="HDFC">HDFC Bank</option>
 <option value="ICICI">ICICI Bank</option>
 <option value="Axis">Axis Bank</option>
 <option value="Kotak">Kotak Mahindra Bank</option>
 <option value="PNB">Punjab National Bank</option>
 <option value="other">Other</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
 <input
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
 <input
 type="number"
 name="balance"
 placeholder="0"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 />
 <p className="text-xs text-gray-500 mt-1">Optional - current balance in this account</p>
 </div>

 <div>
 <label htmlFor="creditDate" className="block text-sm font-medium text-gray-700 mb-1">Salary Credit Date</label>
 <select
 id="creditDate"
 name="creditDate"
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
 required
 >
 <option value="">Select date</option>
 {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
 <option key={day} value={day}>
 {day}{day === 1 || day === 21 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'} of every month
 </option>
 ))}
 </select>
 </div>

 <div className="flex items-center gap-2">
 <input
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

 <button
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
 <button
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

 // Main render
 switch (step) {
 case 'welcome':
 return renderWelcome();
 case 'signin':
 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24">
 {onNavigate && onLogin && onGetStarted && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={() => { setStep('signin'); onLogin(); }}
 onGetStarted={() => { setStep('signup'); onGetStarted(); }}
 currentPage="signin"
 />
 )}
 <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden relative z-10">
 <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-indigo-600" />
 <div className="p-6 sm:p-8 border-b border-gray-100">
 <button
 onClick={() => setStep('welcome')}
 className="text-gray-500 hover:text-gray-700 transition-colors mb-5 flex items-center gap-1.5 text-sm font-medium group"
 >
 <span className="group-hover:-translate-x-0.5 transition-transform"></span> Back
 </button>
 <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
 <p className="text-gray-500 mt-1 text-sm">Sign in to continue your financial journey.</p>
 </div>
 <div className="p-6 sm:p-8 pt-6">
 <SignInForm
 onSwitchToSignUp={() => setStep('signup')}
 onSubmit={handleSignIn}
 />
 </div>
 </div>
 </div>
 );
 case 'signup':
 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/50 flex items-center justify-center p-4 pt-24">
 {onNavigate && onLogin && onGetStarted && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={() => { setStep('signin'); onLogin(); }}
 onGetStarted={() => { setStep('signup'); onGetStarted(); }}
 currentPage="signup"
 />
 )}
 <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden relative z-10">
 <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-indigo-600" />
 <div className="p-6 sm:p-8 border-b border-gray-100">
 <button
 onClick={() => setStep('welcome')}
 className="text-gray-500 hover:text-gray-700 transition-colors mb-5 flex items-center gap-1.5 text-sm font-medium group"
 >
 <span className="group-hover:-translate-x-0.5 transition-transform"></span> Back
 </button>
 <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
 <p className="text-gray-500 mt-1 text-sm">Join KANAKU to start mastering your wealth.</p>
 </div>
 <div className="p-6 sm:p-8 pt-6">
 <SignUpForm
 onSwitchToSignIn={() => setStep('signin')}
 onSubmit={handleSignUp}
 onViewTerms={() => setStep('terms')}
 onViewPrivacy={() => setStep('privacy')}
 />
 </div>
 </div>
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


