import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const AuthCallback: React.FC = () => {
 const { setCurrentPage } = useApp();
 const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

 useEffect(() => {
 const handleAuthCallback = async () => {
 try {
 // Get the hash from URL (contains access_token and refresh_token)
 const hashParams = new URLSearchParams(window.location.hash.substring(1));
 const accessToken = hashParams.get('access_token');
 const refreshToken = hashParams.get('refresh_token');
 const type = hashParams.get('type');
 const error = hashParams.get('error');
 const errorDescription = hashParams.get('error_description');

 // Check for errors in URL
 if (error) {
 console.error('Auth callback error:', error, errorDescription);
 setStatus('error');
 toast.error(errorDescription || 'Email verification failed');
 setTimeout(() => setCurrentPage('dashboard'), 3000);
 return;
 }

 // Handle email confirmation
 if (type === 'signup' && accessToken && refreshToken) {
 // Set the session with the tokens
 const { data, error: sessionError } = await supabase.auth.setSession({
 access_token: accessToken,
 refresh_token: refreshToken,
 });

 if (sessionError) {
 console.error('Session error:', sessionError);
 setStatus('error');
 toast.error('Failed to verify email. Please try again.');
 setTimeout(() => setCurrentPage('dashboard'), 3000);
 return;
 }

 // Success!
 setStatus('success');
 toast.success('Email verified successfully! Welcome to KANKU.');

 // Redirect to dashboard after 2 seconds
 setTimeout(() => setCurrentPage('dashboard'), 2000);
 } else {
 // No valid tokens, redirect to dashboard
 console.log('No valid auth tokens found');
 setCurrentPage('dashboard');
 }
 } catch (err) {
 console.error('Error handling auth callback:', err);
 setStatus('error');
 toast.error('Something went wrong. Please try logging in.');
 setTimeout(() => setCurrentPage('dashboard'), 3000);
 }
 };

 handleAuthCallback();
 }, [setCurrentPage]);

 return (
 <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
 <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full mx-4">
 {status === 'verifying' && (
 <div className="text-center">
 <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
 <h2 className="text-2xl font-bold text-gray-800 mb-2">Verifying Email</h2>
 <p className="text-gray-600">Please wait while we verify your email...</p>
 </div>
 )}

 {status === 'success' && (
 <div className="text-center">
 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
 <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 <h2 className="text-2xl font-bold text-gray-800 mb-2">Email Verified!</h2>
 <p className="text-gray-600">Your email has been verified successfully. Redirecting to dashboard...</p>
 </div>
 )}

 {status === 'error' && (
 <div className="text-center">
 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
 <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </div>
 <h2 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h2>
 <p className="text-gray-600">Unable to verify your email. You'll be redirected shortly.</p>
 </div>
 )}
 </div>
 </div>
 );
};
