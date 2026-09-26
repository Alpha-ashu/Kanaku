import React, { useState } from 'react';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Building2,
  User,
  MapPin,
  Briefcase,
  Wallet,
} from 'lucide-react';
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
 avatarUrl?: string;
 avatarId?: string;
 };
 onComplete: () => void;
 onBack: () => void;
 onGoToStep?: (step: number) => void;
}

export const OnboardingCompleteStep: React.FC<OnboardingCompleteStepProps> = ({
  data,
  onComplete,
  onBack,
  onGoToStep,
}) => {
 const [isProcessing, setIsProcessing] = useState(false);
 const [progress, setProgress] = useState(0);
 const [error, setError] = useState<string | null>(null);

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
   phone: data.mobile || null,
   mobile: data.mobile || null,
   country: data.country,
   state: data.state,
   city: data.city,
   monthlyIncome: monthlyBudget,
   dateOfBirth: data.dateOfBirth,
   jobType: data.jobType,
   avatarId: resolvedAvatar.id,
   avatarUrl: resolvedAvatar.url
   }, {
     showErrorToast: false,
     suppressSessionExpiry: true,
   });
   } catch (apiErr: any) {
   console.warn('Backend API sync failed:', apiErr);
   const errMsg = apiErr?.message || '';
   if (
     apiErr?.code === 'PHONE_EXISTS' ||
     apiErr?.status === 409 ||
     errMsg.toLowerCase().includes('phone')
   ) {
     throw apiErr;
   }
   }

  try {
  await apiClient.put('/settings', {
  currency: userSettings.currency,
  language: userSettings.language,
  timezone: userSettings.timezone,
  settings: toSettingsPayload(userSettings),
  }, {
  showErrorToast: false,
  suppressSessionExpiry: true,
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
 window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));

 localStorage.removeItem('auth_flow_step');
 localStorage.removeItem('pending_auth_email');
 localStorage.removeItem('auth_flow_step_timestamp');
 localStorage.removeItem('is_new_user');
 localStorage.setItem('onboarding_refresh_timestamp', Date.now().toString());
 setProgress(100);
 await new Promise(resolve => setTimeout(resolve, 500));
 toast.success('Account setup complete!');
 onComplete();

 if (typeof window !== 'undefined') {
   if (window.location.pathname === '/signup' || window.location.pathname === '/onboarding') {
     window.history.replaceState(null, '', '/');
   }
 }
 } catch (err: any) {
  const errMsg = err?.message || '';
  if (
    err?.code === 'PHONE_EXISTS' ||
    err?.status === 409 ||
    errMsg.toLowerCase().includes('phone')
  ) {
    localStorage.removeItem('onboarding_completed');
    localStorage.setItem('profile_sync_pending', 'true');
    setIsProcessing(false);
    setProgress(0);
    toast.error('This phone number is already registered to another account. Please use a different phone number.');
    if (onGoToStep) {
      onGoToStep(1);
    } else {
      onBack();
    }
    return;
  }
  // Last-resort: if anything truly fatal happens, still mark onboarding done
  // and proceed so the user is never stuck on this screen.
  localStorage.setItem('onboarding_completed', 'true');
  window.dispatchEvent(new CustomEvent('ONBOARDING_COMPLETED', {
    detail: {
      profile: userProfile,
      account: null,
    },
  }));
  window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
  setProgress(100);
  await new Promise(resolve => setTimeout(resolve, 500));
  toast.success('Setup complete! Some data will sync when you reconnect.');
  onComplete();

  if (typeof window !== 'undefined') {
    if (window.location.pathname === '/signup' || window.location.pathname === '/onboarding') {
      window.history.replaceState(null, '', '/');
    }
  }
  }
 };

 const retrySetup = () => {
 setProgress(0);
 startProcessing();
 };
  if (error) {
    return (
      <div className="text-center space-y-5">
        <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-5">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-lg font-bold text-red-900 mb-1">
            Setup Encountered an Issue
          </h3>
          <p className="text-red-700 text-xs leading-relaxed max-w-sm mx-auto">{error}</p>
        </div>

        <div className="flex space-x-3 pt-2">
          <button
            data-testid="onboarding-complete-step-back"
            onClick={onBack}
            className="flex-1 bg-slate-100 text-slate-700 py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors font-bold text-sm"
          >
            Back
          </button>
          <button
            data-testid="onboarding-complete-step-try-again"
            onClick={retrySetup}
            className="flex-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white py-3 px-4 rounded-xl transition-all font-bold text-sm shadow-md shadow-violet-500/20"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          {progress === 100 ? "You're All Set!" : isProcessing ? 'Initializing Your Workspace' : 'Ready to Launch'}
        </h3>
      </div>

      {/* Summary Bento Card */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Setup Summary</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
            <ShieldCheck size={12} /> Local-First Ready
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
            <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
              <User size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{data.displayName || 'Personal Account'}</p>
              <p className="text-slate-400 text-xs truncate">{data.jobType || 'Individual'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <MapPin size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{data.city ? `${data.city}, ` : ''}{data.country || 'India'}</p>
              <p className="text-slate-400 text-xs truncate">{data.language || 'English'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Building2 size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{data.bankName ? `${data.bankName}` : 'Cash Ledger'}</p>
              <p className="text-slate-400 text-xs truncate">
                {data.currentBalance ? `₹${parseFloat(data.currentBalance).toLocaleString()}` : '₹0 Opening'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Wallet size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">
                {data.salary && !isNaN(parseFloat(data.salary)) ? `₹${parseFloat(data.salary).toLocaleString()}/yr` : 'Salary unstated'}
              </p>
              <p className="text-slate-400 text-xs truncate">Target Budget</p>
            </div>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {progress === 100 && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-center">
          <p className="text-emerald-800 font-bold text-sm mb-0.5">Setup Successful!</p>
          <p className="text-emerald-600 text-xs">Redirecting to your personal dashboard...</p>
        </div>
      )}

      {/* Loading Spinner */}
      {isProcessing && progress < 100 && (
        <div className="flex items-center justify-center gap-2 py-2 text-violet-600 text-xs font-semibold">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-600 border-t-transparent"></div>
          <span>Configuring your personal workspace...</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3 pt-2">
        <button
          data-testid="onboarding-complete-step-back-2"
          onClick={onBack}
          disabled={isProcessing && progress < 100}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl transition-colors font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>
        {progress === 100 && (
          <button
            data-testid="onboarding-complete-step-proceed"
            type="button"
            onClick={() => {
              onComplete();
              window.dispatchEvent(new CustomEvent('ONBOARDING_COMPLETED', {
                detail: { profile: JSON.parse(localStorage.getItem('user_profile') || '{}') }
              }));
              window.dispatchEvent(new CustomEvent('KANAKU_AUTH_CHANGE'));
              if (typeof window !== 'undefined') {
                if (window.location.pathname === '/signup' || window.location.pathname === '/onboarding') {
                  window.history.replaceState(null, '', '/');
                }
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white py-3 px-4 rounded-xl transition-all font-bold text-sm shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
          >
            <span>Explore App Features</span>
            <ArrowRight size={16} />
          </button>
        )}
        {!isProcessing && progress === 0 && (
          <button
            data-testid="onboarding-complete-step-complete-setup"
            onClick={startProcessing}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white py-3 px-4 rounded-xl transition-all font-bold text-sm shadow-md shadow-violet-500/20 active:scale-[0.99]"
          >
            <span>Complete Setup</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
