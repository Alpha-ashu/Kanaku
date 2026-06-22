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
 // Refresh token is an HttpOnly cookie set by the server; only the access token is stored by JS.
 TokenManager.setAccessToken(tokens.accessToken);
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
    `w-full pl-10 pr-10 pt-5 pb-1.5 bg-white border rounded-xl text-gray-900 placeholder-transparent text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
        : 'border-gray-200 hover:border-gray-300 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white'
    }`;

  const labelBase = `absolute left-10 top-1.5 text-[10px] font-semibold text-gray-400 transition-all duration-200 pointer-events-none
    peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:font-normal
    peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-blue-500 peer-focus:font-semibold`;

  return (
    <form data-testid="sign-in-form-form" onSubmit={handleSubmit} className="space-y-5">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600 text-center">{errors.general}</p>
        </div>
      )}

      {/* Email */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Mail size={16} />
        </div>
        <input
          type="email"
          id="signin-email"
          name="email"
          value={formData.email}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder=" "
          autoComplete="email"
          data-testid="auth-signin-email-input"
          className={`${inputBase(!!errors.email)} peer`}
        />
        <label htmlFor="signin-email" className={labelBase}>
          Email Address
        </label>
        {errors.email && <p className="mt-1 text-xs text-red-500 pl-1">{errors.email}</p>}
      </div>

      {/* Password */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Lock size={16} />
        </div>
        <input
          type={showPassword ? 'text' : 'password'}
          id="signin-password"
          name="password"
          value={formData.password}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder=" "
          autoComplete="current-password"
          data-testid="auth-signin-password-input"
          className={`${inputBase(!!errors.password)} peer pr-12`}
        />
        <label htmlFor="signin-password" className={labelBase}>
          Password
        </label>
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          data-testid="auth-signin-password-toggle"
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {errors.password && <p className="mt-1 text-xs text-red-500 pl-1">{errors.password}</p>}
      </div>

      {/* Remember + Forgot */}
      <div className="flex items-center justify-between px-1">
        <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            data-testid="auth-signin-remember-checkbox"
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500/40 accent-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-600 font-medium">Remember me</span>
        </label>
        <a data-testid="sign-in-form-forgot-password" href="#" className="text-sm text-blue-600 hover:text-blue-700 font-semibold transition-colors">
          Forgot password?
        </a>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        data-testid="auth-signin-submit-button"
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.35)]"
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

      <p className="text-center text-sm text-gray-500 pt-1 font-medium">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          data-testid="auth-signin-switch-signup-button"
          className="text-blue-600 hover:text-blue-700 font-bold transition-colors"
        >
          Sign up
        </button>
      </p>
    </form>
 );
};
