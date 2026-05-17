import React, { useState, useEffect } from 'react';
import { enhancedSyncService } from '../../lib/enhanced-sync';
import { getDeviceInfo } from '../../utils/device';

interface OnboardingStep4Props {
 data: {
 email: string;
 password: string;
 firstName: string;
 lastName: string;
 salary: string;
 dateOfBirth: string;
 jobType: string;
 pin: string;
 };
 onComplete: () => void;
 onBack: () => void;
}

export const OnboardingStep4: React.FC<OnboardingStep4Props> = ({
 data,
 onComplete,
 onBack,
}) => {
 const [isSyncing, setIsSyncing] = useState(false);
 const [syncProgress, setSyncProgress] = useState(0);
 const [syncStatus, setSyncStatus] = useState('');
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 // Auto-start sync when component mounts
 startOnboardingProcess();
 }, []);

 const startOnboardingProcess = async () => {
 setIsSyncing(true);
 setSyncProgress(0);
 setError(null);

 try {
 // Step 1: Register user account
 setSyncStatus('Creating your account...');
 setSyncProgress(20);
 
 const registerResponse = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/register`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 email: data.email,
 password: data.password,
 name: `${data.firstName} ${data.lastName}`,
 firstName: data.firstName,
 lastName: data.lastName,
 salary: parseFloat(data.salary),
 dateOfBirth: new Date(data.dateOfBirth),
 jobType: data.jobType,
 }),
 });

 if (!registerResponse.ok) {
 const errorData = await registerResponse.json();
 throw new Error(errorData.error || 'Failed to create account');
 }

 const { accessToken } = await registerResponse.json();
 localStorage.setItem('auth_token', accessToken);

 // Step 2: Login to get user session
 setSyncStatus('Setting up your session...');
 setSyncProgress(40);

 const loginResponse = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/login`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 email: data.email,
 password: data.password,
 }),
 });

 if (!loginResponse.ok) {
 throw new Error('Failed to login');
 }

 const loginData = await loginResponse.json();
 localStorage.setItem('auth_token', loginData.accessToken);
 localStorage.setItem('refresh_token', loginData.refreshToken);

 // Step 3: Initialize sync service
 setSyncStatus('Initializing sync service...');
 setSyncProgress(60);

 const userResponse = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/user`, {
 headers: {
 'Authorization': `Bearer ${loginData.accessToken}`,
 },
 });

 if (!userResponse.ok) {
 throw new Error('Failed to get user info');
 }

 const userData = await userResponse.json();

 await enhancedSyncService.initialize(loginData.accessToken, userData.id);

 // Step 4: Initial sync
 setSyncStatus('Performing initial sync...');
 setSyncProgress(80);

 const syncResult = await enhancedSyncService.fullSync(userData.id);

 if (!syncResult.success) {
 console.warn('Initial sync had issues:', syncResult.errors);
 // Don't fail onboarding for sync issues
 }

 // Step 5: Complete onboarding
 setSyncStatus('Setting up your dashboard...');
 setSyncProgress(100);

 // Store onboarding completion
 localStorage.setItem('onboarding_completed', 'true');
 localStorage.setItem('user_email', data.email);
 localStorage.setItem('user_name', `${data.firstName} ${data.lastName}`);

 setTimeout(() => {
 onComplete();
 }, 1000);

 } catch (error) {
 console.error('Onboarding failed:', error);
 setError(error instanceof Error ? error.message : 'Onboarding failed');
 setIsSyncing(false);
 }
 };

 const retryOnboarding = () => {
 startOnboardingProcess();
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
 <button
 onClick={onBack}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
 >
 Back
 </button>
 <button
 onClick={retryOnboarding}
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
 Final Setup
 </h3>
 <p className="text-sm text-gray-600">
 We're setting up your account and syncing your data. This will only take a moment.
 </p>
 </div>

 {/* Progress Indicator */}
 <div className="space-y-3">
 <div className="flex justify-between text-sm text-gray-600">
 <span>{syncStatus}</span>
 <span>{syncProgress}%</span>
 </div>
 
 <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" aria-hidden="true">
 <svg
 className="block h-full w-full"
 viewBox="0 0 100 2"
 preserveAspectRatio="none"
 aria-hidden="true"
 >
 <rect width="100" height="2" className="fill-gray-200" />
 <rect
 width={syncProgress}
 height="2"
 rx="1"
 className="fill-blue-600"
 />
 </svg>
 </div>
 <progress
 className="sr-only"
 value={syncProgress}
 max={100}
 aria-label="Account setup progress"
 >
 {syncProgress}%
 </progress>
 </div>

 {/* Device Info */}
 <div className="bg-white rounded-lg p-4 text-left">
 <h4 className="text-sm font-medium text-gray-700 mb-2">Device Information</h4>
 <div className="text-xs text-gray-600 space-y-1">
 <p><strong>Device ID:</strong> {getDeviceInfo().deviceId}</p>
 <p><strong>Device Type:</strong> {getDeviceInfo().deviceType}</p>
 <p><strong>Platform:</strong> {getDeviceInfo().platform}</p>
 </div>
 </div>

 {/* Success Message */}
 {syncProgress === 100 && (
 <div className="bg-green-50 border border-green-200 rounded-lg p-4">
 <div className="text-green-600 mb-2">
 <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 </div>
 <h3 className="text-lg font-medium text-green-800 mb-2">
 Setup Complete!
 </h3>
 <p className="text-green-700 text-sm">
 Your account is ready. You'll be redirected to your dashboard shortly.
 </p>
 </div>
 )}

 {/* Loading Spinner */}
 {isSyncing && syncProgress < 100 && (
 <div className="flex justify-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
 </div>
 )}

 <div className="flex space-x-3">
 <button
 onClick={onBack}
 disabled={isSyncing}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
 >
 Back
 </button>
 </div>
 </div>
 );
};
