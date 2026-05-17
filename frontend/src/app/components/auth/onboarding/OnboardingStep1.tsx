import React, { useState } from 'react';

interface OnboardingStep1Props {
 data: {
 email: string;
 password: string;
 confirmPassword: string;
 };
 onUpdate: (data: any) => void;
 onNext: () => void;
}

export const OnboardingStep1: React.FC<OnboardingStep1Props> = ({
 data,
 onUpdate,
 onNext,
}) => {
 const [errors, setErrors] = useState<Record<string, string>>({});

 const validateForm = () => {
 const newErrors: Record<string, string> = {};

 if (!data.email) {
 newErrors.email = 'Email is required';
 } else if (!/\S+@\S+\.\S+/.test(data.email)) {
 newErrors.email = 'Email is invalid';
 }

 if (!data.password) {
 newErrors.password = 'Password is required';
 } else if (data.password.length < 8) {
 newErrors.password = 'Password must be at least 8 characters';
 }

 if (!data.confirmPassword) {
 newErrors.confirmPassword = 'Please confirm your password';
 } else if (data.password !== data.confirmPassword) {
 newErrors.confirmPassword = 'Passwords do not match';
 }

 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (validateForm()) {
 onNext();
 }
 };

 return (
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <h3 className="text-lg font-medium text-gray-900 mb-2">
 Account Registration
 </h3>
 <p className="text-sm text-gray-600 mb-6">
 Create your account to get started with expense tracking.
 </p>
 </div>

 <div>
 <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
 Email Address
 </label>
 <input
 type="email"
 id="email"
 value={data.email}
 onChange={(e) => onUpdate({ email: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.email ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="you@example.com"
 />
 {errors.email && (
 <p className="mt-1 text-sm text-red-600">{errors.email}</p>
 )}
 </div>

 <div>
 <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
 Password
 </label>
 <input
 type="password"
 id="password"
 value={data.password}
 onChange={(e) => onUpdate({ password: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.password ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="--------"
 />
 {errors.password && (
 <p className="mt-1 text-sm text-red-600">{errors.password}</p>
 )}
 </div>

 <div>
 <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
 Confirm Password
 </label>
 <input
 type="password"
 id="confirmPassword"
 value={data.confirmPassword}
 onChange={(e) => onUpdate({ confirmPassword: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="--------"
 />
 {errors.confirmPassword && (
 <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
 )}
 </div>

 <button
 type="submit"
 className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
 >
 Continue to Profile Setup
 </button>

 <div className="text-center text-sm text-gray-600">
 Already have an account?{' '}
 <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
 Sign in
 </a>
 </div>
 </form>
 );
};
