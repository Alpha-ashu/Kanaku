import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Eye, EyeOff, Mail, Lock, User, Phone, Check, ChevronDown, Search, Sparkles, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

interface SignUpFormProps {
  onSwitchToSignIn: () => void;
  onSubmit?: (data: { firstName: string; lastName: string; email: string; mobile: string; password: string }) => Promise<void>;
  onViewTerms?: () => void;
  onViewPrivacy?: () => void;
}

interface Country {
  iso: string;
  code: string;
  flag: string;
  name: string;
  placeholder: string;
  digits: number;
}

const COUNTRIES: Country[] = [
  { iso: 'IN', code: '+91', flag: '🇮🇳', name: 'India', placeholder: '98765 43210', digits: 10 },
  { iso: 'US', code: '+1', flag: '🇺🇸', name: 'United States', placeholder: '(555) 000-0000', digits: 10 },
  { iso: 'GB', code: '+44', flag: '🇬🇧', name: 'United Kingdom', placeholder: '7911 123456', digits: 10 },
  { iso: 'AE', code: '+971', flag: '🇦🇪', name: 'United Arab Emirates', placeholder: '50 123 4567', digits: 9 },
  { iso: 'SG', code: '+65', flag: '🇸🇬', name: 'Singapore', placeholder: '8123 4567', digits: 8 },
  { iso: 'CA', code: '+1', flag: '🇨🇦', name: 'Canada', placeholder: '(555) 000-0000', digits: 10 },
  { iso: 'AU', code: '+61', flag: '🇦🇺', name: 'Australia', placeholder: '412 345 678', digits: 9 },
  { iso: 'DE', code: '+49', flag: '🇩🇪', name: 'Germany', placeholder: '151 12345678', digits: 11 },
  { iso: 'FR', code: '+33', flag: '🇫🇷', name: 'France', placeholder: '6 12 34 56 78', digits: 9 },
  { iso: 'SA', code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', placeholder: '50 123 4567', digits: 9 },
  { iso: 'QA', code: '+974', flag: '🇶🇦', name: 'Qatar', placeholder: '3312 3456', digits: 8 },
  { iso: 'KW', code: '+965', flag: '🇰🇼', name: 'Kuwait', placeholder: '9123 4567', digits: 8 },
  { iso: 'BH', code: '+973', flag: '🇧🇭', name: 'Bahrain', placeholder: '3612 3456', digits: 8 },
  { iso: 'OM', code: '+968', flag: '🇴🇲', name: 'Oman', placeholder: '9123 4567', digits: 8 },
  { iso: 'MY', code: '+60', flag: '🇲🇾', name: 'Malaysia', placeholder: '12-345 6789', digits: 9 },
  { iso: 'JP', code: '+81', flag: '🇯🇵', name: 'Japan', placeholder: '90 1234 5678', digits: 10 },
  { iso: 'CH', code: '+41', flag: '🇨🇭', name: 'Switzerland', placeholder: '79 123 45 67', digits: 9 },
  { iso: 'NL', code: '+31', flag: '🇳🇱', name: 'Netherlands', placeholder: '6 12345678', digits: 9 },
];

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
  const [handoverStalled, setHandoverStalled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [emailTaken, setEmailTaken] = useState<boolean | null>(null);
  const [mobileTaken, setMobileTaken] = useState<boolean | null>(null);

  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const countrySearchInputRef = useRef<HTMLInputElement>(null);

  const countryCode = selectedCountry.code;

  // Close country dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
        setCountrySearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isCountryDropdownOpen) {
      setTimeout(() => countrySearchInputRef.current?.focus(), 50);
    }
  }, [isCountryDropdownOpen]);

  // Dynamic Validation States
  const isFirstNameValid = formData.firstName.trim().length > 0;
  const isLastNameValid = formData.lastName.trim().length > 0;
  const isEmailFormatValid = /\S+@\S+\.\S+/.test(formData.email);
  const isEmailValid = isEmailFormatValid && emailTaken !== true;

  const isMobileValid = (() => {
    const digits = formData.mobile.replace(/\D/g, '');
    return digits.length === selectedCountry.digits;
  })();

  // Password requirements checks
  const hasMinLength = formData.password.length >= 8;
  const hasUppercase = /[A-Z]/.test(formData.password);
  const hasLowercase = /[a-z]/.test(formData.password);
  const hasNumber = /\d/.test(formData.password);
  const hasSpecial = /[^a-zA-Z\d]/.test(formData.password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  // Password strength calculation (0 to 4)
  const passwordStrengthScore = [
    hasMinLength,
    hasUppercase && hasLowercase,
    hasNumber,
    hasSpecial
  ].filter(Boolean).length;

  const isConfirmPasswordValid = formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword;

  const isFormReady =
    isFirstNameValid &&
    isLastNameValid &&
    isEmailValid &&
    isMobileValid &&
    mobileTaken !== true &&
    isPasswordValid &&
    isConfirmPasswordValid &&
    agreedToTerms;

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    if (name === 'email') {
      const email = e.target.value.trim();
      if (/\S+@\S+\.\S+/.test(email)) {
        api.auth.checkEmail(email)
          .then(res => setEmailTaken(res.data?.available === false))
          .catch(() => setEmailTaken(null));
      }
    }
    if (name === 'mobile') {
      const mobile = e.target.value.trim();
      const fullMobile = `${countryCode} ${mobile}`;
      if (isMobileValid) {
        api.auth.checkPhone(fullMobile)
          .then(res => setMobileTaken(res.data?.available === false))
          .catch(() => setMobileTaken(null));
      }
    }
  };

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const formatted = value
      .replace(/\s+/g, ' ')
      .replace(/(?:^|\s|-|')\S/g, (match) => match.toUpperCase());
    setFormData(prev => ({ ...prev, [name]: formatted.trim() }));
    handleBlur(e);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^\d\s()-]/g, '');
    const rawDigits = value.replace(/\D/g, '');

    // Format phone number by country
    if (selectedCountry.code === '+91') {
      if (rawDigits.length > 10) return;
      if (rawDigits.length > 5) {
        value = `${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`;
      } else {
        value = rawDigits;
      }
    } else if (selectedCountry.code === '+1') {
      if (rawDigits.length > 10) return;
      if (rawDigits.length > 6) {
        value = `(${rawDigits.slice(0, 3)}) ${rawDigits.slice(3, 6)}-${rawDigits.slice(6)}`;
      } else if (rawDigits.length > 3) {
        value = `(${rawDigits.slice(0, 3)}) ${rawDigits.slice(3)}`;
      } else {
        value = rawDigits;
      }
    } else if (selectedCountry.code === '+65' || selectedCountry.code === '+974' || selectedCountry.code === '+965') {
      if (rawDigits.length > 8) return;
      if (rawDigits.length > 4) {
        value = `${rawDigits.slice(0, 4)} ${rawDigits.slice(4)}`;
      } else {
        value = rawDigits;
      }
    } else {
      if (rawDigits.length > selectedCountry.digits) return;
      value = rawDigits;
    }

    setFormData(prev => ({ ...prev, mobile: value }));
    setTouched(prev => ({ ...prev, mobile: true }));
    if (errors.mobile) setErrors(prev => ({ ...prev, mobile: '' }));
    setMobileTaken(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'email') setEmailTaken(null);
    if (name === 'mobile') setMobileTaken(null);
  };

  // Generate strong password
  const handleSuggestPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let suggested = '';
    suggested += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)];
    suggested += 'abcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 24)];
    suggested += '23456789'[Math.floor(Math.random() * 8)];
    suggested += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    for (let i = 0; i < 10; i++) {
      suggested += chars[Math.floor(Math.random() * chars.length)];
    }
    // Shuffle
    suggested = suggested.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, password: suggested, confirmPassword: suggested }));
    setTouched(prev => ({ ...prev, password: true, confirmPassword: true }));
    setShowPassword(true);
    setShowConfirmPassword(true);
  };

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
    else if (mobileTaken === true) newErrors.mobile = 'This phone number is already registered. Please use a different phone number.';
    if (!isPasswordValid) newErrors.password = 'Password does not meet requirements';
    if (!isConfirmPasswordValid) newErrors.confirmPassword = 'Passwords do not match';
    if (!agreedToTerms) newErrors.terms = 'Please accept the Terms of Service and Privacy Policy to continue';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      mobile: true,
      password: true,
      confirmPassword: true,
      terms: true,
    });

    if (!validateForm()) return;
    setIsLoading(true);
    const fullMobile = `${countryCode} ${formData.mobile.trim()}`;
    try {
      if (onSubmit) {
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
        localStorage.setItem('user_email', formData.email);
        localStorage.setItem('user_name', `${formData.firstName} ${formData.lastName}`);

        setIsSuccess(true);
        setTimeout(() => {
          window.location.href = '/onboarding';
        }, 1500);
      }
    } catch (error: any) {
      if (onSubmit) return;
      setErrors({ general: error.message || 'Registration failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
    c.code.includes(countrySearchQuery)
  );

  const inputBase = (hasError: boolean) =>
    `w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-50/70 border rounded-xl sm:rounded-2xl text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
      hasError
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400 bg-red-50/30'
        : 'border-slate-200/90 hover:border-slate-300 focus:ring-violet-500/20 focus:border-violet-600 focus:bg-white'
    }`;

  if (isSuccess) {
    return (
      <div className="text-center py-10 px-4 sm:px-6 flex flex-col items-center justify-center space-y-4 animate-fade-in bg-white/90 backdrop-blur-md rounded-3xl border border-emerald-100 shadow-xl">
        <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Check size={32} className="animate-bounce" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Account Created Successfully!</h2>
        <p className="text-xs sm:text-sm text-slate-500 animate-pulse font-medium">Preparing your setup environment...</p>

        {handoverStalled && (
          <div className="pt-3 space-y-2">
            <p className="text-xs text-slate-500">
              Taking longer than usual?
            </p>
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="text-xs sm:text-sm font-bold text-violet-600 hover:text-violet-700 underline underline-offset-2"
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
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 sm:p-3.5 flex items-center gap-2.5 text-rose-700 animate-in fade-in-50">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <p className="text-xs font-semibold leading-relaxed">{errors.general}</p>
        </div>
      )}

      {/* Name row - Responsive: 1 col on xs mobile, 2 col on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
        {(['firstName', 'lastName'] as const).map((field, idx) => {
          const isValid = field === 'firstName' ? isFirstNameValid : isLastNameValid;
          const hasError = touched[field] && !isValid;
          return (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>{idx === 0 ? 'First Name' : 'Last Name'} <span className="text-rose-500">*</span></span>
                {touched[field] && isValid && (
                  <span className="text-emerald-600 flex items-center gap-0.5 text-2xs font-semibold">
                    <Check size={12} /> Valid
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
                  placeholder={idx === 0 ? 'e.g. John' : 'e.g. Kanaku'}
                  data-testid={`auth-signup-${field === 'firstName' ? 'firstname' : 'lastname'}-input`}
                  className={inputBase(hasError)}
                  autoComplete={field === 'firstName' ? 'given-name' : 'family-name'}
                />
              </div>
              {hasError && errors[field] && (
                <p className="mt-1 text-xs text-rose-600 pl-1 font-medium flex items-center gap-1">
                  <span>{errors[field]}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>Email Address <span className="text-rose-500">*</span></span>
          {touched.email && isEmailValid && (
            <span className="text-emerald-600 flex items-center gap-0.5 text-2xs font-semibold">
              <Check size={12} /> Valid email
            </span>
          )}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Mail size={16} />
          </div>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            onBlur={handleBlur}
            disabled={isLoading}
            placeholder="name@example.com"
            data-testid="auth-signup-email-input"
            className={inputBase(touched.email && !isEmailValid)}
            autoComplete="email"
          />
        </div>
        {touched.email && emailTaken === true && (
          <p className="mt-1.5 text-xs text-rose-600 pl-1 font-medium">
            This email is already in use.{' '}
            <button
              data-testid="sign-up-form-sign-in-instead"
              type="button"
              className="inline text-xs underline font-bold text-violet-700 hover:text-violet-800"
              onClick={onSwitchToSignIn}
            >
              Sign in instead
            </button>
          </p>
        )}
        {touched.email && !isEmailFormatValid && emailTaken !== true && (
          <p className="mt-1 text-xs text-rose-600 pl-1 font-medium">Please enter a valid email address</p>
        )}
      </div>

      {/* Mobile Number with Country Code & Flag Selector */}
      <div className="relative" ref={countryDropdownRef}>
        <label htmlFor="mobile" className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>Mobile Number <span className="text-rose-500">*</span></span>
          {touched.mobile && isMobileValid && mobileTaken !== true && (
            <span className="text-emerald-600 flex items-center gap-0.5 text-2xs font-semibold">
              <Check size={12} /> Valid number
            </span>
          )}
        </label>

        {/* Hidden select for backwards compatibility and tests */}
        <select
          aria-label="Country code"
          value={selectedCountry.code}
          onChange={(e) => {
            const found = COUNTRIES.find(c => c.code === e.target.value || c.iso === e.target.value) || COUNTRIES[0];
            setSelectedCountry(found);
            setFormData(prev => ({ ...prev, mobile: '' }));
            setMobileTaken(null);
          }}
          disabled={isLoading}
          data-testid="auth-signup-country-code-select"
          className="sr-only pointer-events-none"
          tabIndex={-1}
        >
          {COUNTRIES.map(c => (
            <option data-testid={`sign-up-form-option-${c.code}`} key={c.iso} value={c.code}>
              {c.flag} {c.code} ({c.name})
            </option>
          ))}
        </select>

        <div className={`relative flex items-stretch rounded-xl sm:rounded-2xl border transition-all duration-200 ${
          touched.mobile && (!isMobileValid || mobileTaken === true)
            ? 'border-rose-300 bg-rose-50/20 focus-within:ring-2 focus-within:ring-rose-500/20 focus-within:border-rose-500'
            : 'border-slate-200/90 bg-slate-50/70 hover:border-slate-300 focus-within:bg-white focus-within:border-violet-600 focus-within:ring-2 focus-within:ring-violet-500/20'
        }`}>
          {/* Custom Country Flag & Code Trigger Button */}
          <button
            type="button"
            onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
            disabled={isLoading}
            className="flex items-center gap-1.5 pl-3 pr-2.5 sm:px-3.5 border-r border-slate-200/80 bg-slate-100/60 hover:bg-slate-100 rounded-l-xl sm:rounded-l-2xl select-none shrink-0 transition-colors cursor-pointer group"
            title={`${selectedCountry.name} (${selectedCountry.code})`}
            aria-expanded={isCountryDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="text-base sm:text-lg leading-none" role="img" aria-label={selectedCountry.name}>
              {selectedCountry.flag}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
              {selectedCountry.code}
            </span>
            <ChevronDown size={14} className={`text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Phone Input Field */}
          <div className="relative flex-1 min-w-0 flex items-center">
            <input
              type="tel"
              inputMode="tel"
              id="mobile"
              name="mobile"
              value={formData.mobile}
              onChange={handlePhoneChange}
              onBlur={handleBlur}
              disabled={isLoading}
              placeholder={selectedCountry.placeholder}
              data-testid="auth-signup-mobile-input"
              className="w-full min-w-0 bg-transparent py-2.5 sm:py-3 pl-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none rounded-r-xl sm:rounded-r-2xl font-medium"
              autoComplete="tel"
            />
            {touched.mobile && isMobileValid && mobileTaken !== true && (
              <div className="absolute right-3 text-emerald-500 pointer-events-none">
                <CheckCircle2 size={16} />
              </div>
            )}
          </div>
        </div>

        {/* Floating Custom Country Dropdown Popover */}
        {isCountryDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-full sm:w-80 max-w-[340px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Search Box */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={countrySearchInputRef}
                  type="text"
                  placeholder="Search country or code..."
                  value={countrySearchQuery}
                  onChange={(e) => setCountrySearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-900"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-56 overflow-y-auto p-1.5 divide-y divide-slate-50 scrollbar-thin scrollbar-thumb-slate-200">
              {filteredCountries.length > 0 ? (
                filteredCountries.map(country => (
                  <button
                    key={country.iso}
                    type="button"
                    onClick={() => {
                      setSelectedCountry(country);
                      setIsCountryDropdownOpen(false);
                      setCountrySearchQuery('');
                      setFormData(prev => ({ ...prev, mobile: '' }));
                      setMobileTaken(null);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-left text-xs transition-colors cursor-pointer ${
                      country.iso === selectedCountry.iso
                        ? 'bg-violet-50 text-violet-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-lg leading-none" role="img" aria-label={country.name}>
                        {country.flag}
                      </span>
                      <span className="truncate font-medium">{country.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-2xs text-slate-500 font-bold">{country.code}</span>
                      {country.iso === selectedCountry.iso && (
                        <Check size={14} className="text-violet-600 shrink-0" />
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching countries found
                </div>
              )}
            </div>
          </div>
        )}

        {touched.mobile && mobileTaken === true && (
          <p className="mt-1 text-xs text-rose-600 pl-1 font-medium">This phone number is already registered to another account.</p>
        )}
        {touched.mobile && !isMobileValid && mobileTaken !== true && (
          <p className="mt-1 text-xs text-rose-600 pl-1 font-medium">Please enter a valid {selectedCountry.digits}-digit mobile number</p>
        )}
      </div>

      {/* Password with Strength Meter & Suggestion */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="password" className="block text-xs font-bold text-slate-700">
            Password <span className="text-rose-500">*</span>
          </label>
          <button
            type="button"
            data-testid="auth-signup-suggest-password-button"
            onClick={handleSuggestPassword}
            className="inline-flex items-center gap-1 text-2xs font-bold text-violet-600 hover:text-violet-700 hover:underline cursor-pointer"
          >
            <Sparkles size={11} className="text-violet-500" />
            Suggest Strong Password
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
            placeholder="At least 8 characters"
            data-testid="auth-signup-password-input"
            className={`${inputBase(touched.password && !isPasswordValid)} pr-11`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            data-testid="auth-signup-password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Dynamic Password Strength Indicator */}
        {formData.password.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-2xs font-bold">
              <span className="text-slate-500">Security strength</span>
              <span className={
                passwordStrengthScore <= 1 ? 'text-rose-500' :
                passwordStrengthScore === 2 ? 'text-amber-500' :
                passwordStrengthScore === 3 ? 'text-blue-500' : 'text-emerald-600'
              }>
                {passwordStrengthScore <= 1 ? 'Weak' :
                 passwordStrengthScore === 2 ? 'Fair' :
                 passwordStrengthScore === 3 ? 'Good' : 'Strong & Secure'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 h-1.5">
              {[1, 2, 3, 4].map(idx => (
                <div
                  key={idx}
                  className={`h-full rounded-full transition-all duration-300 ${
                    idx <= passwordStrengthScore
                      ? passwordStrengthScore === 4 ? 'bg-emerald-500 shadow-xs' :
                        passwordStrengthScore === 3 ? 'bg-blue-500' :
                        passwordStrengthScore === 2 ? 'bg-amber-400' : 'bg-rose-500'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Micro requirements badges */}
            <div className="grid grid-cols-2 gap-1 pt-1 text-2xs text-slate-500">
              <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                <Check size={11} className={hasMinLength ? 'text-emerald-600' : 'opacity-30'} /> 8+ characters
              </span>
              <span className={`flex items-center gap-1 ${hasUppercase && hasLowercase ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                <Check size={11} className={hasUppercase && hasLowercase ? 'text-emerald-600' : 'opacity-30'} /> Upper & lowercase
              </span>
              <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                <Check size={11} className={hasNumber ? 'text-emerald-600' : 'opacity-30'} /> At least 1 number
              </span>
              <span className={`flex items-center gap-1 ${hasSpecial ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                <Check size={11} className={hasSpecial ? 'text-emerald-600' : 'opacity-30'} /> Special symbol
              </span>
            </div>
          </div>
        )}

        {touched.password && !isPasswordValid && formData.password.length === 0 && (
          <p className="mt-1 text-xs text-rose-600 pl-1 font-medium">Password is required</p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>Confirm Password <span className="text-rose-500">*</span></span>
          {touched.confirmPassword && isConfirmPasswordValid && (
            <span className="text-emerald-600 flex items-center gap-0.5 text-2xs font-semibold">
              <Check size={12} /> Passwords match
            </span>
          )}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
            className={`${inputBase(touched.confirmPassword && !isConfirmPasswordValid)} pr-11`}
            autoComplete="new-password"
            data-testid="auth-signup-confirm-password-input"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            data-testid="auth-signup-confirm-password-toggle"
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {touched.confirmPassword && !isConfirmPasswordValid && formData.confirmPassword.length > 0 && (
          <p className="mt-1 text-xs text-rose-600 pl-1 font-medium">Passwords do not match</p>
        )}
      </div>

      {/* Terms & Privacy Checkbox */}
      <div className={`rounded-xl sm:rounded-2xl border p-3 sm:p-3.5 flex items-start gap-2.5 transition-colors ${
        touched.terms && !agreedToTerms
          ? 'border-rose-300 bg-rose-50/20'
          : 'border-slate-200/80 bg-slate-50/70 hover:bg-slate-50'
      }`}>
        <input
          type="checkbox"
          id="agreeToTerms"
          name="agreeToTerms"
          checked={agreedToTerms}
          onChange={(e) => {
            setAgreedToTerms(e.target.checked);
            if (errors.terms) setErrors(prev => ({ ...prev, terms: '' }));
          }}
          disabled={isLoading}
          data-testid="auth-signup-terms-checkbox"
          className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-violet-600 focus:ring-violet-500/20 cursor-pointer accent-violet-600 shrink-0"
        />
        <label htmlFor="agreeToTerms" className="text-xs text-slate-600 leading-relaxed cursor-pointer select-none">
          I agree to the{' '}
          <button
            type="button"
            onClick={onViewTerms}
            data-testid="auth-signup-view-terms-button"
            className="inline text-xs font-bold text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={onViewPrivacy}
            data-testid="auth-signup-view-privacy-button"
            className="inline text-xs font-bold text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
        </label>
      </div>
      {touched.terms && !agreedToTerms && (
        <p className="text-xs text-rose-600 pl-1 font-medium -mt-2">Please agree to the Terms of Service and Privacy Policy to continue</p>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        data-testid="auth-signup-submit-button"
        className="w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 active:scale-[0.99] text-white font-bold py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_25px_-4px_rgba(124,58,237,0.35)] hover:shadow-[0_10px_30px_-4px_rgba(124,58,237,0.45)] text-sm h-11 sm:h-12 cursor-pointer"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />
            <span>Creating account...</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            Create Free Account <span className="text-white/80">→</span>
          </span>
        )}
      </button>

      {/* Switch to Sign In */}
      <p className="text-center text-xs sm:text-sm text-slate-500 pt-2 font-medium">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          data-testid="auth-signup-switch-signin-button"
          className="text-violet-600 hover:text-violet-800 font-extrabold underline underline-offset-2 transition-colors cursor-pointer"
        >
          Sign in
        </button>
      </p>
    </form>
  );
};
