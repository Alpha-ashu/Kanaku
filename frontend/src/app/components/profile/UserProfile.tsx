import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Lock, Eye, EyeOff, Mail, Phone, User, Calendar, Briefcase, LogOut, ShieldAlert, Trash2, X, KeyRound, Check, MapPin, DollarSign, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '@/utils/supabase/client';
import { db } from '@/lib/database';
import { permissionService } from '@/services/permissionService';
import { backupPINKeys, restorePINKeys, storeMasterKey } from '@/lib/encryption';
import { calculateAge, getAgeGroup, getAgeGroupLabel } from '@/lib/avatar';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, resolveAvatarSelection } from '@/lib/avatar-gallery';
import { api } from '@/lib/api';
import { shouldSkipOptionalBackendRequests } from '@/lib/apiBase';
import { format, parseISO } from 'date-fns';
import { pinService } from '@/services/pinService';
import { AdvisorRoleSection } from './AdvisorRoleSection';

interface ProfileData {
 firstName: string;
 lastName: string;
 gender: 'male' | 'female' | 'non-binary' | 'prefer-not-to-say' | '';
 email: string;
 mobile: string;
 dateOfBirth: string;
 monthlyIncome: number;
 jobType: 'businessman' | 'salaried' | 'freelancer' | '';
 country: string;
 state: string;
 city: string;
 profilePhoto?: string;
 avatarId?: string;
}

interface VerificationState {
 type: 'email-change' | 'mobile-change' | null;
 otp: string;
 newValue: string;
 step: 'request' | 'otp-sent' | 'verified';
}

