import React, { useState } from 'react';
import { pinService } from '../../services/pinService';

interface OnboardingStep3Props {
 data: {
 pin: string;
 confirmPin: string;
 };
 onUpdate: (data: any) => void;
 onNext: () => void;
 onBack: () => void;
}

export const OnboardingStep3: React.FC<OnboardingStep3Props> = ({
 data,
 onUpdate,
 onNext,
 onBack,
}) => {
 const [errors, setErrors] = useState<Record<string, string>>({});
 const [showPin, setShowPin] = useState(false);
 const [isCreating, setIsCreating] = useState(false);

 const validateForm = () => {
 const newErrors: Record<string, string> = {};

 if (!data.pin) {
 newErrors.pin = 'PIN is required';
 } else if (!pinService.validatePinFormat(data.pin)) {
 newErrors.pin = 'PIN must be exactly 6 digits';
 }

 if (!data.confirmPin) {
 newErrors.confirmPin = 'Please confirm your PIN';
 } else if (data.pin !== data.confirmPin) {
 newErrors.confirmPin = 'PINs do not match';
 }

 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!validateForm()) return;

 setIsCreating(true);
 try {
 const result = await pinService.createPin(data.pin);
 if (result.success) {
 onNext();
 } else {
 setErrors({ pin: result.message });
 }
 } catch (error) {
 setErrors({ pin: 'Failed to create PIN. Please try again.' });
 } finally {
 setIsCreating(false);
 }
 };

 const generateRandomPin = () => {
 const randomPin = pinService.generateRandomPin();
 onUpdate({ pin: randomPin, confirmPin: randomPin });
 };

 return (
 <form onSubmit={handleSubmit} className="space-y-4">
 <input
 type="text"
 name="username"
 value=""
 readOnly
 autoComplete="username"
 tabIndex={-1}
 className="sr-only"
 aria-hidden="true"
 />
 <div>
 <h3 className="text-lg font-medium text-gray-900 mb-2">
 Create App PIN
 </h3>
 <p className="text-sm text-gray-600 mb-6">
 Create a 6-digit PIN for quick access to your account. This PIN will be used across all your devices and expires after 90 days.
 </p>
 </div>

 <div>
 <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
 6-Digit PIN
 </label>
 <div className="relative">
 <input
 type={showPin ? 'text' : 'password'}
 id="pin"
 value={data.pin}
 onChange={(e) => {
 // Only allow numbers
 const value = e.target.value.replace(/\D/g, '').slice(0, 6);
 onUpdate({ pin: value });
 }}
 className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.pin ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="------"
 maxLength={6}
 autoComplete="new-password"
 inputMode="numeric"
 />
 <button
 type="button"
 onClick={() => setShowPin(!showPin)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
 >
 {showPin ? 'Hide' : 'Show'}
 </button>
 </div>
 {errors.pin && (
 <p className="mt-1 text-sm text-red-600">{errors.pin}</p>
 )}
 </div>

 <div>
 <label htmlFor="confirmPin" className="block text-sm font-medium text-gray-700 mb-1">
 Confirm PIN
 </label>
 <div className="relative">
 <input
 type={showPin ? 'text' : 'password'}
 id="confirmPin"
 value={data.confirmPin}
 onChange={(e) => {
 const value = e.target.value.replace(/\D/g, '').slice(0, 6);
 onUpdate({ confirmPin: value });
 }}
 className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.confirmPin ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="------"
 maxLength={6}
 autoComplete="new-password"
 inputMode="numeric"
 />
 <button
 type="button"
 onClick={() => setShowPin(!showPin)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
 >
 {showPin ? 'Hide' : 'Show'}
 </button>
 </div>
 {errors.confirmPin && (
 <p className="mt-1 text-sm text-red-600">{errors.confirmPin}</p>
 )}
 </div>

 <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
 <div className="flex items-start space-x-2">
 <div className="text-blue-600 mt-0.5">
 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
 </svg>
 </div>
 <div className="text-sm text-blue-800">
 <p className="font-medium mb-1">PIN Security Features:</p>
 <ul className="list-disc list-inside space-y-1 text-xs">
 <li>Same PIN works across all your devices</li>
 <li>PIN automatically expires after 90 days</li>
 <li>5 failed attempts will temporarily lock your account</li>
 <li>You'll be prompted to create a new PIN when it expires</li>
 </ul>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between">
 <button
 type="button"
 onClick={generateRandomPin}
 className="text-sm text-blue-600 hover:text-blue-700 font-medium"
 >
 Generate Random PIN
 </button>
 </div>

 <div className="flex space-x-3">
 <button
 type="button"
 onClick={onBack}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
 >
 Back
 </button>
 <button
 type="submit"
 disabled={isCreating}
 className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isCreating ? 'Creating PIN...' : 'Continue to Sync Setup'}
 </button>
 </div>
 </form>
 );
};
