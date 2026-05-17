import React, { useState } from 'react';
import { OnboardingStep1 } from './OnboardingStep1';
import { OnboardingStep2 } from './OnboardingStep2';
import { OnboardingStep3 } from './OnboardingStep3';
import { OnboardingStep4 } from './OnboardingStep4';

interface OnboardingData {
 email: string;
 password: string;
 confirmPassword: string;
 firstName: string;
 lastName: string;
 salary: string;
 dateOfBirth: string;
 jobType: string;
 pin: string;
 confirmPin: string;
}

export const UserOnboarding: React.FC = () => {
 const [currentStep, setCurrentStep] = useState(1);
 const [onboardingData, setOnboardingData] = useState<OnboardingData>({
 email: '',
 password: '',
 confirmPassword: '',
 firstName: '',
 lastName: '',
 salary: '',
 dateOfBirth: '',
 jobType: '',
 pin: '',
 confirmPin: '',
 });

 const updateOnboardingData = (data: Partial<OnboardingData>) => {
 setOnboardingData(prev => ({ ...prev, ...data }));
 };

 const nextStep = () => {
 setCurrentStep(prev => Math.min(prev + 1, 4));
 };

 const prevStep = () => {
 setCurrentStep(prev => Math.max(prev - 1, 1));
 };

 const renderStep = () => {
 switch (currentStep) {
 case 1:
 return (
 <OnboardingStep1
 data={onboardingData}
 onUpdate={updateOnboardingData}
 onNext={nextStep}
 />
 );
 case 2:
 return (
 <OnboardingStep2
 data={onboardingData}
 onUpdate={updateOnboardingData}
 onNext={nextStep}
 onBack={prevStep}
 />
 );
 case 3:
 return (
 <OnboardingStep3
 data={onboardingData}
 onUpdate={updateOnboardingData}
 onNext={nextStep}
 onBack={prevStep}
 />
 );
 case 4:
 return (
 <OnboardingStep4
 data={onboardingData}
 onComplete={() => {
 // Handle onboarding completion
 console.log('Onboarding completed:', onboardingData);
 // Reload the page to trigger the app to show the main interface
 window.location.reload();
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
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
 {/* Progress Indicator */}
 <div className="p-6 border-b border-gray-200">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-xl font-semibold text-gray-800">Create Account</h2>
 <span className="text-sm text-gray-500">Step {currentStep} of 4</span>
 </div>
 <div className="flex space-x-2">
 {[1, 2, 3, 4].map((step) => (
 <div
 key={step}
 className={`flex-1 h-2 rounded-full transition-colors ${
 step <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
 }`}
 />
 ))}
 </div>
 </div>

 {/* Step Content */}
 <div className="p-6">
 {renderStep()}
 </div>
 </div>
 </div>
 );
};