const ProfileSkeleton: React.FC = () => {
  return (
    <div className="w-full min-h-screen bg-white pb-32 lg:pb-8 animate-pulse">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="px-4 sm:px-6 lg:px-8 pt-6 lg:pt-10">
          <PageHeader
            title="User Profile"
            subtitle="Manage your personal information"
            icon={<User size={20} className="sm:w-6 sm:h-6" />}
            showBack
            backTo="dashboard"
          />
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 lg:px-8 mt-6 lg:mt-8">
          <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
            {/* LEFT COLUMN */}
            <div className="space-y-4">
              {/* Avatar Section Skeleton */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-4">
                <Skeleton className="w-32 h-32 rounded-full" />
                <Skeleton className="h-6 w-32 rounded-lg" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>

              {/* Basic Info Card Skeleton */}
              <Card data-testid="user-profile-card" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
                <div className="flex items-center justify-between mb-5">
                  <Skeleton className="h-6 w-36 rounded-lg" />
                  <Skeleton className="h-8 w-14 rounded-xl" />
                </div>
                <div className="divide-y divide-gray-100">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex items-center justify-between py-3.5">
                      <Skeleton className="h-4 w-24 rounded-lg" />
                      <Skeleton className="h-4 w-32 rounded-lg" />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Location Card Skeleton */}
              <Card data-testid="user-profile-card-2" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
                <div className="flex items-center justify-between mb-5">
                  <Skeleton className="h-6 w-44 rounded-lg" />
                  <Skeleton className="h-8 w-14 rounded-xl" />
                </div>
                <div className="divide-y divide-gray-100">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between py-3.5">
                      <Skeleton className="h-4 w-24 rounded-lg" />
                      <Skeleton className="h-4 w-28 rounded-lg" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6 min-w-0">
              {/* Secure Info Card Skeleton */}
              <Card data-testid="user-profile-card-3" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
                <Skeleton className="h-6 w-40 rounded-lg mb-5" />
                <div className="mb-5 pb-5 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-28 rounded-lg" />
                        <Skeleton className="h-3 w-40 rounded-lg" />
                      </div>
                    </div>
                  </div>
                  <Skeleton className="h-5 w-48 rounded-lg mb-3" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className="h-4 w-28 rounded-lg" />
                        <Skeleton className="h-3 w-40 rounded-lg" />
                      </div>
                    </div>
                  </div>
                  <Skeleton className="h-5 w-36 rounded-lg mb-4" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </Card>

              {/* Security & PIN Card Skeleton */}
              <Card data-testid="user-profile-card-4" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
                <Skeleton className="h-6 w-32 rounded-lg mb-4" />
                <div className="p-4 bg-white rounded-xl border border-gray-200 flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32 rounded-lg" />
                    <Skeleton className="h-3 w-60 rounded-lg" />
                  </div>
                  <Skeleton className="h-10 w-24 rounded-xl" />
                </div>
              </Card>

              {/* Lower grid items skeleton */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                <Card data-testid="user-profile-card-5" className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-20 rounded-lg" />
                      <Skeleton className="h-3 w-36 rounded-lg" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-full rounded-xl" />
                </Card>
                <Card data-testid="user-profile-card-6" className="bg-red-50 border border-red-200 rounded-2xl p-6 h-full flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-24 rounded-lg" />
                      <Skeleton className="h-3 w-44 rounded-lg" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-full rounded-xl" />
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const UserProfile: React.FC = () => {
 const { user, signOut, role } = useAuth();
 const { setCurrentPage, currency, setCurrency, visibleFeatures } = useApp();
 const [isSigningOut, setIsSigningOut] = useState(false);

 const handleSignOut = async () => {
 if (isSigningOut) return; // Prevent double-clicks

 setIsSigningOut(true);
 console.log('" Starting sign out process...');
 toast.info('Signing out...');

 try {
  // Step 1: Revoke the backend session (with timeout). Backend-managed auth: no Supabase session.
  const signOutPromise = (async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      console.warn('Backend logout failed (continuing local cleanup):', e);
    }
  })();
  const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Sign out timeout')), 5000)
  );

  try {
  await Promise.race([signOutPromise, timeoutPromise]);
  } catch (e) {
  console.warn('Supabase signOut timed out or failed (non-blocking):', e);
  }

 // Step 2: Clear permissions
 try {
 permissionService.clearPermissions();
 } catch (e) {
 console.warn('Permission clear error (non-blocking):', e);
 }

 // Step 3: Clear all storage (PIN preserved)
 try {
 const pinBackup = backupPINKeys();
 localStorage.clear();
 sessionStorage.clear();
 restorePINKeys(pinBackup);
 } catch (e) {
 console.warn('Storage clear error (non-blocking):', e);
 }

 // Step 4: Clear IndexedDB tables (with timeout)
 try {
 await Promise.race([
 Promise.all([
 db.accounts.clear(),
 db.transactions.clear(),
 db.loans.clear(),
 db.goals.clear(),
 db.investments.clear(),
 db.notifications.clear(),
 db.groupExpenses.clear(),
 db.friends.clear(),
 db.smsTransactions.clear(),
 ]),
 new Promise((_, reject) => setTimeout(() => reject(new Error('DB clear timeout')), 3000))
 ]);
 } catch (e) {
 console.warn('DB clear error (non-blocking):', e);
 }

 // Step 5: Delete the database
 try {
 window.indexedDB.deleteDatabase('KANAKUDB');
 } catch (e) {
 console.warn('IndexedDB delete error (non-blocking):', e);
 }

 console.log('... Sign out completed successfully');
 toast.success('Signed out successfully');

 // Step 6: Hard redirect immediately
 window.location.href = window.location.origin + '/login?logged_out=1';

 } catch (error) {
 console.error(' Sign out failed:', error);

 // Force cleanup even on error
 try {
 const pinBackup = backupPINKeys();
 localStorage.clear();
 sessionStorage.clear();
 restorePINKeys(pinBackup);
 } catch (e) {
 // Ignore
 }

 // Always redirect
 window.location.href = window.location.origin + '/login';
 }
 };

 const [profileData, setProfileData] = useState<ProfileData>({
 firstName: '',
 lastName: '',
 gender: '',
 email: user?.email || '',
 mobile: '',
 dateOfBirth: '',
 monthlyIncome: 0,
 jobType: '',
 country: '',
 state: '',
 city: '',
 profilePhoto: DEFAULT_AVATAR.url,
 avatarId: DEFAULT_AVATAR.id,
 });

 const [isLoading, setIsLoading] = useState(true);

 // States for Delete Account functionality
 const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
 const [deletePassword, setDeletePassword] = useState('');
 const [isDeleting, setIsDeleting] = useState(false);

 // Fetch profile data: localStorage first, then backend profile API.
 /**
 * Normalize any jobType string (from either onboarding form) into one of
 * the three canonical values used by the profile dropdown.
 */
 const normalizeJobType = (raw: string): ProfileData['jobType'] => {
 const v = (raw || '').toLowerCase().trim();
 if (!v) return '';
 if (v.includes('business') || v.includes('self') || v === 'self-employed') return 'businessman';
 if (v.includes('freelance')) return 'freelancer';
 // Everything else (full-time, part-time, salaried, employment, student, retired, etc.) ' salaried
 return 'salaried';
 };

 /** Human-readable label for gender */
 const genderLabel = (v: string) => {
 if (v === 'male') return 'Male';
 if (v === 'female') return 'Female';
 if (v === 'non-binary') return 'Non-binary';
 if (v === 'prefer-not-to-say') return 'Prefer not to say';
 return 'Not specified';
 };

 /** Human-readable label for a canonical jobType value */
 const jobTypeLabel = (v: string) => {
 if (v === 'businessman') return 'Self-employed / Business';
 if (v === 'freelancer') return 'Freelancer';
 if (v === 'salaried') return 'Salaried / Employed';
 return 'Not specified';
 };

 const resolveAvatar = (avatarUrl?: string | null, avatarId?: string | null) =>
 resolveAvatarSelection({ avatarUrl, avatarId });

 const fetchProfileData = async () => {
 if (!user) {
 setIsLoading(false);
 return;
 }

 // SOURCE 0: Supabase auth user_metadata (set during signUp)
 // When users sign up, first_name/last_name are stored in user_metadata.
 // This is the most reliable name source even before a profiles row exists.
 const meta = user.user_metadata || {};
 const metaFirstName = (meta.first_name || meta.firstName || '').trim();
 const metaLastName = (meta.last_name || meta.lastName || '').trim();

 // Apply auth metadata as the baseline so names are never blank
 if (metaFirstName || metaLastName) {
 setProfileData(prev => ({
 ...prev,
 firstName: metaFirstName || prev.firstName,
 lastName: metaLastName || prev.lastName,
 email: user.email || prev.email,
 profilePhoto: resolveAvatar(prev.profilePhoto, prev.avatarId).url,
 avatarId: resolveAvatar(prev.profilePhoto, prev.avatarId).id,
 }));
 }

 // SOURCE 1: localStorage (written by NewUserOnboarding on completion)
 const localProfile = localStorage.getItem('user_profile');
 if (localProfile) {
 try {
 const p = JSON.parse(localProfile);
 // displayName is from NewUserOnboarding; full_name/firstName from AuthFlow path
 const displayName = p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
 const nameParts = displayName.split(' ');
 const firstName = metaFirstName || nameParts[0] || '';
 const lastName = metaLastName || nameParts.slice(1).join(' ') || '';
 const rawSalary = parseFloat(p.salary);
 const monthlyIncomeVal = p.monthlyIncome
 ? Number(p.monthlyIncome)
 : (!isNaN(rawSalary) && rawSalary > 0 ? Math.round(rawSalary / 12) : 0);

 setProfileData(prev => ({
 ...prev,
 firstName: firstName || prev.firstName,
 lastName: lastName || prev.lastName,
 gender: (p.gender || prev.gender || '') as ProfileData['gender'],
 email: user.email || prev.email,
 mobile: p.mobile || prev.mobile || '',
 dateOfBirth: p.dateOfBirth || prev.dateOfBirth || '',
 monthlyIncome: monthlyIncomeVal || prev.monthlyIncome,
 jobType: (normalizeJobType(p.jobType) || prev.jobType) as ProfileData['jobType'],
 country: p.country || prev.country || '',
 state: p.state || prev.state || '',
 city: p.city || prev.city || '',
 profilePhoto: resolveAvatar(p.profilePhoto || prev.profilePhoto, p.avatarId || prev.avatarId).url,
 avatarId: resolveAvatar(p.profilePhoto || prev.profilePhoto, p.avatarId || prev.avatarId).id,
 }));
 } catch {
 // Corrupt localStorage, fall through to Supabase
 }
 }

 // SOURCE 2: Backend API (authoritative, cloud-synced)
 try {
 let finalData: any = null;
 if (!shouldSkipOptionalBackendRequests()) {
 try {
 const backendRes = await api.auth.getProfile({ includePrivate: true });
 if (backendRes.success && backendRes.data) {
 finalData = backendRes.data;
 }
 } catch (backendError) {
 console.warn('[UserProfile] Backend profile fetch failed:', backendError);
 }
 } else {
 console.info('[UserProfile] Skipping backend profile fetch while backend is unavailable in development mode.');
 }

 if (finalData) {
 const data = finalData;
 const fullName = data.name || data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim();
 const nameParts = fullName.split(' ');
 const firstName = data.firstName || data.first_name || metaFirstName || nameParts[0] || '';
 const lastName = data.lastName || data.last_name || metaLastName || nameParts.slice(1).join(' ') || '';

 const monthlyIncomeVal = data.monthlyIncome || data.monthly_income
 ? Number(data.monthlyIncome || data.monthly_income)
 : data.salary || data.annual_income
 ? Math.round(Number(data.salary || data.annual_income) / 12)
 : 0;

 const dateOfBirthVal = data.dateOfBirth || data.date_of_birth
 ? new Date(data.dateOfBirth || data.date_of_birth).toISOString().split('T')[0]
 : '';

 const fetchedProfile = {
 firstName,
 lastName,
 email: data.email || user.email || '',
 mobile: data.mobile || data.phone || '',
 gender: (data.gender || '').toLowerCase() as any,
 dateOfBirth: dateOfBirthVal,
 monthlyIncome: monthlyIncomeVal,
 jobType: normalizeJobType(data.jobType || data.job_type || ''),
 country: data.country || '',
 state: data.state || '',
 city: data.city || '',
    profilePhoto: resolveAvatarSelection({
      avatarUrl: data.profilePhoto || data.avatarUrl || data.avatar_url,
      avatarId: data.avatarId || data.avatar_id
    }).url,
 avatarId: data.avatarId || data.avatar_id,
 };

 setProfileData(fetchedProfile);

 // Update localStorage as a warm cache
 const lastUpdated = new Date().toISOString();
 localStorage.setItem('user_profile', JSON.stringify({
 ...fetchedProfile,
 displayName: fullName,
 salary: monthlyIncomeVal * 12,
 avatarUrl: fetchedProfile.profilePhoto,
 avatarId: fetchedProfile.avatarId,
 updatedAt: lastUpdated,
 }));
 localStorage.setItem('profile_updated_at', lastUpdated);
 }
 } catch (error) {
 console.warn('Backend profile fetch failed (non-blocking):', error);
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 fetchProfileData();
 }, [user]);

 // Listen for onboarding completion to refresh profile data
 useEffect(() => {
 const handleOnboardingComplete = () => {
 console.log('ONBOARDING_COMPLETED event received in UserProfile, refreshing profile data...');
 // Re-use the already-fixed fetchProfileData (handles Supabase + localStorage fallback)
 fetchProfileData();
 };

 window.addEventListener('ONBOARDING_COMPLETED', handleOnboardingComplete as EventListener);

 return () => {
 window.removeEventListener('ONBOARDING_COMPLETED', handleOnboardingComplete as EventListener);
 };
 }, [user]);

 const [isEditingBasic, setIsEditingBasic] = useState(false);
 const [isEditingLocation, setIsEditingLocation] = useState(false);
 const [tempData, setTempData] = useState<ProfileData>(profileData);
 const [showAvatarGallery, setShowAvatarGallery] = useState(false);
 const [isAutofetching, setIsAutofetching] = useState(false);
 const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
 const [isSearchingCity, setIsSearchingCity] = useState(false);

 // Dirty state tracking: detect unsaved changes
 const isInEditMode = isEditingBasic || isEditingLocation;
 const hasDirtyChanges = isInEditMode && (
 tempData.firstName !== profileData.firstName ||
 tempData.lastName !== profileData.lastName ||
 tempData.gender !== profileData.gender ||
 tempData.dateOfBirth !== profileData.dateOfBirth ||
 tempData.jobType !== profileData.jobType ||
 tempData.monthlyIncome !== profileData.monthlyIncome ||
 tempData.country !== profileData.country ||
 tempData.state !== profileData.state ||
 tempData.city !== profileData.city ||
 tempData.avatarId !== profileData.avatarId
 );
 const showFloatingBar = isInEditMode || hasDirtyChanges;

 const handleDiscard = () => {
 setTempData(profileData);
 setIsEditingBasic(false);
 setIsEditingLocation(false);
 setShowAvatarGallery(false);
 setCitySuggestions([]);
 };


 const handleCitySearch = async (query: string) => {
 setTempData(prev => ({ ...prev, city: query }));
 if (query.length < 3) {
 setCitySuggestions([]);
 return;
 }

 setIsSearchingCity(true);
 try {
 const response = await fetch(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`, {
 headers: { 'Accept-Language': 'en' }
 });
 const data = await response.json();
 setCitySuggestions(data);
 } catch (err) {
 console.warn('[CitySearch] Failed:', err);
 } finally {
 setIsSearchingCity(false);
 }
 };

 const handleSelectCity = (suggestion: any) => {
 const addr = suggestion.address;
 const city = addr.city || addr.town || addr.village || addr.suburb || tempData.city;
 const state = addr.state || addr.region || addr.county || '';
 const country = addr.country || '';
 const countryCode = (addr.country_code || '').toUpperCase();

 setTempData(prev => ({
 ...prev,
 city,
 state,
 country
 }));
 setCitySuggestions([]);

 // Currency Mapping
 const currencyMap: Record<string, string> = {
 'IN': 'INR', 'US': 'USD', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 
 'CA': 'CAD', 'AE': 'AED', 'SG': 'SGD', 'DE': 'EUR', 'FR': 'EUR',
 'IT': 'EUR', 'ES': 'EUR', 'NL': 'EUR', 'BE': 'EUR', 'AT': 'EUR',
 'PT': 'EUR', 'IE': 'EUR', 'GR': 'EUR', 'FI': 'EUR', 'BR': 'BRL',
 'RU': 'RUB', 'CN': 'CNY', 'ZA': 'ZAR', 'MX': 'MXN', 'CH': 'CHF'
 };
 
 if (currencyMap[countryCode]) {
 setCurrency(currencyMap[countryCode]);
 }
 };


 // Bug 3 fix: keep tempData in sync with profileData after async fetch,
 // but only when the edit form is not currently open to avoid overwriting
 // in-progress user edits.
 useEffect(() => {
 if (!isEditingBasic && !isEditingLocation) {
 setTempData(profileData);
 }
 }, [profileData]);

 useEffect(() => {
 if (!isEditingBasic && !isEditingLocation) {
 setShowAvatarGallery(false);
 }
 }, [isEditingBasic, isEditingLocation]);

 const [verification, setVerification] = useState<VerificationState>({
 type: null,
 otp: '',
 newValue: '',
 step: 'request',
 });
 const ageValue = calculateAge(tempData.dateOfBirth || profileData.dateOfBirth);
 const ageGroup = getAgeGroup(ageValue);
 const ageGroupLabel = getAgeGroupLabel(ageGroup);
 const ageSource = isEditingBasic ? tempData.dateOfBirth : profileData.dateOfBirth;
 const activeAvatar = resolveAvatarSelection({
 avatarId: tempData.avatarId || profileData.avatarId || null,
 avatarUrl: tempData.profilePhoto || profileData.profilePhoto || null,
 });

 const handleSaveProfile = async () => {
 if (!user) return;
 setIsLoading(true);

 try {
 const resolvedAvatar = resolveAvatar(tempData.profilePhoto, tempData.avatarId);
 const operationId = `profile_update_${Date.now()}`;
 const updatedAt = new Date().toISOString();
 const nextProfileData: ProfileData = {
 ...tempData,
 email: user.email || tempData.email,
 profilePhoto: resolvedAvatar.url,
 avatarId: resolvedAvatar.id,
 };

 // 1. Update local state immediately for responsive UI
 setProfileData(nextProfileData);
 setTempData(nextProfileData);
 setIsEditingBasic(false);
 setIsEditingLocation(false);

 // 2. Save to localStorage for persistence
 localStorage.setItem('user_profile', JSON.stringify({
 displayName: `${nextProfileData.firstName} ${nextProfileData.lastName}`.trim(),
 firstName: nextProfileData.firstName,
 lastName: nextProfileData.lastName,
 gender: nextProfileData.gender,
 email: nextProfileData.email,
 mobile: nextProfileData.mobile,
 dateOfBirth: nextProfileData.dateOfBirth,
 jobType: nextProfileData.jobType,
 salary: (nextProfileData.monthlyIncome || 0) * 12,
 monthlyIncome: nextProfileData.monthlyIncome || 0,
 country: nextProfileData.country,
 state: nextProfileData.state,
 city: nextProfileData.city,
 profilePhoto: resolvedAvatar.url,
 avatarUrl: resolvedAvatar.url,
 avatarId: resolvedAvatar.id,
 updatedAt,
 }));
 localStorage.setItem('profile_updated_at', updatedAt);
 localStorage.setItem('profile_sync_pending', 'true');

 // 3. Add to backend sync queue (non-blocking)
 const { backendSyncService } = await import('@/lib/backend-sync-service');
 backendSyncService.addPendingOperation(operationId);

 // 4. Update via Backend API (fire-and-forget)
 if (!shouldSkipOptionalBackendRequests()) {
 void api.auth.updateProfile({
 firstName: nextProfileData.firstName,
 lastName: nextProfileData.lastName,
 gender: nextProfileData.gender,
 country: nextProfileData.country,
 state: nextProfileData.state,
 city: nextProfileData.city,
 monthlyIncome: nextProfileData.monthlyIncome,
 dateOfBirth: nextProfileData.dateOfBirth,
 jobType: nextProfileData.jobType,
 mobile: nextProfileData.mobile,
 avatarId: resolvedAvatar.id,
 avatarUrl: resolvedAvatar.url,
 }).then(() => {
 backendSyncService.removePendingOperation(operationId);
 localStorage.removeItem('profile_sync_pending');
 console.log('... Profile synced to backend');
 }).catch((error) => {
 console.warn(' Backend sync failed, will retry:', error);
 });
 } else {
 console.info('[UserProfile] Skipping immediate backend profile sync while backend is unavailable in development mode.');
 }

 toast.success('Profile updated successfully!');
 window.dispatchEvent(new Event('PROFILE_UPDATED'));
 } catch (error: any) {
 console.error('Failed to save profile:', error);
 toast.error(error.message || 'Failed to save profile. Please try again.');
 } finally {
 setIsLoading(false);
 }
 };

 // Change PIN
 const [pinChangeStep, setPinChangeStep] = useState<'idle' | 'set-new-pin'>('idle');
 const [currentPin, setCurrentPin] = useState('');
 const [newPin, setNewPin] = useState('');
 const [confirmNewPin, setConfirmNewPin] = useState('');
 const [showNewPin, setShowNewPin] = useState(false);
 const [isPinLoading, setIsPinLoading] = useState(false);
 const isPinWeak = newPin.length === 6 && pinService.isWeakPin(newPin);

  const handleSetNewPin = async () => {
    if (currentPin.length !== 6) { toast.error('Current PIN must be 6 digits'); return; }
    if (newPin.length !== 6) { toast.error('New PIN must be 6 digits'); return; }
    if (pinService.isWeakPin(newPin)) { toast.error('New PIN is too weak. Avoid sequential, repeating, or common patterns.'); return; }
    if (newPin !== confirmNewPin) { toast.error('PINs do not match'); setConfirmNewPin(''); return; }

    setIsPinLoading(true);
    try {
      // Prove possession with the current PIN the user just entered.
      const secResult = await pinService.verifySecurity({ pin: currentPin });
      if (!secResult.success || !secResult.securityToken) {
        toast.error(secResult.message || 'Security verification failed');
        return;
      }

      const result = await pinService.updatePin(currentPin, newPin, secResult.securityToken);
      if (!result.success) {
        toast.error(result.message || 'Failed to update PIN');
        return;
      }

      storeMasterKey(newPin);
      const pinBackup = backupPINKeys();
      if (pinBackup.hash && pinBackup.salt) {
        const backupResult = await pinService.saveKeyBackup(`${pinBackup.hash}|${pinBackup.salt}`, secResult.securityToken);
        if (!backupResult.success) {
          console.warn('PIN key backup refresh failed after PIN change:', backupResult.message);
        }
      }

 localStorage.setItem('pin_created_at', new Date().toISOString());
 if (result.expiresAt) {
 localStorage.setItem('pin_expiry', result.expiresAt);
 }

 toast.success('PIN changed successfully!');
 setPinChangeStep('idle');
 setCurrentPin('');
 setNewPin('');
 setConfirmNewPin('');
 } finally {
 setIsPinLoading(false);
 }
 };

 const resetPinFlow = () => {
 setPinChangeStep('idle');
 setCurrentPin('');
 setNewPin('');
 setConfirmNewPin('');
 };

 // Email & mobile change (kept simple for now, uses verification state)
 const handleChangeEmail = () => {
 if (!verification.newValue) { toast.error('Please enter new email'); return; }
 setVerification({ ...verification, type: 'email-change', step: 'otp-sent' });
 toast.success('Verification link sent to your current email');
 };
 const handleVerifyEmailOTP = () => {
 if (verification.otp.length === 6) {
 setProfileData({ ...profileData, email: verification.newValue });
 setVerification({ type: null, otp: '', newValue: '', step: 'request' });
 toast.success('Email updated successfully');
 window.dispatchEvent(new Event('PROFILE_UPDATED'));
 } else { toast.error('Invalid OTP'); }
 };
 const handleChangeMobile = () => {
 if (!verification.newValue) { toast.error('Please enter new mobile number'); return; }
 setVerification({ ...verification, type: 'mobile-change', step: 'otp-sent' });
 toast.success('OTP sent to your registered email');
 };
  const handleVerifyMobileOTP = async () => {
    if (verification.otp.length === 6) {
      setIsLoading(true);
      try {
        const nextProfileData: ProfileData = {
          ...profileData,
          mobile: verification.newValue,
        };

        // 1. Update local states
        setProfileData(nextProfileData);
        setTempData(nextProfileData);
        setVerification({ type: null, otp: '', newValue: '', step: 'request' });

        const resolvedAvatar = resolveAvatar(nextProfileData.profilePhoto, nextProfileData.avatarId);
        const operationId = `profile_update_mobile_${Date.now()}`;
        const updatedAt = new Date().toISOString();

        // 2. Save to localStorage
        localStorage.setItem('user_profile', JSON.stringify({
          displayName: `${nextProfileData.firstName} ${nextProfileData.lastName}`.trim(),
          firstName: nextProfileData.firstName,
          lastName: nextProfileData.lastName,
          gender: nextProfileData.gender,
          email: nextProfileData.email,
          mobile: nextProfileData.mobile,
          dateOfBirth: nextProfileData.dateOfBirth,
          jobType: nextProfileData.jobType,
          salary: (nextProfileData.monthlyIncome || 0) * 12,
          monthlyIncome: nextProfileData.monthlyIncome || 0,
          country: nextProfileData.country,
          state: nextProfileData.state,
          city: nextProfileData.city,
          profilePhoto: resolvedAvatar.url,
          avatarUrl: resolvedAvatar.url,
          avatarId: resolvedAvatar.id,
          updatedAt,
        }));
        localStorage.setItem('profile_updated_at', updatedAt);
        localStorage.setItem('profile_sync_pending', 'true');

        // 3. Add to backend sync queue (non-blocking)
        const { backendSyncService } = await import('@/lib/backend-sync-service');
        backendSyncService.addPendingOperation(operationId);

        // 4. Update via Backend API
        if (!shouldSkipOptionalBackendRequests()) {
          void api.auth.updateProfile({
            firstName: nextProfileData.firstName,
            lastName: nextProfileData.lastName,
            gender: nextProfileData.gender,
            country: nextProfileData.country,
            state: nextProfileData.state,
            city: nextProfileData.city,
            monthlyIncome: nextProfileData.monthlyIncome,
            dateOfBirth: nextProfileData.dateOfBirth,
            jobType: nextProfileData.jobType,
            mobile: nextProfileData.mobile,
            avatarId: resolvedAvatar.id,
            avatarUrl: resolvedAvatar.url,
          }).then(() => {
            backendSyncService.removePendingOperation(operationId);
            localStorage.removeItem('profile_sync_pending');
            console.log('... Profile mobile number synced to backend');
          }).catch((error) => {
            console.warn('Backend sync for mobile failed, will retry:', error);
          });
        } else {
          console.info('[UserProfile] Skipping backend profile mobile sync while backend is unavailable in development mode.');
        }

        toast.success('Mobile number updated successfully');
        window.dispatchEvent(new Event('PROFILE_UPDATED'));
      } catch (err: any) {
        console.error('Failed to update mobile number:', err);
        toast.error(err.message || 'Failed to save mobile number. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else {
      toast.error('Invalid OTP');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!deletePassword) {
      toast.error('Please enter your password to confirm deletion');
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Re-authenticate via backend login endpoint before the destructive action
      const loginRes = await api.auth.login({
        email: user.email!,
        password: deletePassword,
      });

      if (!loginRes.success) {
        throw new Error('Incorrect password. Please try again.');
      }

      // 2. Call the backend endpoint — it deletes all Prisma data and Supabase Auth user
      const result = await api.auth.deleteAccount();
      if (!result.success) {
        throw new Error(result.message || 'Account deletion failed. Please contact support.');
      }

      // 3. Clear all local app state so nothing lingers after account is gone
      const localKeys = [
        'auth_token', 'accessToken', 'refresh_token', 'refreshToken', 'token', 'authToken', 'auth_token_v1',
        'user_profile', 'profile_updated_at', 'profile_sync_pending',
        'pin_hash', 'pin_salt', 'pin_created_at', 'pin_expiry',
        'currency', 'app_settings',
      ];
      localKeys.forEach(k => localStorage.removeItem(k));

      toast.success('Account deleted. Goodbye!');

      // 4. Sign out and redirect to the auth screen
      signOut();

    } catch (error: any) {
      console.error('Account deletion failed:', error);
      toast.error(error.message || 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (visibleFeatures?.userProfile === false) {
  return (
  <div className="w-full min-h-screen bg-white flex flex-col items-center justify-center p-4">
  <div className="text-center max-w-md bg-white/60 backdrop-blur-xl border border-gray-200/50 p-8 rounded-[30px] shadow-glass">
  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
  <Lock size={32} />
  </div>
  <h2 className="text-2xl font-bold text-gray-900 mb-2">Feature Disabled</h2>
  <p className="text-gray-500 mb-6">
  The User Profile and account settings feature is currently disabled by the system administrator.
  </p>
  <Button data-testid="user-profile-go-to-dashboard" 
  onClick={() => setCurrentPage('dashboard')}
  className="w-full bg-black text-white hover:bg-gray-900 rounded-full py-3 font-semibold transition-all shadow-md"
  >
  Go to Dashboard
  </Button>
  </div>
  </div>
  );
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

 return (
 <>
 <div className="w-full min-h-screen bg-white pb-32 lg:pb-8">
 <div className="max-w-7xl mx-auto">
 {/* Header */}
 <div className="px-4 sm:px-6 lg:px-8 pt-6 lg:pt-10">
 <PageHeader
 title="User Profile"
 subtitle="Manage your personal information"
 icon={<User size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />
 </div>

 {/* Content */}
 <div className="px-4 sm:px-6 lg:px-8 mt-6 lg:mt-8">
 <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
 {/* LEFT COLUMN */}
 <div className="space-y-4">

 {/* New User Prompt - Only shown when profile is incomplete */}
 {!profileData.firstName && !isLoading && (
 <motion.div
 initial={{ opacity: 0, y: -12 }}
 animate={{ opacity: 1, y: 0 }}
 className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 shadow-lg"
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <p className="font-bold text-lg">Welcome! Complete your profile</p>
 <p className="text-sm text-blue-100 mt-1">
 Fill in your details so we can personalise your experience.
 </p>
 <ul className="mt-3 space-y-1 text-sm text-blue-100">
 {!profileData.jobType && <li>Job Type &amp; Monthly Income</li>}
 </ul>
 </div>
 <button data-testid="user-profile-edit-profile"
 onClick={() => setIsEditingBasic(true)}
 className="shrink-0 mt-1 bg-white text-blue-700 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
 >
 Edit Profile
 </button>
 </div>
 </motion.div>
 )}

 {/* Avatar Section */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-4"
 >
 <motion.div
 animate={{ y: [0, -6, 0] }}
 transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
 className="relative"
 >
 <div className="relative group">
 <img
 src={activeAvatar.url}
 alt="Avatar"
 className="w-32 h-32 rounded-full border-4 border-blue-500 object-cover shadow-xl bg-white"
 onError={(e) => {
 (e.target as HTMLImageElement).src = '/api/v1/avatars/dicebear/avataaars/svg?seed=fallback';
 }}
 />
 <div className="absolute inset-0 rounded-full bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
 </div>
 </motion.div>
 <div className="flex flex-wrap items-center justify-center gap-2">
 <p className="text-gray-900 font-semibold text-lg">
 {[
 isEditingBasic ? tempData.firstName : profileData.firstName,
 isEditingBasic ? tempData.lastName : profileData.lastName,
 ].filter(Boolean).join(' ') || 'User'}
 </p>
 {ageSource && (
 <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
 {ageGroupLabel}
 </span>
 )}
 </div>
 <div className="flex flex-wrap items-center justify-center gap-2">
 <button
 onClick={() => {
 setIsEditingBasic(true);
 setShowAvatarGallery((prev) => !prev);
 }}
 data-testid="profile-choose-avatar-button"
 className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
 >
 Choose Avatar
 </button>
 {showAvatarGallery && (
 <button
 onClick={handleSaveProfile}
 data-testid="profile-save-avatar-button"
 className="inline-flex items-center gap-2 rounded-full border border-green-200 px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"
 >
 <Check size={14} />
 Save Avatar
 </button>
 )}
 </div>
 {showAvatarGallery && (
 <div className="mt-4 w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
 <div className="flex items-center justify-between mb-4">
 <p className="text-sm font-bold text-gray-700 uppercase tracking-wider">Choose your style</p>
 <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-bold">
 {AVATAR_OPTIONS.length} OPTIONS
 </span>
 </div>
 
 <div className="max-h-[320px] overflow-y-auto pr-2 overflow-x-hidden custom-scrollbar">
 <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-y-6 gap-x-4 justify-items-center py-2">
 {AVATAR_OPTIONS.map((avatar) => (
 <button
 key={avatar.id}
 type="button"
 data-testid={`profile-avatar-select-${avatar.id}`}
 onClick={() => setTempData((prev) => ({
 ...prev,
 profilePhoto: avatar.url,
 avatarId: avatar.id,
 }))}
 className={`h-14 w-14 rounded-full overflow-hidden border-2 transition-all relative group flex-shrink-0 ${activeAvatar.id === avatar.id
 ? 'border-blue-500 ring-4 ring-blue-100 scale-110 z-10'
 : 'border-gray-100 hover:border-blue-300 hover:scale-105'
 }`}
 aria-label={`Select avatar ${avatar.label}`}
 title={avatar.label}
 >
 <img 
 src={avatar.url} 
 alt={avatar.label} 
 className="h-full w-full object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).src = `/api/v1/avatars/dicebear/avataaars/svg?seed=${avatar.id}`;
 }}
 />
 {activeAvatar.id === avatar.id && (
 <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
 <Check size={16} className="text-blue-600" />
 </div>
 )}
 </button>
 ))}
 </div>
 </div>
 
 <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-2">
 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
 <p className="text-[11px] text-gray-500 font-medium">
 Scroll to see more characters
 </p>
 </div>
 </div>
 )}
 </motion.div>
 {/* Profile Info Grid */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 >
 <Card data-testid="user-profile-card-7" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
 {/* Header row */}
 <div className="flex items-center justify-between mb-5">
 <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
 <button
 onClick={() => {
 setIsEditingBasic(!isEditingBasic);
 if (isEditingBasic) setTempData(profileData);
 }}
 data-testid="profile-edit-basic-button"
 className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isEditingBasic
 ? 'bg-red-50 text-red-600 hover:bg-red-100'
 : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
 }`}
 >
 {isEditingBasic ? 'Cancel' : 'Edit'}
 </button>
 </div>

 {!isEditingBasic ? (
 /* View mode EUR" clean horizontal info rows */
 <div className="divide-y divide-gray-100">
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <User size={14} className="text-gray-400" /> First Name
 </span>
 <span className="text-sm font-semibold text-gray-900">{profileData.firstName || ''}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <User size={14} className="text-gray-400" /> Last Name
 </span>
 <span className="text-sm font-semibold text-gray-900">{profileData.lastName || ''}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <User size={14} className="text-gray-400" /> Gender
 </span>
 <span className="text-sm font-semibold text-gray-900">{genderLabel(profileData.gender)}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <Calendar size={14} className="text-gray-400" /> Date of Birth
 </span>
 <span className="text-sm font-semibold text-gray-900">
 {profileData.dateOfBirth
 ? format(parseISO(profileData.dateOfBirth), 'dd-MMM-yyyy')
 : ''}
 </span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <Briefcase size={14} className="text-gray-400" /> Job Type
 </span>
 <span className="text-sm font-semibold text-gray-900">{jobTypeLabel(profileData.jobType)}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <span className="text-gray-400 font-bold text-sm w-3.5 inline-flex justify-center"></span> Monthly Income
 </span>
 <span className="text-sm font-semibold text-gray-900"> {Math.round(profileData.monthlyIncome || 0).toLocaleString()}</span>
 </div>
 </div>
 ) : (
 /* Edit mode: form with two-column grid for related fields */
 <div className="space-y-5">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">First Name</label>
 <input
 type="text"
 value={tempData.firstName}
 onChange={(e) => setTempData({ ...tempData, firstName: e.target.value })}
 data-testid="profile-first-name-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 placeholder="Enter first name"
 aria-label="First name"
 id="firstName"
 name="firstName"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Last Name</label>
 <input
 type="text"
 value={tempData.lastName}
 onChange={(e) => setTempData({ ...tempData, lastName: e.target.value })}
 data-testid="profile-last-name-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 placeholder="Enter last name"
 aria-label="Last name"
 id="lastName"
 name="lastName"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
 <User size={12} className="text-gray-400" /> Gender
 </label>
 <select
 value={tempData.gender}
 onChange={(e) => setTempData({ ...tempData, gender: e.target.value as ProfileData['gender'] })}
 data-testid="profile-gender-select"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 aria-label="Select gender"
 id="gender"
 name="gender"
 >
 <option data-testid="user-profile-select-gender" value="">Select gender</option>
 <option data-testid="user-profile-male" value="male">Male</option>
 <option data-testid="user-profile-female" value="female">Female</option>
 <option data-testid="user-profile-non-binary" value="non-binary">Non-binary</option>
 <option data-testid="user-profile-prefer-not-to-say" value="prefer-not-to-say">Prefer not to say</option>
 </select>
 </div>
 <div>
  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
  <Calendar size={12} className="text-gray-400" /> Date of Birth
  </label>
  <div data-testid="user-profile-div" 
     className="relative group w-full" 
     onClick={(e) => {
       const input = e.currentTarget.querySelector('input');
       if (input) (input as any).showPicker?.();
     }}
   >
     <div className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 text-sm text-left flex items-center justify-between bg-white min-h-[46px] cursor-pointer">
       <span className={tempData.dateOfBirth ? "text-gray-900" : "text-gray-400"}>
         {(() => {
           if (!tempData.dateOfBirth) return 'Select Date';
           try {
             const date = new Date(tempData.dateOfBirth);
             if (isNaN(date.getTime())) return tempData.dateOfBirth;
             const day = String(date.getDate()).padStart(2, '0');
             const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
             return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
           } catch (err) {
             return tempData.dateOfBirth;
           }
         })()}
       </span>
       <Calendar size={14} className="text-gray-400" />
     </div>
     <input
       type="date"
       value={tempData.dateOfBirth}
       onChange={(e) => setTempData({ ...tempData, dateOfBirth: e.target.value })}
       data-testid="profile-dob-input"
       className="absolute inset-0 opacity-0 cursor-pointer z-20"
       max={new Date().toISOString().split('T')[0]}
       aria-label="Date of birth"
       id="dateOfBirth"
       name="dateOfBirth"
     />
   </div>
  </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
 <Briefcase size={12} className="text-gray-400" /> Job Type
 </label>
 <select
 value={tempData.jobType}
 onChange={(e) => setTempData({ ...tempData, jobType: e.target.value as any })}
 data-testid="profile-job-type-select"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 aria-label="Select job type"
 id="jobType"
 name="jobType"
 >
 <option data-testid="user-profile-select-job-type" value="">Select job type</option>
 <option data-testid="user-profile-salaried-employed" value="salaried">Salaried / Employed</option>
 <option data-testid="user-profile-self-employed-business-owner" value="businessman">Self-employed / Business Owner</option>
 <option data-testid="user-profile-freelancer" value="freelancer">Freelancer</option>
 </select>
 </div>
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
 <span className="text-gray-400 font-bold text-sm"></span> Monthly Income
 </label>
 <input
 type="number"
 value={tempData.monthlyIncome || ''}
 onChange={(e) => setTempData({ ...tempData, monthlyIncome: parseFloat(e.target.value) || 0 })}
 data-testid="profile-income-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 placeholder="0.00"
 id="monthlyIncome"
 name="monthlyIncome"
 />
 </div>
 </div>

 <button
 onClick={handleSaveProfile}
 disabled={isLoading}
 data-testid="profile-save-basic-button"
 className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors"
 >
 {isLoading ? 'Saving...' : 'Save Changes'}
 </button>
 </div>
 )}
 </Card>
 </motion.div>

 {/* Location & Currency Card */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.15 }}
 >
 <Card data-testid="user-profile-card-8" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
 {/* Header row */}
 <div className="flex items-center justify-between mb-5">
 <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
 <MapPin size={18} className="text-blue-500" /> Location &amp; Currency
 </h3>
 <button
 onClick={() => {
 setIsEditingLocation(!isEditingLocation);
 if (isEditingLocation) setTempData(profileData);
 }}
 data-testid="profile-edit-location-button"
 className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isEditingLocation
 ? 'bg-red-50 text-red-600 hover:bg-red-100'
 : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
 }`}
 >
 {isEditingLocation ? 'Cancel' : 'Edit'}
 </button>
 </div>

 {!isEditingLocation ? (
 <div className="divide-y divide-gray-100">
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <MapPin size={14} className="text-gray-400" /> Country
 </span>
 <span className="text-sm font-semibold text-gray-900">{profileData.country || ''}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <MapPin size={14} className="text-gray-400" /> State / Province
 </span>
 <span className="text-sm font-semibold text-gray-900">{profileData.state || ''}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <MapPin size={14} className="text-gray-400" /> City
 </span>
 <span className="text-sm font-semibold text-gray-900">{profileData.city || ''}</span>
 </div>
 <div className="flex items-center justify-between py-3.5">
 <span className="text-sm text-gray-500 flex items-center gap-2">
 <DollarSign size={14} className="text-gray-400" /> Currency
 </span>
 <span className="text-sm font-semibold text-gray-900">{currency}</span>
 </div>
 </div>
 ) : (
 <div className="space-y-6">
 {/* Unified Location Search */}
 <div className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
 <MapPin size={12} className="text-gray-400" /> Search City
 </label>
 <div className="relative">
 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
 <MapPin size={16} />
 </div>
 <input
 type="text"
 value={tempData.city}
 onChange={(e) => handleCitySearch(e.target.value)}
 data-testid="profile-city-search-input"
 className={`w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all ${
 isSearchingCity ? 'border-blue-200 bg-blue-50/10' : ''
 }`}
 placeholder="Type city name (e.g. Chennai)"
 id="city-search"
 autoComplete="off"
 />
 {isSearchingCity && (
 <div className="absolute right-3 top-1/2 -translate-y-1/2">
 <motion.div
 animate={{ rotate: 360 }}
 transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
 >
 <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
 </motion.div>
 </div>
 )}

 {/* Suggestions Dropdown */}
 {citySuggestions.length > 0 && (
 <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
 {citySuggestions.map((suggestion, idx) => (
 <button
 key={idx}
 onClick={() => handleSelectCity(suggestion)}
 data-testid={`profile-city-suggest-${idx}`}
 className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 flex flex-col"
 >
 <span className="text-sm font-semibold text-gray-900">
 {suggestion.address.city || suggestion.address.town || suggestion.address.village || suggestion.display_name.split(',')[0]}
 </span>
 <span className="text-xs text-gray-500 truncate">
 {suggestion.display_name}
 </span>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Resolved Location Details */}
 {(tempData.city || tempData.state || tempData.country) && (
 <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2 animate-in zoom-in-95 duration-200">
 <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Detected Location</p>
 <div className="flex items-start gap-2">
 <MapPin size={14} className="text-blue-500 mt-0.5" />
 <p className="text-sm text-gray-900 font-medium leading-relaxed">
 {[tempData.city, tempData.state, tempData.country].filter(Boolean).join(', ')}
 </p>
 </div>
 </div>
 )}
 </div>

 {/* Currency Section */}
 <div className="pt-4 border-t border-gray-100">
 <label htmlFor="currency-select" className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
 <DollarSign size={12} className="text-gray-400" /> Currency Settings
 </label>
 <select
 id="currency-select"
 title="Currency Settings"
 value={currency}
 onChange={(e) => setCurrency(e.target.value)}
 data-testid="profile-currency-select"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
 >
 <option data-testid="user-profile-usd-us-dollar" value="USD">USD - US Dollar</option>
 <option data-testid="user-profile-eur-euro" value="EUR">EUR - Euro</option>
 <option data-testid="user-profile-gbp-british-pound" value="GBP">GBP - British Pound</option>
 <option data-testid="user-profile-inr-indian-rupee" value="INR">INR - Indian Rupee</option>
 <option data-testid="user-profile-jpy-japanese-yen" value="JPY">JPY - Japanese Yen</option>
 <option data-testid="user-profile-aud-australian-dollar" value="AUD">AUD - Australian Dollar</option>
 <option data-testid="user-profile-cad-canadian-dollar" value="CAD">CAD - Canadian Dollar</option>
 <option data-testid="user-profile-chf-swiss-franc" value="CHF">CHF - Swiss Franc</option>
 <option data-testid="user-profile-cny-chinese-yuan" value="CNY">CNY - Chinese Yuan</option>
 <option data-testid="user-profile-sgd-singapore-dollar" value="SGD">SGD - Singapore Dollar</option>
 </select>
 <p className="mt-2 text-[10px] text-gray-400 italic">
 Currency updates automatically based on selected city, but can be overridden manually.
 </p>
 </div>

 <button
 onClick={handleSaveProfile}
 disabled={isLoading}
 data-testid="profile-save-location-button"
 className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
 >
 {isLoading ? 'Saving...' : 'Save Location & Currency'}
 </button>
 </div>
 )}
 </Card>
 </motion.div>
 </div>{/* end left col */}

 {/* RIGHT COLUMN */}
 <div className="space-y-6 min-w-0">



 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 }}
 >
 <Card data-testid="user-profile-card-9" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
 <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
 <Lock size={20} className="text-orange-600" />
 Secure Information
 </h3>

 {/* Email Section */}
 <div className="mb-5 pb-5 border-b border-gray-200">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <Mail size={20} className="text-blue-600" />
 <div>
 <p className="font-medium text-gray-900">Email Address</p>
 <p className="text-sm text-gray-500">Change via mobile verification</p>
 </div>
 </div>
 <Lock size={18} className="text-orange-500" />
 </div>

 {verification.type !== 'email-change' ? (
 <>
 <p className="text-gray-900 font-medium text-sm mb-3 break-all">{profileData.email}</p>
 <button
 onClick={() =>
 setVerification({
 type: 'email-change',
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-change-email-button"
 className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2 rounded-lg font-medium transition-colors"
 >
 Change Email
 </button>
 </>
 ) : (
 <div className="space-y-4">
 {verification.step === 'request' && (
 <>
 <input
 type="email"
 placeholder="Enter new email"
 value={verification.newValue}
 onChange={(e) =>
 setVerification({ ...verification, newValue: e.target.value })
 }
 data-testid="profile-new-email-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 id="newEmail"
 name="newEmail"
 />
 <div className="flex gap-3">
 <button
 onClick={handleChangeEmail}
 data-testid="profile-send-email-otp-button"
 className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
 >
 Send OTP to Mobile
 </button>
 <button
 onClick={() =>
 setVerification({
 type: null,
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-cancel-email-change-button"
 className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-lg font-medium transition-colors"
 >
 Cancel
 </button>
 </div>
 </>
 )}

 {verification.step === 'otp-sent' && (
 <>
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
 <p className="text-sm text-blue-800">
 OTP sent to your registered mobile number
 </p>
 </div>
 <input
 type="text"
 placeholder="Enter 6-digit OTP"
 value={verification.otp}
 onChange={(e) => setVerification({ ...verification, otp: e.target.value })}
 maxLength={6}
 data-testid="profile-email-otp-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
 />
 <p className="text-xs text-gray-500 mt-2">Use code: 123456 (Demo)</p>
 <div className="flex gap-3 mt-4">
 <button
 onClick={handleVerifyEmailOTP}
 data-testid="profile-verify-email-otp-button"
 className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
 >
 Verify OTP
 </button>
 <button
 onClick={() =>
 setVerification({
 type: null,
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-cancel-email-otp-button"
 className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-lg font-medium transition-colors"
 >
 Cancel
 </button>
 </div>
 </>
 )}
 </div>
 )}
 </div>


 <div>
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <Phone size={20} className="text-green-600" />
 <div>
 <p className="font-medium text-gray-900">Mobile Number</p>
 <p className="text-sm text-gray-500">Change via email verification</p>
 </div>
 </div>
 <Lock size={18} className="text-orange-500" />
 </div>

 {verification.type !== 'mobile-change' ? (
 <>
 <p className="text-gray-900 font-medium text-lg mb-4">{profileData.mobile}</p>
 <button
 onClick={() =>
 setVerification({
 type: 'mobile-change',
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-change-mobile-button"
 className="bg-green-50 hover:bg-green-100 text-green-600 px-4 py-2 rounded-lg font-medium transition-colors"
 >
 Change Mobile
 </button>
 </>
 ) : (
 <div className="space-y-4">
 {verification.step === 'request' && (
 <>
 <input
 type="tel"
 placeholder="Enter new mobile number"
 value={verification.newValue}
 onChange={(e) =>
 setVerification({ ...verification, newValue: e.target.value })
 }
 data-testid="profile-new-mobile-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 id="newMobile"
 name="newMobile"
 />
 <div className="flex gap-3">
 <button
 onClick={handleChangeMobile}
 data-testid="profile-send-mobile-otp-button"
 className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
 >
 Send OTP to Email
 </button>
 <button
 onClick={() =>
 setVerification({
 type: null,
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-cancel-mobile-change-button"
 className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-lg font-medium transition-colors"
 >
 Cancel
 </button>
 </div>
 </>
 )}

 {verification.step === 'otp-sent' && (
 <>
 <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
 <p className="text-sm text-green-800">
 OTP sent to your registered email
 </p>
 </div>
 <input
 type="text"
 placeholder="Enter 6-digit OTP"
 value={verification.otp}
 onChange={(e) => setVerification({ ...verification, otp: e.target.value })}
 maxLength={6}
 data-testid="profile-mobile-otp-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
 id="emailOtp"
 name="emailOtp"
 />
 <p className="text-xs text-gray-500 mt-2">Use code: 123456 (Demo)</p>
 <div className="flex gap-3 mt-4">
 <button
 onClick={handleVerifyMobileOTP}
 data-testid="profile-verify-mobile-otp-button"
 className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
 >
 Verify OTP
 </button>
 <button
 onClick={() =>
 setVerification({
 type: null,
 otp: '',
 newValue: '',
 step: 'request',
 })
 }
 data-testid="profile-cancel-mobile-otp-button"
 className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-lg font-medium transition-colors"
 >
 Cancel
 </button>
 </div>
 </>
 )}
 </div>
 )}
 </div>
 </Card>
 </motion.div>

 {/* Change PIN Section */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.35 }}
 >
 <Card data-testid="user-profile-card-10" variant="flat" className="overflow-hidden relative shadow-[0px_1px_2px_rgba(0,0,0,0.04),_0px_4px_12px_rgba(0,0,0,0.06)] bg-white border border-gray-200 rounded-2xl p-6 lg:p-8">
 <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
 <KeyRound size={20} className="text-blue-600" />
 Security &amp; PIN
 </h3>

 <div className="space-y-4">
 {pinChangeStep === 'idle' ? (
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200">
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-gray-900">Change Secure PIN</p>
 <p className="text-sm text-gray-500 mt-0.5">Use your current PIN to update your 6-digit access PIN</p>
 </div>
 <Button
 onClick={() => setPinChangeStep('set-new-pin')}
 disabled={isPinLoading}
 data-testid="profile-change-pin-button"
 className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 shrink-0 whitespace-nowrap"
 >
 {isPinLoading ? 'Updating...' : 'Change PIN'}
 </Button>
 </div>
 ) : (
 <form data-testid="user-profile-form"
  onSubmit={(e) => {
    e.preventDefault();
    if (!isPinLoading && currentPin.length === 6 && newPin.length === 6 && newPin === confirmNewPin && !isPinWeak) {
      handleSetNewPin();
    }
  }}
  className="p-4 bg-green-50 rounded-xl border border-green-100 space-y-4"
  >
  <div className="flex items-center justify-between">
  <p className="font-semibold text-green-900">Set New PIN</p>
  <button type="button" onClick={resetPinFlow} data-testid="profile-cancel-pin-button" className="text-xs text-green-600 hover:underline">Cancel</button>
  </div>

  <div className="space-y-3">
  <div className="relative">
  <input
  type={showNewPin ? 'text' : 'password'}
  placeholder="Enter current 6-digit PIN"
  value={currentPin}
  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
  autoComplete="new-password"
  data-testid="profile-current-pin-input"
  className="w-full px-4 py-2.5 rounded-xl border border-green-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none text-center font-mono text-lg tracking-widest"
  />
  </div>

  <div className="relative">
  <input
  type={showNewPin ? 'text' : 'password'}
  placeholder="Enter new 6-digit PIN"
  value={newPin}
  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
  autoComplete="new-password"
  data-testid="profile-new-pin-input"
  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-center font-mono text-lg tracking-widest transition-all ${
    isPinWeak
      ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/30'
      : 'border-green-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white'
  }`}
  />
  <button data-testid="user-profile-button"
  type="button"
  onClick={() => setShowNewPin(!showNewPin)}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
  >
  {showNewPin ? <EyeOff size={18} /> : <Eye size={18} />}
  </button>
  </div>

  {isPinWeak && (
  <p className="text-xs text-red-600 font-semibold flex items-center justify-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
  <ShieldAlert size={14} className="shrink-0" />
  PIN is too weak. Avoid sequential or repeating patterns.
  </p>
  )}

  <input
  type={showNewPin ? 'text' : 'password'}
  placeholder="Confirm new PIN"
  value={confirmNewPin}
  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
  autoComplete="new-password"
  data-testid="profile-confirm-pin-input"
  className="w-full px-4 py-2.5 rounded-xl border border-green-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none text-center font-mono text-lg tracking-widest"
  />

  <Button
  type="submit"
  data-testid="profile-update-pin-button"
  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 mt-2"
  disabled={isPinLoading || currentPin.length !== 6 || newPin.length !== 6 || newPin !== confirmNewPin || isPinWeak}
  >
  {isPinLoading ? 'Updating Secure PIN...' : 'Update Secure PIN'}
  </Button>
  </div>
  </form>
 )}
 </div>
 </Card>
 </motion.div>

 {/* Advisor Role Section */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.35 }}
 >
 <AdvisorRoleSection
 userRole={role}
 userName={`${profileData.firstName} ${profileData.lastName}`.trim() || user?.email || ''}
 userEmail={profileData.email || user?.email || ''}
 />
 </motion.div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
 {/* Sign Out */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.4 }}
 >
 <Card data-testid="user-profile-card-11" className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col justify-between">
 <div className="flex items-start gap-3 mb-5">
 <div className="w-9 h-9 bg-orange-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
 <LogOut size={15} className="text-orange-500" />
 </div>
 <div className="min-w-0">
 <p className="font-semibold text-gray-900 text-sm">Signed in as</p>
 <p className="text-xs text-gray-500 mt-0.5 truncate">{user?.email}</p>
 </div>
 </div>
 <button
 onClick={handleSignOut}
 disabled={isSigningOut}
 data-testid="profile-signout-button"
 className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium text-sm transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 <LogOut size={15} />
 {isSigningOut ? 'Signing Out...' : 'Sign Out'}
 </button>
 </Card>
 </motion.div>
 {/* Danger Zone */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.5 }}
 >
 <Card data-testid="user-profile-card-12" className="bg-red-50 border border-red-200 rounded-2xl p-6 h-full flex flex-col justify-between">
 <div className="flex items-start gap-3 mb-4">
 <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
 <ShieldAlert size={15} className="text-red-600" />
 </div>
 <div>
 <h3 className="font-semibold text-red-900 text-sm">Danger Zone</h3>
 <p className="text-xs text-red-700 mt-0.5 leading-relaxed">Permanently delete your account and all data. This cannot be undone.</p>
 </div>
 </div>

 <button
 onClick={() => setIsDeleteModalOpen(true)}
 data-testid="profile-delete-account-button"
 className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
 >
 <Trash2 size={18} />
 Delete Account
 </button>
 </Card>
 </motion.div>
 </div>{/* end 2-col bottom */}
 </div>{/* end right col */}
 </div>
 </div>{/* end px wrapper */}
 </div>{/* end max-w-7xl */}

 {/* Delete Account Modal (Popup) */}
 {isDeleteModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
 <motion.div
 initial={{ scale: 0.95, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative"
 >
 <div className="bg-gradient-to-br from-red-600 to-rose-700 p-6 text-white relative">
 <button
 type="button"
 onClick={() => {
 setIsDeleteModalOpen(false);
 setDeletePassword('');
 }}
 aria-label="Close delete account dialog"
 title="Close delete account dialog"
 data-testid="profile-delete-close-button"
 className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-1.5 rounded-full transition-colors"
 >
 <X size={20} />
 </button>
 <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-4">
 <Trash2 size={24} className="text-white" />
 </div>
 <h3 className="text-xl font-bold">Delete Account</h3>
 <p className="text-red-100 text-sm mt-1">
 You are about to permanently delete your KANAKUaccount.
 All your tracked accounts, transactions, and data will be erased.
 </p>
 </div>

 <div className="p-6">
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Verify your password to continue
 </label>
 <input
 type="password"
 placeholder="Enter your password"
 value={deletePassword}
 onChange={(e) => setDeletePassword(e.target.value)}
 data-testid="profile-delete-password-input"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 mb-6"
 />

 <div className="flex gap-3">
 <button
 onClick={() => setIsDeleteModalOpen(false)}
 data-testid="profile-delete-cancel-button"
 className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-medium transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleDeleteAccount}
 disabled={isDeleting || !deletePassword}
 data-testid="profile-delete-confirm-button"
 className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
 >
 {isDeleting ? 'Deleting...' : 'Delete Permanently'}
 </button>
 </div>
 </div>
 </motion.div>
 </div>
 )}
 </div>{/* end outer pb-32 div */}

 {/* ━━━ Floating Save & Discard Action Bar ━━━
     Appears above bottom nav when in edit mode or when there are unsaved changes.
     Glass-morphism style, always visible while scrolling, keyboard-aware.
 */}
 <AnimatePresence>
  {showFloatingBar && (
   <motion.div
    key="floating-save-bar"
    initial={{ opacity: 0, y: 24, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 24, scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px)+16px)] left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
   >
    <div
     className="pointer-events-auto w-full max-w-sm flex items-center gap-3 px-4 py-3 rounded-[20px] shadow-2xl bg-white/[0.88] backdrop-blur-[20px] border border-white/60"
    >
     {/* Unsaved changes indicator */}
     <div className="flex-1 flex items-center gap-2 min-w-0">
      {hasDirtyChanges && (
       <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 flex-shrink-0"
       >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest whitespace-nowrap">Unsaved Changes</span>
       </motion.div>
      )}
      {!hasDirtyChanges && (
       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Editing Profile</span>
      )}
     </div>

     {/* Discard Button */}
     <button
      id="floating-discard-btn"
      onClick={handleDiscard}
      disabled={isLoading}
      data-testid="profile-floating-discard-button"
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-[14px] text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
     >
      <RotateCcw size={12} />
      Discard
     </button>

     {/* Save Button */}
     <button
      id="floating-save-btn"
      onClick={handleSaveProfile}
      disabled={isLoading}
      data-testid="profile-floating-save-button"
      className={`flex items-center gap-1.5 px-5 py-2.5 rounded-[14px] text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-60 flex-shrink-0 shadow-[0_4px_12px_rgba(79,70,229,0.35)] ${isLoading ? 'bg-blue-400/60' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}
     >
      {isLoading ? (
       <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
       <Save size={12} />
      )}
      {isLoading ? 'Saving...' : 'Save Changes'}
     </button>
    </div>
   </motion.div>
  )}
 </AnimatePresence>

 </>
 );
};




