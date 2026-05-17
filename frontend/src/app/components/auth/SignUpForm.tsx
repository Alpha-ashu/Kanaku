import React, { useState } from 'react';
import { api } from '@/lib/api';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';

interface SignUpFormProps {
 onSwitchToSignIn: () => void;
 onSubmit?: (data: { firstName: string; lastName: string; email: string; mobile: string; password: string }) => Promise<void>;
 onViewTerms?: () => void;
 onViewPrivacy?: () => void;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ onSwitchToSignIn, onSubmit, onViewTerms, onViewPrivacy }) => {
 const [formData, setFormData] = useState({
 firstName: '',
 lastName: '',
 email: '',
 mobile: '',
 password: '',
 confirmPassword: '',
 });
 const [errors, setErrors] = useState<Record<string, string>>({});
 const [isLoading, setIsLoading] = useState(false);
 const [showPassword, setShowPassword] = useState(false);
 const [showConfirmPassword, setShowConfirmPassword] = useState(false);

 const calculateStrength = (password: string) => {
 if (!password) return 0;
 let score = 0;
 if (password.length >= 8) score += 1;
 if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
 if (/\d/.test(password)) score += 1;
 if (/[^a-zA-Z\d]/.test(password)) score += 1;
 return Math.max(1, score);
 };

 const strengthScore = calculateStrength(formData.password);

 const getStrengthColor = (index: number) => {
 if (!formData.password) return 'bg-gray-200';
 if (index > strengthScore) return 'bg-gray-200';
 switch (strengthScore) {
 case 1: return 'bg-red-500';
 case 2: return 'bg-yellow-500';
 case 3: return 'bg-blue-500';
 case 4: return 'bg-emerald-500';
 default: return 'bg-gray-200';
 }
 };

 const getStrengthLabel = () => {
 if (!formData.password) return '';
 const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
 const colors = ['', 'text-red-500', 'text-yellow-600', 'text-blue-600', 'text-emerald-600'];
 return <span className={`text-xs font-semibold ${colors[strengthScore]}`}>{labels[strengthScore]}</span>;
 };

 const validateForm = () => {
 const newErrors: Record<string, string> = {};
 if (!formData.firstName.trim()) newErrors.firstName = 'Required';
 if (!formData.lastName.trim()) newErrors.lastName = 'Required';
 if (!formData.email) {
 newErrors.email = 'Required';
 } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
 newErrors.email = 'Invalid email address';
 }
 if (!formData.mobile.trim()) {
 newErrors.mobile = 'Required';
 } else if (!/^\+?[\d\s\-()]{10,}$/.test(formData.mobile)) {
 newErrors.mobile = 'Invalid mobile number';
 }
 if (!formData.password) {
 newErrors.password = 'Required';
 } else if (formData.password.length < 8) {
 newErrors.password = 'Minimum 8 characters';
 }
 if (!formData.confirmPassword) {
 newErrors.confirmPassword = 'Required';
 } else if (formData.password !== formData.confirmPassword) {
 newErrors.confirmPassword = 'Passwords do not match';
 }
 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!validateForm()) return;
 setIsLoading(true);
 try {
 if (onSubmit) {
 await onSubmit({
 firstName: formData.firstName,
 lastName: formData.lastName,
 email: formData.email,
 mobile: formData.mobile,
 password: formData.password,
 });
 return;
 }
 const response = await api.auth.register({
 name: `${formData.firstName} ${formData.lastName}`,
 email: formData.email,
 password: formData.password,
 });
 if (response.data && typeof response.data === 'object' && 'accessToken' in response.data) {
 const tokens = response.data as any;
 localStorage.setItem('auth_token', tokens.accessToken);
 localStorage.setItem('refresh_token', tokens.refreshToken);
 localStorage.setItem('user_email', formData.email);
 localStorage.setItem('user_name', `${formData.firstName} ${formData.lastName}`);
 window.location.href = '/onboarding';
 }
 } catch (error: any) {
 const codeMap: Record<string, string> = {
 EMAIL_EXISTS: 'This email is already registered. Please sign in instead.',
 MISSING_FIELDS: 'Please fill in all required fields.',
 INVALID_EMAIL: 'Please enter a valid email address.',
 PASSWORD_TOO_SHORT: 'Password must be at least 8 characters long.',
 DATABASE_ERROR: 'Database error occurred. Please try again later.',
 };
 setErrors({ general: codeMap[error.code] || error.message || 'Registration failed. Please try again.' });
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
 <form onSubmit={handleSubmit} className="space-y-4">
 {errors.general && (
 <div className="bg-red-50 border border-red-200 rounded-xl p-3">
 <p className="text-sm text-red-600 text-center">{errors.general}</p>
 </div>
 )}

 {/* Name row */}
 <div className="grid grid-cols-2 gap-3">
 {(['firstName', 'lastName'] as const).map((field, idx) => (
 <div key={field}>
 <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">
 {idx === 0 ? 'First Name' : 'Last Name'}
 </label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <User size={16} />
 </div>
 <input
 type="text"
 id={field}
 name={field}
 value={formData[field]}
 onChange={handleInputChange}
 disabled={isLoading}
 placeholder={idx === 0 ? 'John' : 'Doe'}
 className={inputBase(!!errors[field])}
 />
 </div>
 {errors[field] && <p className="mt-1 text-xs text-red-500">{errors[field]}</p>}
 </div>
 ))}
 </div>

 {/* Email */}
 <div>
 <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Mail size={16} />
 </div>
 <input
 type="email" id="email" name="email"
 value={formData.email} onChange={handleInputChange}
 disabled={isLoading} placeholder="you@example.com"
 className={inputBase(!!errors.email)}
 />
 </div>
 {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
 </div>

 {/* Mobile */}
 <div>
 <label htmlFor="mobile" className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Phone size={16} />
 </div>
 <input
 type="tel" id="mobile" name="mobile"
 value={formData.mobile} onChange={handleInputChange}
 disabled={isLoading} placeholder="+91 9876543210"
 className={inputBase(!!errors.mobile)}
 />
 </div>
 {errors.mobile && <p className="mt-1 text-xs text-red-500">{errors.mobile}</p>}
 </div>

 {/* Password */}
 <div>
 <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Lock size={16} />
 </div>
 <input
 type={showPassword ? 'text' : 'password'} id="password" name="password"
 value={formData.password} onChange={handleInputChange}
 disabled={isLoading} placeholder="--------"
 className={`${inputBase(!!errors.password)} pr-10`}
 />
 <button type="button" onClick={() => setShowPassword(!showPassword)}
 className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
 {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
 </button>
 </div>
 {formData.password && (
 <div className="mt-2">
 <div className="flex gap-1 h-1.5 w-full mb-1">
 {[1, 2, 3, 4].map((i) => (
 <div key={i} className={`h-full flex-1 rounded-full transition-all duration-300 ${getStrengthColor(i)}`} />
 ))}
 </div>
 <div className="flex justify-end">{getStrengthLabel()}</div>
 </div>
 )}
 {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
 </div>

 {/* Confirm Password */}
 <div>
 <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
 <Lock size={16} />
 </div>
 <input
 type={showConfirmPassword ? 'text' : 'password'} id="confirmPassword" name="confirmPassword"
 value={formData.confirmPassword} onChange={handleInputChange}
 disabled={isLoading} placeholder="--------"
 className={`${inputBase(!!errors.confirmPassword)} pr-10`}
 />
 <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
 className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
 {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
 </button>
 </div>
 {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
 </div>

 {/* Terms */}
 <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
 <p className="text-xs text-blue-700 text-center leading-relaxed">
 By creating an account, you agree to our{' '}
 <button type="button" onClick={onViewTerms} className="font-semibold underline hover:text-blue-900 transition-colors">Terms of Service</button>
 {' '}and{' '}
 <button type="button" onClick={onViewPrivacy} className="font-semibold underline hover:text-blue-900 transition-colors">Privacy Policy</button>.
 </p>
 </div>

 {/* Submit */}
 <button
 type="submit"
 disabled={isLoading}
 className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
 >
 {isLoading ? (
 <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />Creating account...</>
 ) : 'Create Account'}
 </button>

 <p className="text-center text-sm text-gray-500 pt-1">
 Already have an account?{' '}
 <button type="button" onClick={onSwitchToSignIn}
 className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">
 Sign in
 </button>
 </p>
 </form>
 );
};
