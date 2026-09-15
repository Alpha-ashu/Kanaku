import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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

export const NewUserOnboarding: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitializing, setIsInitializing] = useState(true);
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

  const { user } = useAuth();

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

      // 3. Always check backend — it's the cross-device source of truth.
      // If the profile has dateOfBirth set, the user already completed onboarding
      // on another device. Restore minimum local state and skip the form entirely.
      try {
        const profileRes = await api.auth.getProfile();
        if (profileRes.success && profileRes.data) {
          const p = profileRes.data;
          if (!metaName) {
            metaName = p.fullName || p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
          }
          if (p.dateOfBirth && (p.firstName || p.name || p.fullName)) {
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('user_profile', JSON.stringify({
              displayName: metaName || p.firstName || '',
              firstName: p.firstName || '',
              lastName: p.lastName || '',
              avatarUrl: p.avatarUrl || '',
              avatarId: p.avatarId || '',
              mobile: metaMobile || p.phone || '',
            }));
            if (p.currency) localStorage.setItem('currency', p.currency);
            window.dispatchEvent(new CustomEvent('ONBOARDING_COMPLETED'));
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch profile during onboarding init:', e);
      }

      if (metaName || metaMobile) {
        setOnboardingData(prev => ({
          ...prev,
          displayName: metaName,
          accountHolderName: metaName,
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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <ProfileSetupStep
            data={onboardingData}
            onUpdate={updateOnboardingData}
            onNext={nextStep}
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
              // Handled reactively via ONBOARDING_COMPLETED event in App.tsx
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
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden flex flex-col items-center justify-center p-4 py-8 sm:py-12 selection:bg-violet-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-[35%] right-[15%] w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[110px] pointer-events-none" />

      {/* Grid texture overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] pointer-events-none" />

      {/* Top Brand Bar */}
      <div className="relative z-10 mb-6 sm:mb-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-3 mb-2">
          <KanakuWordmark
            logoClassName="w-8 h-8 sm:w-9 sm:h-9 drop-shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
            textClassName="text-2xl sm:text-[26px]"
            isDark={true}
          />
          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25 shadow-sm backdrop-blur-sm">
            Setup Wizard
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 font-normal">
          Initialize your local-first private finance environment
        </p>
      </div>

      {/* Main card */}
      <div className={`relative z-10 bg-white text-slate-900 rounded-3xl shadow-2xl shadow-violet-950/40 border border-slate-200/90 w-full transition-all duration-300 overflow-hidden ${
        currentStep === 1 ? 'max-w-[480px] md:max-w-4xl' : 'max-w-[520px]'
      }`}>
        {/* Progress Indicator */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Onboarding</span>
              <span className="text-xs text-slate-300">•</span>
              <span className="text-xs font-bold text-violet-700 bg-violet-100/70 px-2.5 py-0.5 rounded-full border border-violet-200/60">
                Step {currentStep} of 4: {stepNames[currentStep - 1]}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">
              {Math.round((currentStep / 4) * 100)}%
            </span>
          </div>

          <div className="flex space-x-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  step < currentStep
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                    : step === currentStep
                    ? 'bg-violet-600 shadow-sm shadow-violet-500/40'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {isInitializing ? (
            <div className="flex flex-col items-center justify-center p-10 space-y-3">
              <div className="animate-spin rounded-full h-9 w-9 border-3 border-violet-600 border-t-transparent"></div>
              <p className="text-xs text-slate-400 font-medium">Preparing your setup environment...</p>
            </div>
          ) : (
            renderStep()
          )}
        </div>
      </div>

      {/* Trust reassurance below the card */}
      <div className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Offline-First</span>
        </span>
        <span className="text-slate-600">•</span>
        <span>No Ads</span>
        <span className="text-slate-600">•</span>
        <span>Cross-Device Cloud Sync</span>
      </div>
    </div>
  );
};
