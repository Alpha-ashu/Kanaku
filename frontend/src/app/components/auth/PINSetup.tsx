import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Shield, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { backupPINKeys, isPINSet, restorePINKeys, storeMasterKey, verifyPIN } from '@/lib/encryption';
import { isPinMissing, isPinServiceUnavailable, pinService } from '@/services/pinService';

interface PINSetupProps {
 onComplete: (pin: string) => void;
 onBack?: () => void;
 isExistingUser?: boolean;
 existingPinRequired?: boolean;
}

export const PINSetup: React.FC<PINSetupProps> = ({
 onComplete,
 onBack,
 existingPinRequired = false,
}) => {
 const [step, setStep] = useState<'create' | 'confirm' | 'enter'>('create');
 const [pin, setPin] = useState('');
 const [confirmPin, setConfirmPin] = useState('');
 const [showPin, setShowPin] = useState(false);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [pinStrength, setPinStrength] = useState<'weak' | 'medium' | 'strong'>('weak');

 useEffect(() => {
 // Check if user already has a PIN (existing user on new device)
 if (existingPinRequired) {
 setStep('enter');
 }
 }, [existingPinRequired]);

 // Check PIN strength
 useEffect(() => {
 if (pin.length === 6) {
 // Check for common patterns
 const isSequential = /012|123|234|345|456|567|678|789/.test(pin) || /987|876|765|654|543|432|321|210/.test(pin);
 const isRepeating = /(.)\1{2,}/.test(pin); // 3 or more repeating like 111, 222
 const isPattern = /^(121212|101010|010101|212121|112233|223344)$/.test(pin);
 const hasUniqueDigits = new Set(pin.split('')).size >= 4;

 if (isSequential || isRepeating || isPattern) {
 setPinStrength('weak');
 } else if (hasUniqueDigits) {
 setPinStrength('strong');
 } else {
 setPinStrength('medium');
 }
 }
 }, [pin]);

 const handlePinInput = (value: string) => {
 if (value.length <= 6 && /^\d*$/.test(value)) {
 if (step === 'create') {
 setPin(value);
 setError(null);
 } else if (step === 'confirm') {
 setConfirmPin(value);
 setError(null);
 } else {
 setPin(value);
 setError(null);
 }
 }
 };

 const handleContinue = () => {
 if (step === 'create') {
 if (pin.length !== 6) {
 setError('PIN must be 6 digits');
 return;
 }
 if (pinStrength === 'weak') {
 setError('PIN is too weak. Avoid sequential (123), repeating (111), or common patterns.');
 return;
 }
 setStep('confirm');
 setConfirmPin('');
 } else if (step === 'confirm') {
 if (confirmPin.length !== 6) {
 setError('Please enter 6 digits');
 return;
 }
 if (pin !== confirmPin) {
 setError('PINs do not match');
 setConfirmPin('');
 return;
 }
 handleSubmit();
 }
 };

 const handleSubmit = async () => {
 setIsLoading(true);
 try {
 const candidatePin = step === 'enter' ? pin : confirmPin;
 const result = step === 'enter'
 ? await pinService.verifyPin({ pin: candidatePin })
 : await pinService.createPin(candidatePin);

 // SECURITY FIX (Bug #2): Server failures (500 errors) on PIN verification MUST be treated as Access Denied.
 // When verifying an existing PIN, any server error blocks access - no local fallback allowed.
 if (step === 'enter' && !result.success) {
 if (isPinServiceUnavailable(result)) {
 // Server error (500) on PIN verification = Access Denied
 setError('PIN verification service unavailable. Access denied for security.');
 return;
 }
 // Other verification failures (wrong PIN, etc.)
 setError(result.message || 'PIN verification failed. Please try again.');
 return;
 }

 // For PIN creation, server errors can fall back to local-only mode
 if (!result.success && step !== 'enter' && !isPinServiceUnavailable(result)) {
 setError(result.message || 'PIN request failed. Please try again.');
 return;
 }

 if (step === 'enter' && !isPINSet()) {
 const keyBackupResult = await pinService.getKeyBackup();
 if (keyBackupResult.success && keyBackupResult.backup) {
 const [hash, salt] = keyBackupResult.backup.split('|');
 if (hash && salt) {
 restorePINKeys({ hash, salt });
 }
 }
 }

 const localResult = await verifyPIN(candidatePin);
 if (!localResult.isValid) {
 await storeMasterKey(candidatePin);
 }

 // Only allow local fallback for PIN creation (not verification)
 if (!result.success && step !== 'enter') {
 const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
 pinService.markPinCreatedLocally(expiresAt);
 pinService.markPendingServerSync();
 }

 const backup = backupPINKeys();
 if (backup.hash && backup.salt) {
 // SECURITY: Never mark PIN as verified locally when server verification failed
 if (result.success && step === 'enter' && localResult.isValid) {
 pinService.markPinVerifiedLocally();
 }

 let securityToken: string | undefined;
 if (result.success) {
   const secResult = await pinService.verifySecurity();
   if (secResult.success) {
     securityToken = secResult.securityToken;
   }
 }

 const backupResult = await pinService.saveKeyBackup(`${backup.hash}|${backup.salt}`, securityToken);
 if (!backupResult.success && !isPinServiceUnavailable(backupResult) && !isPinMissing(backupResult)) {
 console.warn('PIN key backup refresh failed during setup:', backupResult.message);
 }
 }

 // Store PIN metadata
 localStorage.setItem('pin_created_at', new Date().toISOString());
 localStorage.setItem('pin_expiry', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()); // 90 days

 toast.success(
 step === 'enter'
 ? 'PIN verified successfully!'
 : result.success
 ? 'PIN created successfully!'
 : 'PIN created on this device. Server sync is pending.',
 );
 onComplete(candidatePin);
 } catch (err) {
 setError('Failed to save PIN. Please try again.');
 } finally {
 setIsLoading(false);
 }
 };

 const handleEnterPin = async () => {
 if (pin.length !== 6) {
 setError('Please enter 6 digits');
 return;
 }
 handleSubmit();
 };

 const renderPinDots = (value: string) => (
 <div className="flex justify-center gap-3 mb-6">
 {[...Array(6)].map((_, i) => (
 <div
 key={i}
 className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${value.length > i
 ? 'bg-gray-900 scale-110'
 : 'bg-gray-200'
 }`}
 />
 ))}
 </div>
 );

 const getStrengthColor = () => {
 switch (pinStrength) {
 case 'weak': return 'text-red-500';
 case 'medium': return 'text-amber-500';
 case 'strong': return 'text-emerald-500';
 default: return 'text-gray-400';
 }
 };

 return (
 <div className="min-h-screen bg-white flex items-center justify-center p-4">
 <div className="bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] w-full max-w-md">
 {/* Header */}
 <div className="p-8 pb-6 text-center relative">
 {onBack && (
 <button
 type="button"
 onClick={onBack}
 className="absolute left-6 top-6 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
 aria-label="Go back"
 title="Go back"
 >
 <ArrowLeft className="w-5 h-5" />
 </button>
 )}
 <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 rounded-[20px] mb-6 shadow-sm">
 <Lock className="w-8 h-8 text-white" />
 </div>
 <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
 {step === 'create' && 'Create Security PIN'}
 {step === 'confirm' && 'Confirm Your PIN'}
 {step === 'enter' && 'Enter Your PIN'}
 </h1>
 <p className="text-sm text-gray-500 font-medium">
 {step === 'create' && 'Set a 6-digit PIN to secure your app'}
 {step === 'confirm' && 'Re-enter your PIN to confirm'}
 {step === 'enter' && 'Please enter your 6 digit pin'}
 </p>
 </div>

 {/* PIN Input */}
 <div className="px-8 pb-8">
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
 {error && (
 <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
 <p className="text-sm font-medium text-red-600 text-center">{error}</p>
 </div>
 )}

 <div className="relative mb-6">
 <input
 type={showPin ? 'text' : 'password'}
 value={step === 'confirm' ? confirmPin : pin}
 onChange={(e) => handlePinInput(e.target.value)}
 className="w-full px-4 py-4 text-center text-3xl font-mono tracking-[0.5em] border-2 border-gray-100 bg-white rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 focus:bg-white transition-all outline-none"
 placeholder="------"
 maxLength={6}
 inputMode="numeric"
 pattern="[0-9]*"
 autoFocus
 aria-label="PIN input"
 autoComplete={step === 'enter' ? 'current-password' : 'new-password'}
 />
 <button
 type="button"
 onClick={() => setShowPin(!showPin)}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
 aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
 >
 {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
 </button>
 </div>

 {renderPinDots(step === 'confirm' ? confirmPin : pin)}

 {/* PIN Strength Indicator (only for create step) */}
 {step === 'create' && pin.length === 6 && (
 <div className="text-center mb-6">
 <span className={`text-sm font-bold tracking-wide uppercase ${getStrengthColor()}`}>
 PIN Strength: {pinStrength}
 </span>
 </div>
 )}

 {/* Progress Steps */}
 {step !== 'enter' && (
 <div className="flex justify-center gap-2 mb-8">
 <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 'create' ? 'bg-gray-900' : 'bg-emerald-500'}`} />
 <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 'confirm' ? 'bg-gray-900' : 'bg-gray-200'}`} />
 </div>
 )}

 <button
 onClick={step === 'enter' ? handleEnterPin : handleContinue}
 disabled={isLoading || (step === 'confirm' ? confirmPin.length !== 6 : pin.length !== 6)}
 className="w-full h-14 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center"
 >
 {isLoading ? (
 <span className="flex items-center gap-2">
 <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
 Processing...
 </span>
 ) : step === 'enter' ? (
 'Verify PIN'
 ) : step === 'create' ? (
 'Continue'
 ) : (
 'Create PIN'
 )}
 </button>

 {/* Info Box */}
 <div className="mt-8 p-5 bg-white rounded-2xl border border-gray-100">
 <div className="flex items-start gap-3">
 <Shield className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
 <div className="text-sm text-gray-600">
 <p className="font-bold text-gray-900 mb-1.5">Your PIN is secure</p>
 <ul className="text-xs space-y-1.5">
 <li>- Financial data stays encrypted on this device</li>
 <li>- Used for app unlock and sensitive actions</li>
 <li>- Valid for 90 days, same across all devices</li>
 <li>- Server stores PIN verification data only</li>
 </ul>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};
