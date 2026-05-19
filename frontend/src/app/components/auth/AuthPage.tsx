import React, { useState } from 'react';
import { signIn, signUp } from '@/lib/supabase-helpers';
import { Shield, Eye, EyeOff, Mail, Lock, User, Check, ArrowRight, Loader2 } from 'lucide-react';
import { KANKULogo } from '@/app/components/ui/KANKULogo';
import { toast } from 'sonner';
import { PrivacyPolicy } from '@/app/components/marketing/PrivacyPolicy';
import { Terms } from '@/app/components/marketing/Terms';

interface AuthPageProps {
 onAuthSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
 const [currentView, setCurrentView] = useState<'auth' | 'privacy' | 'terms'>('auth');
 const [isLogin, setIsLogin] = useState(true);
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [fullName, setFullName] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [loading, setLoading] = useState(false);

 const validateEmail = (email: string) => {
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
 };

 const validatePasswordStrength = (password: string) => {
 const minLength = 8;
 const hasUpperCase = /[A-Z]/.test(password);
 const hasLowerCase = /[a-z]/.test(password);
 const hasNumbers = /\d/.test(password);
 const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

 if (password.length < minLength) return `Password must be at least ${minLength} characters long`;
 if (!hasUpperCase) return 'Password must contain at least one uppercase letter';
 if (!hasLowerCase) return 'Password must contain at least one lowercase letter';
 if (!hasNumbers) return 'Password must contain at least one number';
 if (!hasSpecialChar) return 'Password must contain at least one special character';

 return null;
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setLoading(true);

 try {
 if (isLogin) {
 // Login
 await signIn(email, password);
 toast.success('Welcome back!');
 onAuthSuccess();
 // Signup
 if (!validateEmail(email)) {
 toast.error('Please enter a valid email address');
 setLoading(false);
 return;
 }

 const passwordError = validatePasswordStrength(password);
 if (passwordError) {
 toast.error(passwordError);
 setLoading(false);
 return;
 }

 if (!fullName.trim()) {
 toast.error('Please enter your full name');
 setLoading(false);
 return;
 }
 await signUp(email, password, fullName);
 toast.success('Account created! Please check your email to verify.');
 // Auto-login after signup
 setTimeout(async () => {
 try {
 await signIn(email, password);
 onAuthSuccess();
 } catch (err) {
 console.error('Auto-login failed:', err);
 }
 }, 1000);
 }
 } catch (error: any) {
 console.error('Auth error:', error);
 toast.error(error.message || 'Authentication failed');
 } finally {
 setLoading(false);
 }
 };

 if (currentView === 'privacy') {
 return <PrivacyPolicy onBack={() => setCurrentView('auth')} />;
 }

 if (currentView === 'terms') {
 return <Terms onBack={() => setCurrentView('auth')} />;
 }

 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 flex items-center justify-center p-4">
 <div className="w-full max-w-md">
 <div className="bg-white rounded-2xl shadow-2xl p-8">
 {/* Logo/Header */}
 <div className="text-center mb-8">
 <div className="inline-flex items-center justify-center w-20 h-20 mb-4 bg-white rounded-full p-2 shadow-sm border border-gray-100">
 <KANKULogo className="w-12 h-12" />
 </div>
 <h1 className="text-3xl font-bold text-gray-900">KANKU</h1>
 <p className="text-gray-500 mt-2">
 {isLogin ? 'Welcome back!' : 'Create your account'}
 </p>
 </div>

 {/* Auth Form */}
 <form onSubmit={handleSubmit} className="space-y-6">
 {/* Full Name (Signup only) */}
 {!isLogin && (
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Full Name
 </label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <User className="h-5 w-5 text-gray-400" />
 </div>
 <input
 type="text"
 value={fullName}
 onChange={(e) => setFullName(e.target.value)}
 className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 placeholder="John Doe"
 required={!isLogin}
 />
 </div>
 </div>
 )}

 {/* Email */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Email Address
 </label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <Mail className="h-5 w-5 text-gray-400" />
 </div>
 <input
 type="email"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 placeholder="you@example.com"
 required
 />
 </div>
 </div>

 {/* Password */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Password
 </label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <Lock className="h-5 w-5 text-gray-400" />
 </div>
 <input
 type={showPassword ? 'text' : 'password'}
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 placeholder="--------"
 required
 minLength={6}
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute inset-y-0 right-0 pr-3 flex items-center"
 >
 {showPassword ? (
 <EyeOff className="h-5 w-5 text-gray-400" />
 ) : (
 <Eye className="h-5 w-5 text-gray-400" />
 )}
 </button>
 </div>
 {!isLogin && (
 <div className="mt-2 text-xs text-gray-500 space-y-1">
 <p className={password.length >= 8 ?"text-green-600" :""}> At least 8 characters</p>
 <p className={/[A-Z]/.test(password) ?"text-green-600" :""}> Contains uppercase letter</p>
 <p className={/[a-z]/.test(password) ?"text-green-600" :""}> Contains lowercase letter</p>
 <p className={/\d/.test(password) ?"text-green-600" :""}> Contains number</p>
 <p className={/[!@#$%^&*(),.?":{}|<>]/.test(password) ?"text-green-600" :""}> Contains special character</p>
 </div>
 )}
 </div>

 {/* Submit Button */}
 <button
 type="submit"
 disabled={loading}
 className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {loading ? (
 <>
 <Loader2 className="animate-spin h-5 w-5 mr-2" />
 {isLogin ? 'Signing in...' : 'Creating account...'}
 </>
 ) : (
 <>{isLogin ? 'Sign In' : 'Create Account'}</>
 )}
 </button>
 </form>

 {/* Toggle Login/Signup */}
 <div className="mt-6 text-center">
 <p className="text-sm text-gray-600">
 {isLogin ?"Don't have an account?" : 'Already have an account?'}
 <button
 onClick={() => {
 setIsLogin(!isLogin);
 setFullName('');
 setEmail('');
 setPassword('');
 }}
 className="ml-1 text-blue-600 hover:text-blue-700 font-semibold"
 >
 {isLogin ? 'Sign up' : 'Sign in'}
 </button>
 </p>
 </div>

 {/* Policy Links */}
 <div className="mt-4 text-center">
 <p className="text-xs text-gray-500">
 By continuing, you agree to our{' '}
 <button onClick={() => setCurrentView('terms')} className="text-blue-600 hover:underline">
 Terms of Service
 </button>{' '}
 and{' '}
 <button onClick={() => setCurrentView('privacy')} className="text-blue-600 hover:underline">
 Privacy Policy
 </button>.
 </p>
 </div>

 {/* Demo Info */}
 <div className="mt-6 p-4 bg-blue-50 rounded-lg">
 <p className="text-xs text-blue-800 text-center">
 <strong>Demo Mode:</strong> Sign up with any email to get started.
 Your data is private and secure.
 </p>
 </div>
 </div>

 {/* Footer */}
 <p className="text-center text-white text-sm mt-6 opacity-90">
 Powered by Supabase - Secure & Private
 </p>
 </div>
 </div>
 );
};


