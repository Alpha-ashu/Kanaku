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
  // Set once the post-signup handover has visibly overrun, so the success
  // screen can offer a way out instead of spinning forever. See the success
  // branch below for why that screen would otherwise be a dead end.
  const [handoverStalled, setHandoverStalled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');
  const [emailTaken, setEmailTaken] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [mobileTaken, setMobileTaken] = useState<boolean | null>(null);
  const [isCheckingMobile, setIsCheckingMobile] = useState(false);

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
  if (isMobileValid && mobileTaken !== true) fieldsRemaining -= 1;
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
    if (name === 'mobile') {
      const mobile = e.target.value.trim();
      const fullMobile = `${countryCode} ${mobile}`;
      if (isMobileValid) {
        setIsCheckingMobile(true);
        setMobileTaken(null);
        api.auth.checkPhone(fullMobile)
          .then(res => setMobileTaken(res.data?.available === false))
          .catch(() => setMobileTaken(null))
          .finally(() => setIsCheckingMobile(false));
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
    setMobileTaken(null);
    if (errors.mobile) setErrors(prev => ({ ...prev, mobile: '' }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'email') setEmailTaken(null);
    if (name === 'mobile') setMobileTaken(null);
  };

  const generateStrongPassword = () => {
    const length = 14;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";

    const uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowers = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const specials = "!@#$%^&*()_+";

    // Use the Web Crypto CSPRNG — Math.random() is not cryptographically secure
    // and must not generate security-sensitive values like passwords (CWE-338).
    const secureIndex = (maxExclusive: number): number => {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % maxExclusive;
    };

    password += uppers[secureIndex(uppers.length)];
    password += lowers[secureIndex(lowers.length)];
    password += digits[secureIndex(digits.length)];
    password += specials[secureIndex(specials.length)];

    for (let i = 4; i < length; i++) {
      password += charset[secureIndex(charset.length)];
    }

    // Secure Fisher–Yates shuffle (replaces a Math.random() sort comparator).
    const chars = password.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = secureIndex(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const shuffled = chars.join('');

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

  // A successful handover unmounts this component within a tick or two, so this
  // timer normally never fires. It only matters when it does.
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(() => setHandoverStalled(true), 10_000);
    return () => clearTimeout(timer);
  }, [isSuccess]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!isFirstNameValid) newErrors.firstName = 'Required';
    if (!isLastNameValid) newErrors.lastName = 'Required';
    if (!isEmailFormatValid) newErrors.email = 'Invalid email address';
    else if (emailTaken === true) newErrors.email = 'This email can’t be used for a new account';
    if (!isMobileValid) newErrors.mobile = 'Invalid mobile number';
    else if (mobileTaken === true) newErrors.mobile = 'This phone number is already registered to another account. Please use a different phone number.';
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
        // Refresh token is delivered as an HttpOnly cookie — not stored by JS.
        localStorage.setItem('auth_token', tokens.accessToken);
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
    `w-full pl-10 pr-10 py-2.5 sm:py-3 bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20'
        : 'border-slate-200 hover:border-slate-300 focus:ring-violet-500/20 focus:border-violet-600 focus:bg-white'
    }`;

  if (isSuccess) {
    return (
      <div className="text-center py-12 px-6 flex flex-col items-center justify-center space-y-4 animate-fade-in bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-xl">
        <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center text-emerald-500 shadow-md">
          <Check size={36} className="animate-bounce" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Account Created Successfully!</h2>
        <p className="text-sm text-gray-500 animate-pulse">Preparing your financial dashboard...</p>

        {/* This screen has no navigation of its own — in the AuthFlow path it
            waits for the app to swap it out once the new session is live. That
            makes it a dead end if the handover ever fails, which is precisely
            how users ended up staring at "Preparing your financial dashboard..."
            indefinitely. The account exists by this point, so signing in is
            always a valid way out; offer it rather than leaving them stranded. */}
        {handoverStalled && (
          <div className="pt-2 space-y-2">
            <p className="text-xs text-gray-500">
              This is taking longer than expected.
            </p>
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
            >
              Continue to sign in
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form data-testid="sign-up-form-form" onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600 text-center font-medium">{errors.general}</p>
        </div>
      )}

      {/* Progress Bar Header */}
      <div className="mb-4 pb-3 border-b border-slate-100">
        <div className="flex justify-between items-center mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Account Setup</span>
            <span className="text-[11px] font-medium text-slate-400">
              &bull; {5 - fieldsRemaining} of 5 completed
            </span>
          </div>
          <span className="text-xs font-bold text-violet-600">{progressPercentage}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            ref={signupProgressRef}
            className="h-full bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500 rounded-full transition-all duration-300 ease-out"
          />
        </div>
      </div>

      {/* Name row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {(['firstName', 'lastName'] as const).map((field, idx) => {
          const isValid = field === 'firstName' ? isFirstNameValid : isLastNameValid;
          const hasError = touched[field] && !isValid;
          return (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-semibold text-slate-700 mb-1.5">
                {idx === 0 ? 'First Name' : 'Last Name'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
                  placeholder={idx === 0 ? 'e.g. John' : 'e.g. Doe'}
                  data-testid={`auth-signup-${field === 'firstName' ? 'firstname' : 'lastname'}-input`}
                  className={inputBase(hasError)}
                  autoComplete={field === 'firstName' ? 'given-name' : 'family-name'}
                />

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
              </div>
              {hasError && errors[field] && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">{errors[field]}</p>}
            </div>
          );
        })}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Email Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
            placeholder="name@example.com"
            data-testid="auth-signup-email-input"
            className={inputBase(touched.email && !isEmailValid)}
            autoComplete="email"
          />

          {/* Real-time Status Icon */}
          {touched.email && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              {isCheckingEmail ? (
                <Loader2 className="text-slate-400 animate-spin" size={16} />
              ) : isEmailValid ? (
                <Check className="text-emerald-500" size={16} />
              ) : (
                <AlertCircle className="text-red-500" size={16} />
              )}
            </div>
          )}

          {/* Email domain autocomplete suggestions */}
          {emailFocused && filteredDomains.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1">
              {filteredDomains.map(domain => {
                const prefix = formData.email.split('@')[0];
                const suggestion = `${prefix}@${domain}`;
                return (
                  <button data-testid={`sign-up-form-use-${domain}`}
                    key={domain}
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-violet-50 transition-colors"
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
                    Use <span className="font-semibold text-violet-600">{suggestion}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {touched.email && emailTaken === true && (
          <p className="mt-1 text-xs text-red-500 pl-1 font-medium">This email can&apos;t be used for a new account. <button data-testid="sign-up-form-sign-in-instead" type="button" className="inline text-xs underline font-semibold text-red-700 hover:text-red-800" onClick={onSwitchToSignIn}>Sign in instead</button></p>
        )}
        {touched.email && !isEmailFormatValid && emailTaken !== true && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">Please enter a valid email address</p>}
      </div>

      {/* Mobile */}
      <div>
        <label htmlFor="mobile" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Mobile Number <span className="text-red-500">*</span>
        </label>
        <div className={`relative flex items-stretch rounded-xl border transition-all duration-200 ${
          touched.mobile && (!isMobileValid || mobileTaken === true)
            ? 'border-red-300 bg-red-50/20 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500'
            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 focus-within:bg-white focus-within:border-violet-600 focus-within:ring-2 focus-within:ring-violet-500/20'
        }`}>
          {/* Country Code Prefix */}
          <div className="flex items-center pl-3 pr-2 border-r border-slate-200/80 bg-slate-100/50 rounded-l-xl select-none">
            <Phone size={15} className="text-slate-400 mr-1.5 shrink-0" />
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => {
                setCountryCode(e.target.value);
                setFormData(prev => ({ ...prev, mobile: '' }));
                setMobileTaken(null);
              }}
              disabled={isLoading}
              data-testid="auth-signup-country-code-select"
              className="bg-transparent border-0 outline-none text-xs font-bold text-slate-700 cursor-pointer py-2 pr-1 focus:ring-0 appearance-none"
            >
              {countryCodes.map(c => (
                <option data-testid={`sign-up-form-option-${c.code}`} key={c.code} value={c.code} className="text-slate-900 font-medium">
                  {c.code}
                </option>
              ))}
            </select>
          </div>

          <input
            type="tel"
            inputMode="tel"
            id="mobile"
            name="mobile"
            value={formData.mobile}
            onChange={handlePhoneChange}
            onBlur={handleBlur}
            disabled={isLoading}
            placeholder={countryCode === '+91' ? '98765 43210' : countryCode === '+1' ? '(555) 000-0000' : 'Mobile number'}
            data-testid="auth-signup-mobile-input"
            className="w-full min-w-0 bg-transparent py-2.5 sm:py-3 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none rounded-r-xl"
            autoComplete="tel"
          />

          {/* Real-time Status Icon */}
          {touched.mobile && (
            <div className="pr-3 flex items-center pointer-events-none">
              {isCheckingMobile ? (
                <Loader2 className="text-slate-400 animate-spin" size={16} />
              ) : isMobileValid && mobileTaken !== true ? (
                <Check className="text-emerald-500" size={16} />
              ) : (
                <AlertCircle className="text-red-500" size={16} />
              )}
            </div>
          )}
        </div>
        {touched.mobile && mobileTaken === true && (
          <p className="mt-1 text-xs text-red-500 pl-1 font-medium">This phone number is already registered to another account. Please use a different phone number.</p>
        )}
        {touched.mobile && !isMobileValid && mobileTaken !== true && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">Please enter a valid mobile number</p>}
      </div>

      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
            Password <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={generateStrongPassword}
            data-testid="auth-signup-suggest-password-button"
            className="text-xs text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1 transition-colors"
          >
            <Sparkles size={12} /> Suggest a strong password
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
            placeholder="Create a strong password"
            data-testid="auth-signup-password-input"
            className={`${inputBase(touched.password && !isPasswordValid)} pr-11`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            data-testid="auth-signup-password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Password suggestion generator & strength meter */}
        {formData.password && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Password strength</span>
              {getStrengthLabel()}
            </div>
            <div className="flex gap-1 h-1.5 w-full">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-full flex-1 rounded-full transition-all duration-300 ${getStrengthColor(i)}`} />
              ))}
            </div>
          </div>
        )}

        {/* Requirements Checklist */}
        {formData.password && (
          <div className="mt-2.5 bg-slate-50/80 border border-slate-100 rounded-xl p-3 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Password Requirements</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasMinLength ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasMinLength ? 'text-emerald-700 font-medium' : ''}>Min 8 characters</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasUppercase ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasUppercase ? 'text-emerald-700 font-medium' : ''}>Uppercase letter</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasLowercase ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasLowercase ? 'text-emerald-700 font-medium' : ''}>Lowercase letter</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasNumber ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasNumber ? 'text-emerald-700 font-medium' : ''}>Number (0-9)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 col-span-2">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${hasSpecial ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Check size={10} />
                </div>
                <span className={hasSpecial ? 'text-emerald-700 font-medium' : ''}>Special character (!@#$ etc.)</span>
              </div>
            </div>
          </div>
        )}
        {touched.password && !isPasswordValid && <p className="mt-1 text-xs text-red-500 pl-1 font-medium">Password must meet all requirements</p>}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Confirm Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
            placeholder="Re-enter your password"
            className={`${inputBase(touched.confirmPassword && !isConfirmPasswordValid)} pr-16`}
            autoComplete="new-password"
            data-testid="auth-signup-confirm-password-input"
          />

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
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {touched.confirmPassword && !isConfirmPasswordValid && (
          <p className="mt-1 text-xs text-red-500 pl-1 font-medium">Passwords do not match</p>
        )}
      </div>

      {/* Terms */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 flex items-start gap-2.5 transition-colors hover:bg-slate-50">
        <input
          type="checkbox"
          id="agreeToTerms"
          name="agreeToTerms"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          disabled={isLoading}
          data-testid="auth-signup-terms-checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500/20 cursor-pointer accent-violet-600 shrink-0"
        />
        <label htmlFor="agreeToTerms" className="text-xs text-slate-600 leading-normal cursor-pointer select-none">
          I agree to the{' '}
          <button
            type="button"
            onClick={onViewTerms}
            data-testid="auth-signup-view-terms-button"
            className="inline text-xs font-semibold text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={onViewPrivacy}
            data-testid="auth-signup-view-privacy-button"
            className="inline text-xs font-semibold text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors"
          >
            Privacy Policy
          </button>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !isFormReady}
        data-testid="auth-signup-submit-button"
        className="w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 active:scale-[0.99] text-white font-bold py-3 sm:py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(124,58,237,0.25)] hover:shadow-[0_6px_22px_rgba(124,58,237,0.35)] text-sm h-11 sm:h-12"
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
          'Create Account'
        )}
      </button>

      <p className="text-center text-xs sm:text-sm text-slate-500 pt-1 font-normal">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          data-testid="auth-signup-switch-signin-button"
          className="text-violet-600 hover:text-violet-700 font-bold underline underline-offset-2 transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
};
