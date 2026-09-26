import React, { useState } from 'react';
import { api, TokenManager } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface SignInFormProps {
 onSwitchToSignUp: () => void;
 onSubmit?: (credentials: { email: string; password: string }) => Promise<void>;
 onForgotPassword?: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({ onSwitchToSignUp, onSubmit, onForgotPassword }) => {
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
 // Refresh token is an HttpOnly cookie set by the server; only the access token is stored by JS.
 TokenManager.setAccessToken(tokens.accessToken);
 localStorage.setItem('user_email', formData.email);
 const onboardingCompleted = localStorage.getItem('onboarding_completed');
 setCurrentPage(onboardingCompleted ? 'dashboard' : 'onboarding');
 }
 } catch (error: any) {
  const isNetwork = !!(error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Failed to fetch') || error?.name === 'TypeError');
  const codeMap: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password. Please try again.',
  MISSING_FIELDS: 'Please fill in all required fields.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  DATABASE_ERROR: 'Server error. Please try again in a moment.',
  };
  const msg = isNetwork
    ? 'Cannot reach server. Please check your internet and try again.'
    : (codeMap[error.code] || error.message || 'Sign in failed. Please try again.');
  setErrors({ general: msg });
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
    `w-full pl-10 pr-10 py-3 bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
        : 'border-slate-200 hover:border-slate-300 focus:ring-violet-500/20 focus:border-violet-600 focus:bg-white'
    }`;

  return (
    <form data-testid="sign-in-form-form" onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600 text-center font-medium">{errors.general}</p>
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="signin-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Email Address
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Mail size={16} />
          </div>
          <input
            type="email"
            id="signin-email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            disabled={isLoading}
            placeholder="name@example.com"
            autoComplete="email"
            data-testid="auth-signin-email-input"
            className={inputBase(!!errors.email)}
          />
        </div>
        {errors.email && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">{errors.email}</p>}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="signin-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Lock size={16} />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            id="signin-password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            disabled={isLoading}
            placeholder="Enter your password"
            autoComplete="current-password"
            data-testid="auth-signin-password-input"
            className={`${inputBase(!!errors.password)} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            data-testid="auth-signin-password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">{errors.password}</p>}
      </div>

      {/* Remember + Forgot */}
      <div className="flex items-center justify-between pt-0.5">
        <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            data-testid="auth-signin-remember-checkbox"
            className="w-4 h-4 text-violet-600 border-slate-300 rounded focus:ring-violet-500/20 accent-violet-600 cursor-pointer"
          />
          <span className="text-xs text-slate-600 font-medium">Remember me</span>
        </label>
        <button
          type="button"
          data-testid="sign-in-form-forgot-password"
          onClick={() => {
            if (onForgotPassword) onForgotPassword();
          }}
          className="text-xs text-violet-600 hover:text-violet-700 font-bold transition-colors cursor-pointer"
        >
          Forgot password?
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        data-testid="auth-signin-submit-button"
        className="w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 active:scale-[0.99] text-white font-bold py-3 sm:py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(124,58,237,0.25)] hover:shadow-[0_6px_22px_rgba(124,58,237,0.35)] text-sm h-11 sm:h-12 cursor-pointer"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </button>

      <p className="text-center text-xs sm:text-sm text-slate-500 pt-1 font-normal">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          data-testid="auth-signin-switch-signup-button"
          className="text-violet-600 hover:text-violet-700 font-bold underline underline-offset-2 transition-colors cursor-pointer"
        >
          Sign up
        </button>
      </p>
    </form>
  );
};
