import React, { useState } from 'react';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import { saveAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { api, apiClient } from '@/lib/api';
import {
 buildOnboardingUserSettings,
 toSettingsPayload,
} from '@/lib/userPreferences';

interface OnboardingCompleteStepProps {
 data: {
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
 avatarUrl?: string;
 avatarId?: string;
 };
 onComplete: () => void;
 onBack: () => void;
}

export const OnboardingCompleteStep: React.FC<OnboardingCompleteStepProps> = ({
 data,
 onComplete,
 onBack,
}) => {
 const [isProcessing, setIsProcessing] = useState(false);
 const [progress, setProgress] = useState(0);
 const [error, setError] = useState<string | null>(null);

 const getProgressWidthClass = (value: number) => {
 const progressValue = Math.max(0, Math.min(100, value));
 const bucket = Math.round(progressValue / 10) * 10;

 switch (bucket) {
 case 0: return 'w-0';
 case 10: return 'w-[10%]';
 case 20: return 'w-[20%]';
 case 30: return 'w-[30%]';
 case 40: return 'w-[40%]';
 case 50: return 'w-1/2';
 case 60: return 'w-[60%]';
 case 70: return 'w-[70%]';
 case 80: return 'w-[80%]';
 case 90: return 'w-[90%]';
 default: return 'w-full';
 }
 };

 // Only start processing when user clicks 'Complete Setup'
 const startProcessing = async () => {
 setIsProcessing(true);
 setError(null);

 // PERSIST TO LOCALSTORAGE FIRST (synchronous, before any await) 
 // This guarantees profile data is saved even if Supabase calls fail with
 // AbortError, CORS issues, or network timeouts. Supabase is purely a cloud
 // backup - the source of truth for this session is localStorage.
 const nowIso = new Date().toISOString();
 const nameParts = data.displayName.trim().split(/\s+/).filter(Boolean);
 const firstName = nameParts[0] || '';
 const lastName = nameParts.slice(1).join(' ') || '';
 const monthlyBudget = Math.round(parseFloat(data.salary) / 12) || 0;

 const resolvedAvatar = resolveAvatarSelection({
 avatarId: data.avatarId,
 avatarUrl: data.avatarUrl,
 });
 const userSettings = buildOnboardingUserSettings({
 country: data.country,
 language: data.language,
 monthlyBudget,
 });

 const userProfile = {
 displayName: data.displayName,
 firstName,
 lastName,
 gender: data.gender,
 dateOfBirth: data.dateOfBirth,
 jobType: data.jobType,
 salary: data.salary,
 monthlyIncome: monthlyBudget,
 country: data.country,
 state: data.state,
 city: data.city,
 language: data.language,
 profilePhoto: resolvedAvatar.url,
 avatarUrl: resolvedAvatar.url,
 avatarId: resolvedAvatar.id,
 createdAt: nowIso,
 updatedAt: nowIso,
 };
 localStorage.setItem('user_profile', JSON.stringify(userProfile));
 localStorage.setItem('profile_updated_at', nowIso);
 localStorage.setItem('profile_sync_pending', 'true');
 localStorage.setItem('user_settings', JSON.stringify(userSettings));
 localStorage.setItem('currency', userSettings.currency || userSettings.defaultCurrency || 'INR');
 localStorage.setItem('language', userSettings.language || 'en');
 localStorage.setItem('onboarding_completed', 'true');
 localStorage.setItem('user_setup_date', new Date().toISOString());
 localStorage.setItem('pin_setup_required', 'true'); // Flag to trigger PIN setup
 // Persist to Supabase user_metadata so it survives across devices/cache clears.
 // Awaited here with silent failure — localStorage is the local-first fallback.
 await supabase.auth.updateUser({ data: { onboarding_completed: true } }).catch(() => {});
 window.dispatchEvent(new CustomEvent('APP_SETTINGS_UPDATED', {
 detail: userSettings,
 }));


 try {
  // Step 1: Save profile through backend API only
  setProgress(15);
  try {
  await api.auth.updateProfile({
  firstName,
  lastName,
  gender: data.gender,
  country: data.country,
  state: data.state,
  city: data.city,
  monthlyIncome: monthlyBudget,
  dateOfBirth: data.dateOfBirth,
  jobType: data.jobType,
  avatarId: resolvedAvatar.id,
  avatarUrl: resolvedAvatar.url
  });
  } catch (apiErr) {
  console.warn('Backend API sync failed:', apiErr);
  }

  try {
  await apiClient.put('/settings', {
  currency: userSettings.currency,
  language: userSettings.language,
  timezone: userSettings.timezone,
  settings: toSettingsPayload(userSettings),
  }, {
  showErrorToast: false,
  });
  } catch (settingsErr) {
  console.warn('Backend settings sync failed:', settingsErr);
  }

  localStorage.removeItem('profile_sync_pending');

  // Step 2: Create initial account in local DB (backend sync is best-effort)
 setProgress(35);
 const accountData = {
 name: data.bankName
 ? `${data.bankName}${data.accountHolderName ? ' - ' + data.accountHolderName : ''}`
 : 'Primary Account',
 type: 'bank' as const,
 balance: parseFloat(data.currentBalance) || 0,
 currency: userSettings.currency || userSettings.defaultCurrency || 'INR',
 provider: data.bankName || '',
 country: data.country,
 isActive: true,
 createdAt: new Date(),
 };

 let accountId: number | undefined;
 try {
 const { db: localDb } = await import('@/lib/database');
 const existingAccounts = await localDb.accounts.filter((a: any) => !a.deletedAt).toArray();
 if (existingAccounts.length > 0) {
 accountId = existingAccounts[0].id;
 } else if (data.bankName) {
 // Try full backend sync first; on 500, fall back to local-only
 try {
 const savedAccount = await saveAccountWithBackendSync(accountData);
 accountId = savedAccount.id;
 } catch (syncErr) {
 // Backend unavailable - save to local Dexie only
 accountId = await localDb.accounts.add(accountData as any);
 }
 }
 } catch (dbErr) {
 // Non-blocking - continue even if account creation fails
 }

 setProgress(55);
 setProgress(75);
 setProgress(90);

 window.dispatchEvent(new CustomEvent('ONBOARDING_COMPLETED', {
 detail: {
 profile: userProfile,
 account: accountId ? { ...accountData, id: accountId } : null,
 },
 }));

 localStorage.setItem('onboarding_refresh_timestamp', Date.now().toString());
 setProgress(100);
 await new Promise(resolve => setTimeout(resolve, 500));
 toast.success('Account setup complete!');
 onComplete();
 } catch (err) {
 // Last-resort: if anything truly fatal happens, still mark onboarding done
 // and proceed so the user is never stuck on this screen.
 localStorage.setItem('onboarding_completed', 'true');
 toast.success('Setup complete! Some data will sync when you reconnect.');
 onComplete();
 }
 };

 const retrySetup = () => {
 setProgress(0);
 startProcessing();
 };

 if (error) {
 return (
 <div className="text-center space-y-4">
 <div className="bg-red-50 border border-red-200 rounded-lg p-4">
 <div className="text-red-600 mb-2">
 <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 </div>
 <h3 className="text-lg font-medium text-red-800 mb-2">
 Setup Failed
 </h3>
 <p className="text-red-700 text-sm">{error}</p>
 </div>

 <div className="flex space-x-3">
 <button data-testid="onboarding-complete-step-back"
 onClick={onBack}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
 >
 Back
 </button>
 <button data-testid="onboarding-complete-step-try-again"
 onClick={retrySetup}
 className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
 >
 Try Again
 </button>
 </div>
 </div>
 );
 }

 return (
 <div className="text-center space-y-6">
 <div>
 <h3 className="text-lg font-medium text-gray-900 mb-2">
 Setting Up Your Account
 </h3>
 <p className="text-sm text-gray-600">
 We're configuring your profile and setting up your accounts. This will only take a moment.
 </p>
 </div>

 {/* Progress Indicator */}
 <div className="space-y-3">
 <div className="flex justify-between text-sm text-gray-600">
 <span>
 {progress < 15 && 'Initializing...'}
 {progress >= 15 && progress < 35 && 'Saving your profile...'}
 {progress >= 35 && progress < 55 && 'Creating bank account...'}
 {progress >= 55 && progress < 75 && 'Setting up salary tracking...'}
 {progress >= 75 && progress < 90 && 'Finalizing setup...'}
 {progress >= 90 && progress < 100 && 'Completing...'}
 {progress === 100 && 'Setup complete!'}
 </span>
 <span>{progress}%</span>
 </div>

 <div className="w-full bg-gray-200 rounded-full h-2">
 <div
 className={`bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out ${getProgressWidthClass(progress)}`}
 />
 </div>
 </div>

 {/* Summary of what's being set up */}
 <div className="bg-white rounded-lg p-4 text-left">
 <h4 className="text-sm font-medium text-gray-700 mb-2">Setting up:</h4>
 <ul className="text-xs text-gray-600 space-y-1">
 <li> Profile: {data.displayName}</li>
 <li> Location: {data.country} ({data.language})</li>
 <li> Job: {data.jobType}</li>
 <li> Salary: {data.salary && !isNaN(parseFloat(data.salary)) ? `INR${parseFloat(data.salary).toLocaleString()}/year` : 'Not provided'}</li>
 <li> Bank: {data.bankName ? `${data.bankName} account` : 'No bank selected'}</li>
 {data.currentBalance && (
 <li> Current Balance: INR{parseFloat(data.currentBalance).toLocaleString()}</li>
 )}
 </ul>
 </div>

 {/* Success Message */}
 {progress === 100 && (
 <div className="bg-green-50 border border-green-200 rounded-lg p-4">
 <div className="text-green-600 mb-2">
 <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 </div>
 <h3 className="text-lg font-medium text-green-800 mb-2">
 All Set! 
 </h3>
 <p className="text-green-700 text-sm">
 Your account is ready. You'll be redirected to your dashboard shortly.
 </p>
 </div>
 )}

 {/* Loading Spinner */}
 {isProcessing && progress < 100 && (
 <div className="flex justify-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
 </div>
 )}

 <div className="flex space-x-3">
 <button data-testid="onboarding-complete-step-back-2"
 onClick={onBack}
 disabled={isProcessing}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
 >
 Back
 </button>
 {!isProcessing && progress === 0 && (
 <button data-testid="onboarding-complete-step-complete-setup"
 onClick={startProcessing}
 className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
 >
 Complete Setup
 </button>
 )}
 </div>
 </div>
 );
};
