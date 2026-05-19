import React, { useMemo, useState } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import { ChevronLeft, RefreshCw, Copy, ExternalLink, Database, Trash2, ShieldCheck, Users, Star, AlertCircle } from 'lucide-react';
import { db } from '@/lib/database';
import { deduplicateLocalData } from '@/lib/auth-sync-integration';

export const Diagnostics: React.FC = () => {
 const { setCurrentPage } = useApp();
 const [isTesting, setIsTesting] = useState(false);
 const [isCleaning, setIsCleaning] = useState(false);
 const [testResult, setTestResult] = useState<string>('Not tested');

 const envStatus = useMemo(() => {
 const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
 const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

 return {
 mode: import.meta.env.MODE,
 supabaseUrl: !!supabaseUrl,
 supabaseKey: !!supabaseKey,
 online: navigator.onLine,
 };
 }, []);

 const handleSupabaseTest = async () => {
 setIsTesting(true);
 setTestResult('Testing...');

 try {
 const { data, error } = await supabase.auth.getSession();
 if (error) {
 setTestResult(`Error: ${error.message}`);
 toast.error('Supabase session check failed');
 return;
 }
 const hasSession = !!data.session;
 setTestResult(hasSession ? 'OK (session active)' : 'OK (no session)');
 toast.success('Supabase check successful');
 } catch (error) {
 console.error('Supabase test failed:', error);
 setTestResult('Error: unexpected failure');
 toast.error('Supabase test failed');
 } finally {
 setIsTesting(false);
 }
 };

 const handleCopyEnvVars = () => {
 const url = import.meta.env.VITE_SUPABASE_URL || '<your-supabase-url>';
 // Never hardcode keys here - read from env only
 const envVars = `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-anon-key>`;
 navigator.clipboard.writeText(envVars);
 toast.success('Template copied - fill in your actual key from the Supabase dashboard');
 };

 const handleDeduplicate = async () => {
 setIsCleaning(true);
 try {
 await deduplicateLocalData();
 toast.success('Database deduplication complete');
 } catch (error) {
 console.error('Deduplication failed:', error);
 toast.error('Failed to deduplicate data');
 } finally {
 setIsCleaning(false);
 }
 };

 const handleResetDatabase = async () => {
 if (!window.confirm('Are you sure? This will wipe ALL local data and require a fresh sync from the cloud.')) {
 return;
 }

 try {
 // Close database connection first to avoid conflicts
 db.close();
 
 // Re-open to clear
 await db.open();
 await Promise.all(db.tables.map(table => table.clear()));
 
 toast.success('Local database cleared. Reloading...');
 setTimeout(() => window.location.reload(), 1500);
 } catch (error) {
 console.error('Reset failed:', error);
 toast.error('Failed to reset database');
 }
 };

 const handleMockLogin = (targetRole: 'admin' | 'manager' | 'advisor') => {
 if (import.meta.env.PROD) {
 toast.error('Mock login is disabled in production.');
 return;
 }

 const mockUser = {
 id: `mock-${targetRole}-id`,
 email: `${targetRole}@kanku.com`,
 user_metadata: { role: targetRole, full_name: `Mock ${targetRole}` },
 aud: 'authenticated',
 role: 'authenticated',
 };

 // Store mock session info
 localStorage.setItem('supabase.auth.token', JSON.stringify({
 currentSession: {
 access_token: 'mock-token',
 refresh_token: 'mock-refresh',
 user: mockUser,
 expires_at: Math.floor(Date.now() / 1000) + 3600
 }
 }));
 
 localStorage.setItem('user_role', targetRole);
 localStorage.setItem('onboarding_completed', 'true');
 
 toast.success(`Forcing session as ${targetRole.toUpperCase()}...`);
 setTimeout(() => window.location.reload(), 1000);
 };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 <div className="flex items-center gap-3">
 <button
 onClick={() => setCurrentPage('dashboard')}
 className="lg:!hidden p-2 hover:bg-white rounded-xl transition-all"
 >
 <ChevronLeft size={20} className="text-gray-900" />
 </button>
 <h2 className="text-2xl font-black text-gray-900 tracking-tight">Diagnostics</h2>
 </div>

 <div className="bg-white rounded-[2rem] border border-gray-100 p-8 space-y-6 shadow-sm">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
 <ShieldCheck size={20} className="text-pink-600" />
 </div>
 <div>
 <h3 className="text-lg font-black text-gray-900">Dev: Auth & Role Bypass</h3>
 <p className="text-sm text-gray-500 font-medium">Instantly switch roles to test RBAC logic without real credentials.</p>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
 <button
 onClick={() => handleMockLogin('admin')}
 className="flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-[1.5rem] font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
 >
 <ShieldCheck size={18} />
 Login as Admin
 </button>
 <button
 onClick={() => handleMockLogin('manager')}
 className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-[1.5rem] font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
 >
 <Users size={18} />
 Login as Manager
 </button>
 <button
 onClick={() => handleMockLogin('advisor')}
 className="flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-[1.5rem] font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
 >
 <Star size={18} />
 Login as Advisor
 </button>
 </div>
 
 <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
 <AlertCircle size={18} className="text-amber-600 mt-0.5" />
 <p className="text-xs text-amber-800 font-medium leading-relaxed">
 <b>Development Only:</b> These buttons inject a mock session into local storage. This allows you to test role-specific UI like the <i>Advisor Verification Queue</i> immediately. Real authentication is bypassed.
 </p>
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-gray-500">Build mode</p>
 <p className="text-lg font-semibold text-gray-900">{envStatus.mode}</p>
 </div>
 <div>
 <p className="text-sm text-gray-500">Online</p>
 <p className={`text-lg font-semibold ${envStatus.online ? 'text-green-600' : 'text-red-600'}`}>
 {envStatus.online ? 'Yes' : 'No'}
 </p>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
 <div className="rounded-lg border border-gray-200 p-4">
 <p className="text-sm text-gray-500">VITE_SUPABASE_URL</p>
 <p className={`text-base font-semibold ${envStatus.supabaseUrl ? 'text-green-600' : 'text-red-600'}`}>
 {envStatus.supabaseUrl ? 'Present' : 'Missing'}
 </p>
 </div>
 <div className="rounded-lg border border-gray-200 p-4">
 <p className="text-sm text-gray-500">VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</p>
 <p className={`text-base font-semibold ${envStatus.supabaseKey ? 'text-green-600' : 'text-red-600'}`}>
 {envStatus.supabaseKey ? 'Present' : 'Missing'}
 </p>
 </div>
 </div>

 <div className="rounded-lg border border-gray-200 p-4">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="text-sm text-gray-500">Supabase session test</p>
 <p className="text-base font-semibold text-gray-900">{testResult}</p>
 </div>
 <button
 onClick={handleSupabaseTest}
 disabled={isTesting}
 className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300"
 >
 <RefreshCw size={16} className={isTesting ? 'animate-spin' : ''} />
 {isTesting ? 'Testing...' : 'Run test'}
 </button>
 </div>
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
 <div className="flex items-center gap-2">
 <Database size={20} className="text-gray-900" />
 <h3 className="text-lg font-semibold text-gray-900">Database Maintenance</h3>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div className="rounded-xl border border-gray-200 p-5 space-y-3 bg-white/50 hover:bg-white transition-all">
 <div className="flex items-center gap-2 text-blue-600">
 <ShieldCheck size={18} />
 <h4 className="font-semibold">Purge Duplicates</h4>
 </div>
 <p className="text-sm text-gray-600">
 Merges redundant accounts and transactions by matching dates, amounts, and descriptions.
 </p>
 <button
 onClick={handleDeduplicate}
 disabled={isCleaning}
 className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all disabled:opacity-50"
 >
 {isCleaning ? <RefreshCw size={16} className="animate-spin" /> : <Database size={16} />}
 {isCleaning ? 'Cleaning...' : 'Deduplicate Now'}
 </button>
 </div>

 <div className="rounded-xl border border-red-100 p-5 space-y-3 bg-red-50/30 hover:bg-white transition-all">
 <div className="flex items-center gap-2 text-red-600">
 <Trash2 size={18} />
 <h4 className="font-semibold">Factory Reset</h4>
 </div>
 <p className="text-sm text-gray-600">
 Wipes all local data. Use this if your database feels corrupted. Data will re-sync from cloud.
 </p>
 <button
 onClick={handleResetDatabase}
 className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm"
 >
 <Trash2 size={16} />
 Reset Database
 </button>
 </div>
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-lg font-semibold text-gray-900">Vercel Deployment Checklist</h3>
 <a
 href="https://vercel.com/dashboard"
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
 >
 Open Vercel <ExternalLink size={14} />
 </a>
 </div>

 <div className="space-y-3">
 <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
 <p className="text-sm font-medium text-blue-900 mb-2">Required Environment Variables</p>
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <code className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
 VITE_SUPABASE_URL
 </code>
 <span className={`text-xs font-medium ${envStatus.supabaseUrl ? 'text-green-600' : 'text-red-600'}`}>
 {envStatus.supabaseUrl ? ' Present' : ' Missing'}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <code className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
 VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
 </code>
 <span className={`text-xs font-medium ${envStatus.supabaseKey ? 'text-green-600' : 'text-red-600'}`}>
 {envStatus.supabaseKey ? ' Present' : ' Missing'}
 </span>
 </div>
 </div>
 <button
 onClick={handleCopyEnvVars}
 className="mt-3 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
 >
 <Copy size={14} /> Copy environment variables
 </button>
 </div>

 <div className="rounded-lg border border-gray-200 p-4 space-y-2">
 <p className="text-sm font-semibold text-gray-900">Setup Steps:</p>
 <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
 <li>Go to <strong>Vercel Dashboard Your Project Settings</strong></li>
 <li>Click <strong>Environment Variables</strong></li>
 <li>Add both variables for <strong>Production, Preview, and Development</strong></li>
 <li>Click <strong>Save</strong></li>
 <li>Go to <strong>Deployments</strong> and click <strong>Redeploy</strong></li>
 <li>If it still fails, clear build cache and redeploy</li>
 </ol>
 </div>

 {(!envStatus.supabaseUrl || !envStatus.supabaseKey) && (
 <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
 <p className="text-sm text-yellow-800">
 <strong>Environment variables are missing.</strong> Your app will not work correctly on Vercel without these.
 </p>
 </div>
 )}
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-lg font-semibold text-gray-900">Email Confirmation Setup</h3>
 <a
 href={`https://supabase.com/dashboard/project/${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? 'YOUR_PROJECT'}/auth/url-configuration`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
 >
 Open Supabase <ExternalLink size={14} />
 </a>
 </div>

 <div className="space-y-3">
 <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
 <p className="text-sm font-medium text-amber-900 mb-2"> Fix"localhost refused to connect" error</p>
 <p className="text-sm text-amber-700">
 If email confirmation links redirect to localhost in production, configure these URLs in Supabase Dashboard:
 </p>
 </div>

 <div className="rounded-lg border border-gray-200 p-4 space-y-3">
 <div>
 <p className="text-sm font-semibold text-gray-900 mb-1">Site URL:</p>
 <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
 {import.meta.env.VITE_APP_URL || window.location.origin}
 </code>
 </div>

 <div>
 <p className="text-sm font-semibold text-gray-900 mb-1">Redirect URLs (add all):</p>
 <div className="space-y-1">
 <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
 http://localhost:5173
 </code>
 <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
 http://localhost:5173/**
 </code>
 <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
 {import.meta.env.VITE_APP_URL || 'https://your-app.vercel.app'}
 </code>
 <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
 {import.meta.env.VITE_APP_URL || 'https://your-app.vercel.app'}/**
 </code>
 </div>
 </div>
 </div>

 <div className="rounded-lg border border-gray-200 p-4 space-y-2">
 <p className="text-sm font-semibold text-gray-900">Configuration Steps:</p>
 <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
 <li>Go to <strong>Supabase Dashboard Authentication URL Configuration</strong></li>
 <li>Set <strong>Site URL</strong> to your production URL</li>
 <li>Add all redirect URLs listed above</li>
 <li>Add <code className="text-xs bg-gray-100 px-1">VITE_APP_URL</code> to Vercel environment variables</li>
 <li>Redeploy your app</li>
 <li>Test by signing up with a new email</li>
 </ol>
 </div>

 <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
 <p className="text-sm text-blue-800">
 <strong>Tip:</strong> After configuration, the email confirmation link will redirect to your app, which will automatically verify the email and log the user in.
 </p>
 </div>
 </div>
 </div>
 </div>
 </CenteredLayout>
 );
};

