import React, { useState } from 'react';
import { ShieldCheck, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ProfileSetupStep } from './ProfileSetupStep';
import { BankAccountStep } from './BankAccountStep';
import { CountryLanguageStep } from './CountryLanguageStep';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { KanakuWordmark } from '@/app/components/ui/KANAKULogo';

interface OnboardingData {
  displayName: string;
  dateOfBirth: string;
  gender: string;
  mobile: string;
  jobType: string;
  salary: string;
  bankName: string;
  accountHolderName: string;
  currentBalance: string;
  country: string;
  state: string;
  city: string;
  language: string;
  avatarUrl: string;
  avatarId?: string;
}

interface NewUserOnboardingProps {
  onComplete?: () => void;
}

export const NewUserOnboarding: React.FC<NewUserOnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    displayName: '',
    dateOfBirth: '',
    gender: '',
    mobile: '',
    jobType: '',
    salary: '',
    bankName: '',
    accountHolderName: '',
    currentBalance: '',
    country: 'India', // default country
    state: '',
    city: '',
    language: 'English', // default language
    avatarUrl: '',
    avatarId: '',
  });

  const { user, signOut } = useAuth();

  React.useEffect(() => {
    const initProfile = async () => {
      let metaName = '';
      let metaMobile = '';

      // 1. Try local profile cache first
      try {
        const localProfileStr = localStorage.getItem('user_profile');
        if (localProfileStr) {
          const localProfile = JSON.parse(localProfileStr);
          metaName = localProfile.displayName || localProfile.fullName || 
            `${localProfile.firstName || ''} ${localProfile.lastName || ''}`.trim();
          metaMobile = localProfile.mobile || '';
        }
      } catch (e) {
        console.warn('Failed to parse local profile:', e);
      }

      // 2. Try useAuth context user metadata
      if (!metaName && user) {
        metaName = user.user_metadata?.full_name || 
          user.user_metadata?.displayName ||
          (user.user_metadata?.first_name 
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
            : `${user.user_metadata?.firstName || ''} ${user.user_metadata?.lastName || ''}`.trim());
      }

      // 2.5 Fallback to stored user_name / user_first_name
      if (!metaName) {
        metaName = (localStorage.getItem('user_name') || localStorage.getItem('user_first_name') || '').trim();
      }
      if (!metaMobile) {
        metaMobile = (localStorage.getItem('user_mobile') || '').trim();
      }

      // 3. Always check backend — it's the cross-device source of truth.
      // Pre-fill existing profile data into onboarding fields if available
      try {
        const profileRes = await api.auth.getProfile({ suppressSessionExpiry: true });
        if (profileRes.success && profileRes.data) {
          const p = profileRes.data;
          if (!metaName) {
            metaName = p.fullName || p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
          }
          if (p.phone && !metaMobile) {
            metaMobile = p.phone;
          }
          setOnboardingData(prev => ({
            ...prev,
            displayName: metaName || prev.displayName,
            accountHolderName: metaName || prev.accountHolderName,
            dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : prev.dateOfBirth,
            gender: p.gender || prev.gender,
            mobile: metaMobile || prev.mobile,
            jobType: p.jobType || prev.jobType,
            salary: p.annualIncome ? String(p.annualIncome) : (p.monthlyIncome ? String(p.monthlyIncome * 12) : prev.salary),
            city: p.city || prev.city,
            state: p.state || prev.state,
            country: p.country || prev.country || 'India',
            language: p.language || prev.language || 'English',
            avatarUrl: p.avatarUrl || prev.avatarUrl,
            avatarId: p.avatarId || prev.avatarId,
          }));
        }
      } catch (e) {
        console.warn('Failed to fetch profile during onboarding init:', e);
      }

      if (metaName || metaMobile) {
        setOnboardingData(prev => ({
          ...prev,
          displayName: metaName || prev.displayName,
          accountHolderName: metaName || prev.accountHolderName,
          mobile: metaMobile || prev.mobile
        }));
      }
      setIsInitializing(false);
    };

    initProfile();
  }, [user]);

  const updateOnboardingData = (data: Partial<OnboardingData>) => {
    setOnboardingData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  // Skip: jump directly to the completion step
  const skipToComplete = () => setCurrentStep(4);

  // Permanently delete user from database and cancel registration
  const handleDiscardAccount = async () => {
    setIsDiscarding(true);
    try {
      // 1. Delete user and profile record from backend database (Prisma & Supabase)
      await api.auth.deleteAccount();
    } catch (err) {
      console.warn('Backend account deletion during discard:', err);
    } finally {
      // 2. Clear all local application state and tokens
      const localKeys = [
        'auth_token', 'accessToken', 'refresh_token', 'refreshToken', 'token', 'authToken',
        'user_profile', 'profile_updated_at', 'profile_sync_pending',
        'pin_hash', 'pin_salt', 'pin_created_at', 'pin_expiry',
        'currency', 'app_settings', 'kanaku_onboarding_completed', 'kanaku_active_route',
        'auth_flow_step', 'pending_auth_email', 'auth_flow_step_timestamp',
        'is_new_user', 'onboarding_completed', 'user_first_name', 'user_name', 'user_email',
        'profile_verification_unverified'
      ];
      localKeys.forEach(k => localStorage.removeItem(k));

      // 3. Clear auth context session
      try {
        await signOut();
      } catch {
        // ignore
      }

      window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
      toast.success('Registration cancelled. Account removed from database.');
      setIsDiscarding(false);
      setShowDiscardModal(false);

      // 4. Return cleanly to the landing page
      if (window.location.pathname && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/');
      }
      window.location.hash = '#/landing';
      window.dispatchEvent(new Event('hashchange'));
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <ProfileSetupStep
            data={onboardingData}
            onUpdate={updateOnboardingData}
            onNext={nextStep}
            onDiscard={() => setShowDiscardModal(true)}
          />
        );
      case 2:
        return (
          <CountryLanguageStep
            data={onboardingData}
            onUpdate={updateOnboardingData}
            onNext={nextStep}
            onBack={prevStep}
            onSkip={skipToComplete}
          />
        );
      case 3:
        return (
          <BankAccountStep
            data={onboardingData}
            onUpdate={updateOnboardingData}
            onNext={nextStep}
            onBack={prevStep}
            onSkip={skipToComplete}
          />
        );
      case 4:
        return (
          <OnboardingCompleteStep
            data={onboardingData}
            onComplete={() => {
              onComplete?.();
            }}
            onBack={prevStep}
            onGoToStep={(step) => setCurrentStep(step)}
          />
        );
      default:
        return null;
    }
  };

  const stepNames = ['Personal Details', 'Region & Language', 'Primary Account', 'Launch'];

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-slate-900 relative flex flex-col items-center justify-center p-4 py-6 sm:py-10 selection:bg-violet-100 selection:text-violet-900">
      {/* Top Brand Bar */}
      <div className="relative z-10 mb-5 sm:mb-6 text-center flex flex-col items-center">
        <KanakuWordmark
          logoClassName="w-8 h-8 sm:w-9 sm:h-9"
          textClassName="text-2xl font-bold tracking-tight text-slate-900"
          isDark={false}
        />
      </div>

      {/* Main card */}
      <div className={`relative z-10 bg-white text-slate-900 rounded-2xl sm:rounded-3xl shadow-[0_10px_35px_-10px_rgba(15,23,42,0.08)] border border-slate-200/80 w-full transition-all duration-300 ${
        currentStep === 1 ? 'max-w-2xl lg:max-w-3xl' : 'max-w-xl md:max-w-2xl'
      }`}>
        {/* Progress Indicator */}
        <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-slate-100 bg-slate-50/60 rounded-t-2xl sm:rounded-t-3xl">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-400">Onboarding</span>
              <span className="text-xs text-slate-300">•</span>
              <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-200/60">
                Step {currentStep} of 4: {stepNames[currentStep - 1]}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs font-mono font-bold text-slate-500">
                {Math.round((currentStep / 4) * 100)}%
              </span>
            </div>
          </div>

          <div className="flex space-x-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  step < currentStep
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                    : step === currentStep
                    ? 'bg-violet-600 shadow-sm shadow-violet-500/30'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-7 md:p-8">
          {isInitializing ? (
            <div className="flex flex-col items-center justify-center p-10 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-600 border-t-transparent"></div>
              <p className="text-xs text-slate-400 font-medium">Preparing your setup environment...</p>
            </div>
          ) : (
            renderStep()
          )}
        </div>
      </div>

      {/* Trust reassurance below the card */}
      <div className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-600" />
          <span>Offline-First</span>
        </span>
        <span className="text-slate-300">•</span>
        <span>No Ads</span>
        <span className="text-slate-300">•</span>
        <span>Cross-Device Cloud Sync</span>
      </div>

      {/* Discard / Cancel Registration Modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative p-6 sm:p-7 text-center"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <AlertTriangle className="w-7 h-7 text-rose-600" />
            </div>

            <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-2">
              Discard Setup & Cancel Registration?
            </h3>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
              This will permanently cancel your registration, completely wipe your account and user profile from the database, and return you to the home page. This action cannot be undone.
            </p>

            <div className="space-y-2.5">
              <button
                data-testid="confirm-discard-delete-button"
                type="button"
                disabled={isDiscarding}
                onClick={handleDiscardAccount}
                className="w-full py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold rounded-2xl shadow-md shadow-rose-500/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {isDiscarding ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting account from database...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Discard & Delete Account</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDiscarding}
                onClick={() => setShowDiscardModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition-colors text-xs border border-slate-200 cursor-pointer disabled:opacity-50"
              >
                Nevermind, Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
