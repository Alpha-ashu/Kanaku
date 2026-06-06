import React, { useState } from 'react';
import { ProfileSetupStep } from './ProfileSetupStep';
import { BankAccountStep } from './BankAccountStep';
import { CountryLanguageStep } from './CountryLanguageStep';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';
import supabase from '@/utils/supabase/client';

interface OnboardingData {
 displayName: string;
 dateOfBirth: string;
 gender: string;
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

 React.useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (user) {
        const metaName = user.user_metadata?.first_name
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
          : user.user_metadata?.full_name || '';
        if (metaName) {
          setOnboardingData(prev => ({ ...prev, displayName: metaName, accountHolderName: metaName }));
        }
      }
      setIsInitializing(false);
    });
  }, []);

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
 />
 );
 default:
 return null;
 }
 };

 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div className={`bg-white rounded-2xl shadow-xl w-full transition-all duration-300 mx-auto ${
      currentStep === 1 ? 'max-w-[480px] md:max-w-4xl' : 'max-w-[480px]'
    }`}>
 {/* Progress Indicator */}
 <div className="p-6 border-b border-gray-200">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-xl font-semibold text-gray-800">Complete Your Profile</h2>
 <span className="text-sm text-gray-500">Step {currentStep} of 4</span>
 </div>
 <div className="flex space-x-2">
 {[1, 2, 3, 4].map((step) => (
 <div
 key={step}
 className={`flex-1 h-2 rounded-full transition-all duration-300 ${
 step < currentStep
 ? 'bg-blue-600'
 : step === currentStep
 ? 'bg-blue-500'
 : 'bg-gray-200'
 }`}
 />
 ))}
 </div>
 </div>

 <div className="p-6">
 {isInitializing ? (
 <div className="flex justify-center p-8">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
 </div>
 ) : (
 renderStep()
 )}
 </div>
 </div>
 </div>
 );
};
