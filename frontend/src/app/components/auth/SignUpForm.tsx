import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Eye, EyeOff, Mail, Lock, User, Phone, Check, AlertCircle, Sparkles, Loader2 } from 'lucide-react';

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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');
  const [emailTaken, setEmailTaken] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const countryCodes = [
    { code: '+91', label: '🇮🇳 +91' },
    { code: '+1', label: '🇺🇸 +1' },
    { code: '+44', label: '🇬🇧 +44' },
    { code: '+971', label: '🇦🇪 +971' },
    { code: '+65', label: '🇸🇬 +65' },
    { code: '+61', label: '🇦🇺 +61' },
  ];

  // Dynamic Validation States (calculated on the fly for real-time reactivity)
  const isFirstNameValid = formData.firstName.trim().length > 0;
  const isLastNameValid = formData.lastName.trim().length > 0;
  const isEmailFormatValid = /\S+@\S+\.\S+/.test(formData.email);
  const isEmailValid = isEmailFormatValid && emailTaken !== true;
  const isMobileValid = (() => {
    const digits = formData.mobile.replace(/\D/g, '');
    if (countryCode === '+65') return digits.length === 8;
    if (countryCode === '+91' || countryCode === '+1') return digits.length === 10;
    return digits.length >= 8 && digits.length <= 11;
  })();

  // Password requirements checks
  const hasMinLength = formData.password.length >= 8;
  const hasUppercase = /[A-Z]/.test(formData.password);
  const hasLowercase = /[a-z]/.test(formData.password);
  const hasNumber = /\d/.test(formData.password);
  const hasSpecial = /[^a-zA-Z\d]/.test(formData.password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const isConfirmPasswordValid = formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword;

  // Calculate fields remaining for button state
  let fieldsRemaining = 5;
  if (isFirstNameValid && isLastNameValid) fieldsRemaining -= 1;
  if (isEmailValid) fieldsRemaining -= 1;
  if (isMobileValid) fieldsRemaining -= 1;
  if (isPasswordValid) fieldsRemaining -= 1;
  if (isConfirmPasswordValid) fieldsRemaining -= 1;

  const isFormReady = fieldsRemaining === 0 && agreedToTerms;
  const progressPercentage = (5 - fieldsRemaining) * 20;

  const signupProgressRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (signupProgressRef.current) signupProgressRef.current.style.width = `${progressPercentage}%`;
  }, [progressPercentage]);

  // Email suggestions logic
  const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'];
  const atIndex = formData.email.indexOf('@');
  const typedDomain = atIndex !== -1 ? formData.email.slice(atIndex + 1) : '';
  const filteredDomains = formData.email.includes('@')
    ? emailDomains.filter(d => d.startsWith(typedDomain))
    : [];

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    if (name === 'email') {
      setTimeout(() => setEmailFocused(false), 200);
      const email = e.target.value.trim();
      if (/\S+@\S+\.\S+/.test(email)) {
        setIsCheckingEmail(true);
        setEmailTaken(null);
        api.auth.checkEmail(email)
          .then(res => setEmailTaken(res.data?.available === false))
          .catch(() => setEmailTaken(null))
          .finally(() => setIsCheckingEmail(false));
      }
    }
  };

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const formatted = value
      .replace(/\s+/g, ' ')
      .replace(/(?:^|\s|-|')\S/g, (match) => match.toUpperCase());
    setFormData(prev => ({ ...prev, [name]: formatted.trim() }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Allow numbers, spaces, hyphens, and parentheses
    val = val.replace(/[^\d\s\-()]/g, '');

    // Formatting based on country code
    if (countryCode === '+91') {
      const digits = val.replace(/\D/g, '');
      if (digits.length > 5) {
        val = `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
      } else {
        val = digits;
      }
    } else if (countryCode === '+1') {
      const digits = val.replace(/\D/g, '');
      if (digits.length > 6) {
        val = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
      } else if (digits.length > 3) {
        val = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      } else {
        val = digits;
      }
    } else {
      // General format
      val = val.replace(/\D/g, '');
    }

    setFormData(prev => ({ ...prev, mobile: val }));
    setTouched(prev => ({ ...prev, mobile: true }));
    if (errors.mobile) setErrors(prev => ({ ...prev, mobile: '' }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'email') setEmailTaken(null);
  };

  const generateStrongPassword = () => {
    const length = 14;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";

    const uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowers = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const specials = "!@#$%^&*()_+";

    password += uppers[Math.floor(Math.random() * uppers.length)];
    password += lowers[Math.floor(Math.random() * lowers.length)];
    password += digits[Math.floor(Math.random() * digits.length)];
    password += specials[Math.floor(Math.random() * specials.length)];

    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    const shuffled = password.split('').sort(() => 0.5 - Math.random()).join('');

    setFormData(prev => ({
      ...prev,
      password: shuffled,
      confirmPassword: shuffled,
    }));

    setTouched(prev => ({
      ...prev,
      password: true,
      confirmPassword: true,
    }));

    setErrors(prev => ({
      ...prev,
      password: '',
      confirmPassword: '',
    }));
  };

  const calculateStrength = () => {
    if (!formData.password) return 0;
    let score = 0;
    if (hasMinLength) score += 1;
    if (hasUppercase && hasLowercase) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;
    return Math.max(1, score);
  };

  const strengthScore = calculateStrength();

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
    if (!isFirstNameValid) newErrors.firstName = 'Required';
    if (!isLastNameValid) newErrors.lastName = 'Required';
    if (!isEmailFormatValid) newErrors.email = 'Invalid email address';
    else if (emailTaken === true) newErrors.email = 'This email is already registered';
    if (!isMobileValid) newErrors.mobile = 'Invalid mobile number';
    if (!isPasswordValid) newErrors.password = 'Password does not meet requirements';
    if (!isConfirmPasswordValid) newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all as touched to show validations
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      mobile: true,
      password: true,
      confirmPassword: true,
    });

    if (!validateForm()) return;
    setIsLoading(true);
    const fullMobile = `${countryCode} ${formData.mobile.trim()}`;
    try {
      if (onSubmit) {
        // onSubmit (AuthFlow) re-throws on failure, so a duplicate/failed signup
        // skips setIsSuccess and the success screen is never shown.
        await onSubmit({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          mobile: fullMobile,
          password: formData.password,
        });
        setIsSuccess(true);
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

        setIsSuccess(true);
        setTimeout(() => {
          window.location.href = '/onboarding';
        }, 1500);
      }
    } catch (error: any) {
      // When a parent onSubmit handler is supplied (AuthFlow), it owns the
      // user-facing message (toast) and re-throws purely to stop the form, so
      // we must NOT show the success screen and should not duplicate the error.
      if (onSubmit) return;
      const genericDuplicate = "We couldn't create your account with these details. If you already have an account, please sign in — otherwise try a different email or phone number.";
      const codeMap: Record<string, string> = {
        EMAIL_EXISTS: genericDuplicate,
        PHONE_EXISTS: genericDuplicate,
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

  const inputBase = (hasError: boolean) =>
    `w-full pl-10 pr-10 pt-5 pb-1.5 bg-white border rounded-xl text-gray-900 placeholder-transparent text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
        : 'border-gray-200 hover:border-gray-300 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white'
    }`;

  const labelBase = `absolute left-10 top-1.5 text-[10px] font-semibold text-gray-400 transition-all duration-200 pointer-events-none
    peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:font-normal
    peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-blue-500 peer-focus:font-semibold`;

  if (isSuccess) {
    return (
      <div className="text-center py-12 px-6 flex flex-col items-center justify-center space-y-4 animate-fade-in bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-xl">
        <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center text-emerald-500 shadow-md">
          <Check size={36} className="animate-bounce" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Account Created Successfully!</h2>
        <p className="text-sm text-gray-500 animate-pulse">Preparing your financial dashboard...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600 text-center">{errors.general}</p>
        </div>
      )}

      {/* Progress Bar */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-semibold text-gray-500">Account Setup</span>
          <span className="text-xs font-bold text-blue-600">{progressPercentage}%</span>
        </div>
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            ref={signupProgressRef}
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
          />
        </div>
      </div>

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        {(['firstName', 'lastName'] as const).map((field, idx) => {
          const isValid = field === 'firstName' ? isFirstNameValid : isLastNameValid;
          const hasError = touched[field] && !isValid;
          return (
            <div key={field} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <User size={16} />
              </div>
              <input
                type="text"
                id={field}
                name={field}
                value={formData[field]}
                onChange={handleInputChange}
                onBlur={handleNameBlur}
                disabled={isLoading}
                placeholder=" "
                data-testid={`auth-signup-${field === 'firstName' ? 'firstname' : 'lastname'}-input`}
                className={`${inputBase(hasError)} peer`}
                autoComplete={field === 'firstName' ? 'given-name' : 'family-name'}
              />
              <label htmlFor={field} className={labelBase}>
                {idx === 0 ? 'First Name' : 'Last Name'}
              </label>

              {/* Real-time Status Icon */}
              {touched[field] && (
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  {isValid ? (
                    <Check className="text-emerald-500" size={16} />
                  ) : (
                    <AlertCircle className="text-red-500" size={16} />
                  )}
                </div>
              )}
              {hasError && errors[field] && <p className="mt-1 text-xs text-red-500 pl-1">{errors[field]}</p>}
            </div>
          );
        })}
      </div>

      {/* Email */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Mail size={16} />
        </div>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => setEmailFocused(true)}
          disabled={isLoading}
          placeholder=" "
          data-testid="auth-signup-email-input"
          className={`${inputBase(touched.email && !isEmailValid)} peer`}
          autoComplete="email"
        />
        <label htmlFor="email" className={labelBase}>
          Email Address
        </label>

        {/* Real-time Status Icon */}
        {touched.email && (
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            {isCheckingEmail ? (
              <Loader2 className="text-gray-400 animate-spin" size={16} />
            ) : isEmailValid ? (
              <Check className="text-emerald-500" size={16} />
            ) : (
              <AlertCircle className="text-red-500" size={16} />
            )}
          </div>
        )}

        {/* Email domain autocomplete suggestions */}
        {emailFocused && filteredDomains.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden py-1">
            {filteredDomains.map(domain => {
              const prefix = formData.email.split('@')[0];
              const suggestion = `${prefix}@${domain}`;
              return (
                <button
                  key={domain}
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                  onMouseDown={(e) => {
                    // Prevent blur from firing before suggestion selection completes
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, email: suggestion }));
                    setTouched(prev => ({ ...prev, email: true }));
                    setEmailFocused(false);
                  }}
                >
                  Use <span className="font-semibold text-blue-600">{suggestion}</span>
                </button>
              );
            })}
          </div>
        )}
        {touched.email && emailTaken === true && (
          <p className="mt-1 text-xs text-red-500 pl-1">This email is already registered. <button type="button" className="underline font-semibold" onClick={onSwitchToSignIn}>Sign in instead</button></p>
        )}
        {touched.email && !isEmailFormatValid && emailTaken !== true && <p className="mt-1 text-xs text-red-500 pl-1">Please enter a valid email address</p>}
      </div>

      {/* Mobile */}
      <div className="relative">
        {/* Aligned Country Code Selector prefix */}
        <div className="absolute inset-y-0 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
          <Phone size={16} className="text-gray-400 flex-shrink-0" />
          <div className="pointer-events-auto flex items-center">
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => {
                setCountryCode(e.target.value);
                setFormData(prev => ({ ...prev, mobile: '' }));
              }}
              disabled={isLoading}
              data-testid="auth-signup-country-code-select"
              className="bg-transparent border-0 outline-none text-xs font-bold text-gray-700 cursor-pointer py-1 pl-0.5 pr-3.5 focus:ring-0 focus:ring-offset-0 appearance-none bg-[right_center] bg-no-repeat"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundSize: '8px',
                paddingRight: '12px'
              }}
            >
              {countryCodes.map(c => (
                <option key={c.code} value={c.code} className="text-gray-900 font-medium">
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="h-5 w-px bg-gray-200" />
        </div>

        <input
          type="tel"
          id="mobile"
          name="mobile"
          value={formData.mobile}
          onChange={handlePhoneChange}
          onBlur={handleBlur}
          disabled={isLoading}
          placeholder=" "
          data-testid="auth-signup-mobile-input"
          className={`${inputBase(touched.mobile && !isMobileValid)} peer !pl-[6.2rem] pr-10`}
          autoComplete="tel"
        />
        <label htmlFor="mobile" className={`${labelBase} !left-[6.2rem]`}>
          Mobile Number
        </label>

        {/* Real-time Status Icon */}
        {touched.mobile && (
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            {isMobileValid ? (
              <Check className="text-emerald-500" size={16} />
            ) : (
              <AlertCircle className="text-red-500" size={16} />
            )}
          </div>
        )}
        {touched.mobile && !isMobileValid && <p className="mt-1 text-xs text-red-500 pl-1">Please enter a valid mobile number</p>}
      </div>

      {/* Password */}
      <div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Lock size={16} />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            onBlur={handleBlur}
            disabled={isLoading}
            placeholder=" "
            data-testid="auth-signup-password-input"
            className={`${inputBase(touched.password && !isPasswordValid)} peer pr-12`}
            autoComplete="new-password"
          />
          <label htmlFor="password" className={labelBase}>
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            data-testid="auth-signup-password-toggle"
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Password suggestion generator & strength meter */}
        <div className="mt-2 flex justify-between items-center">
          <button
            type="button"
            onClick={generateStrongPassword}
            data-testid="auth-signup-suggest-password-button"
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors"
          >
            <Sparkles size={12} /> Suggest a strong password
          </button>
          {formData.password && getStrengthLabel()}
        </div>

        {formData.password && (
          <div className="mt-1.5 flex gap-1 h-1 w-full">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-full flex-1 rounded-full transition-all duration-300 ${getStrengthColor(i)}`} />
            ))}
          </div>
        )}

        {/* Requirements Checklist */}
        {formData.password && (
          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5">
            <span className="text-xs font-semibold text-gray-500 block mb-1">Password Check</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-gray-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasMinLength ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasMinLength ? 'text-emerald-700 font-medium' : ''}>Min 8 characters</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasUppercase ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasUppercase ? 'text-emerald-700 font-medium' : ''}>Uppercase letter</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasLowercase ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasLowercase ? 'text-emerald-700 font-medium' : ''}>Lowercase letter</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasNumber ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasNumber ? 'text-emerald-700 font-medium' : ''}>Number (0-9)</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 col-span-2">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasSpecial ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasSpecial ? 'text-emerald-700 font-medium' : ''}>Special character (!@#$ etc.)</span>
              </div>
            </div>
          </div>
        )}
        {touched.password && !isPasswordValid && <p className="mt-1 text-xs text-red-500 pl-1">Password must meet all requirements</p>}
      </div>

      {/* Confirm Password */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Lock size={16} />
        </div>
        <input
          type={showConfirmPassword ? 'text' : 'password'}
          id="confirmPassword"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={isLoading}
          placeholder=" "
          className={`${inputBase(touched.confirmPassword && !isConfirmPasswordValid)} peer pr-16`}
          autoComplete="new-password"
          data-testid="auth-signup-confirm-password-input"
        />
        <label htmlFor="confirmPassword" className={labelBase}>
          Confirm Password
        </label>

        {/* Verification indicator */}
        <div className="absolute inset-y-0 right-10 flex items-center pointer-events-none">
          {touched.confirmPassword && (
            isConfirmPasswordValid ? (
              <Check className="text-emerald-500" size={16} />
            ) : (
              <AlertCircle className="text-red-500" size={16} />
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          data-testid="auth-signup-confirm-password-toggle"
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {touched.confirmPassword && !isConfirmPasswordValid && (
          <p className="mt-1 text-xs text-red-500 pl-1">Passwords do not match</p>
        )}
      </div>

      {/* Terms */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 flex items-center justify-center gap-2">
        <input
          type="checkbox"
          id="agreeToTerms"
          name="agreeToTerms"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          disabled={isLoading}
          data-testid="auth-signup-terms-checkbox"
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
        />
        <label htmlFor="agreeToTerms" className="text-[11px] font-bold text-blue-700 cursor-pointer select-none whitespace-nowrap flex items-center gap-1">
          I agree to the
          <button type="button" onClick={onViewTerms} data-testid="auth-signup-view-terms-button" className="font-bold underline hover:text-blue-900 transition-colors">Terms of Service</button>
          and
          <button type="button" onClick={onViewPrivacy} data-testid="auth-signup-view-privacy-button" className="font-bold underline hover:text-blue-900 transition-colors">Privacy Policy</button>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !isFormReady}
        data-testid="auth-signup-submit-button"
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.35)]"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />
            Creating account...
          </>
        ) : fieldsRemaining > 0 ? (
          `Complete ${fieldsRemaining} more field${fieldsRemaining > 1 ? 's' : ''}`
        ) : !agreedToTerms ? (
          'Agree to terms to continue'
        ) : (
          'Create Account ✓ Ready'
        )}
      </button>

      <p className="text-center text-sm text-gray-500 pt-1 font-medium">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          data-testid="auth-signup-switch-signin-button"
          className="text-blue-600 hover:text-blue-700 font-bold transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
};
