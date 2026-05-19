import React, { useState } from 'react';
import { api, TokenManager } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface SignInFormProps {
 onSwitchToSignUp: () => void;
 onSubmit?: (credentials: { email: string; password: string }) => Promise<void>;
}

export const SignInForm: React.FC<SignInFormProps> = ({ onSwitchToSignUp, onSubmit }) => {
 const { setCurrentPage } = useApp();
 const [formData, setFormData] = useState({ email: '', password: '' });
 const [errors, setErrors] = useState<Record<string, string>>({});
 const [isLoading, setIsLoading] = useState(false);
 const [showPassword, setShowPassword] = useState(false);

 const validateForm = () => {
 const newErrors: Record<string, string> = {};
 if (!formData.email) {
 newErrors.email = 'Required';
 } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
 newErrors.email = 'Invalid email address';
 }
 if (!formData.password) newErrors.password = 'Required';
 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!validateForm()) return;
 setIsLoading(true);
 try {
 if (onSubmit) {
 await onSubmit({ email: formData.email, password: formData.password });
 return;
 }
 const response = await api.auth.login({ email: formData.email, password: formData.password });
 if (response.data && typeof response.data === 'object' && 'accessToken' in response.data) {
 const tokens = response.data as any;
 TokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
 localStorage.setItem('user_email', formData.email);
 const onboardingCompleted = localStorage.getItem('onboarding_completed');
 setCurrentPage(onboardingCompleted ? 'dashboard' : 'onboarding');
 }
 } catch (error: any) {
 const codeMap: Record<string, string> = {
 INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
 MISSING_FIELDS: 'Please fill in all required fields.',
 INVALID_EMAIL: 'Please enter a valid email address.',
 DATABASE_ERROR: 'Database error occurred. Please try again later.',
 };
 setErrors({ general: codeMap[error.code] || error.message || 'Sign in failed. Please try again.' });
 } finally {
 setIsLoading(false);
 }
 };

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const { name, value } = e.target;
 setFormData(prev => ({ ...prev, [name]: value }));
 if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
 };

 const inputBase = (hasError: boolean) =>
 `w-full pl-10 pr-4 py-3 bg-white border rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
 hasError
 ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
 : 'border-gray-200 hover:border-gray-300 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white'
 }`;

 return (
 <form onSubmit={handleSubmit} className="space-y-5">
 {errors.general && (
 <div className="bg-red-50 border border-red-200 rounded-xl p-3">
 <p className="text-sm text-red-600 text-center">{errors.general}</p>
 </div>
 )}

 {/* Email */}
 <div>
 <label htmlFor="signin-email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Mail size={16} />
 </div>
 <input
 type="email" id="signin-email" name="email"
 value={formData.email} onChange={handleInputChange}
 disabled={isLoading} placeholder="you@example.com"
 autoComplete="email"
 className={inputBase(!!errors.email)}
 />
 </div>
 {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
 </div>

 {/* Password */}
 <div>
 <label htmlFor="signin-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Lock size={16} />
 </div>
 <input
 type={showPassword ? 'text' : 'password'} id="signin-password" name="password"
 value={formData.password} onChange={handleInputChange}
 disabled={isLoading} placeholder="--------"
 autoComplete="current-password"
 className={`${inputBase(!!errors.password)} pr-10`}
 />
 <button type="button" onClick={() => setShowPassword(!showPassword)}
 className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
 {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
 </button>
 </div>
 {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
 </div>

 {/* Remember + Forgot */}
 <div className="flex items-center justify-between">
 <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer">
 <input type="checkbox" id="rememberMe" name="rememberMe"
 className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 accent-blue-600"
 />
 <span className="text-sm text-gray-600">Remember me</span>
 </label>
 <a href="#" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
 Forgot password?
 </a>
 </div>

 {/* Submit */}
 <button
 type="submit"
 disabled={isLoading}
 className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
 >
 {isLoading ? (
 <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />Signing in...</>
 ) : 'Sign In'}
 </button>

 <p className="text-center text-sm text-gray-500 pt-1">
 Don't have an account?{' '}
 <button type="button" onClick={onSwitchToSignUp}
 className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">
 Sign up
 </button>
 </p>
 </form>
 );
};
