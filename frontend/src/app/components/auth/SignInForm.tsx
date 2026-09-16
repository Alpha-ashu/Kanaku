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
    `w-full pl-10 pr-10 pt-5 pb-1.5 bg-slate-50/50 border rounded-xl text-slate-900 placeholder-transparent text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
        : 'border-slate-200 hover:border-slate-300 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white'
    }`;

  const labelBase = `absolute left-10 top-1.5 text-2xs font-bold text-slate-400 transition-all duration-200 pointer-events-none
    peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:font-normal
    peer-focus:top-1.5 peer-focus:text-2xs peer-focus:text-violet-600 peer-focus:font-bold`;

  return (
    <form data-testid="sign-in-form-form" onSubmit={handleSubmit} className="space-y-5">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600 text-center font-semibold">{errors.general}</p>
        </div>
      )}

      {/* Email */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
        {errors.email && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">{errors.email}</p>}
      </div>

      {/* Password */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {errors.password && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">{errors.password}</p>}
      </div>

      {/* Remember + Forgot */}
      <div className="flex items-center justify-between px-1">
        <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            data-testid="auth-signin-remember-checkbox"
            className="w-4 h-4 text-violet-600 border-slate-300 rounded focus:ring-violet-500/40 accent-violet-600 cursor-pointer"
          />
          <span className="text-sm text-slate-600 font-medium">Remember me</span>
        </label>
        <a 
          data-testid="sign-in-form-forgot-password" 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            if (onForgotPassword) onForgotPassword();
          }} 
          className="text-sm text-violet-600 hover:text-violet-700 font-bold transition-colors"
        >
          Forgot password?
        </a>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        data-testid="auth-signin-submit-button"
        style={{
          width: '100%',
          background: isLoading ? '#6366f1' : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          color: '#ffffff',
          fontWeight: '700',
          fontSize: '15px',
          padding: '14px 16px',
          borderRadius: '14px',
          border: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(124, 58, 237, 0.28)',
          letterSpacing: '0.3px',
          transition: 'all 0.2s',
        }}
      >
        {isLoading ? (
          <>
            <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8 }} />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </button>

      <p className="text-center text-sm text-slate-500 pt-1 font-medium">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          data-testid="auth-signin-switch-signup-button"
          className="text-violet-600 hover:text-violet-700 font-bold transition-colors"
        >
          Sign up
        </button>
      </p>
    </form>
  );
};
