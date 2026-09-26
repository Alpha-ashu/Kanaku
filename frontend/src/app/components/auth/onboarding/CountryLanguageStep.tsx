import React, { useState, useRef, useEffect } from 'react';
import { Languages, MapPin, ChevronRight, SkipForward } from 'lucide-react';

interface CountryLanguageStepProps {
 data: {
 country: string;
 state: string;
 city: string;
 language: string;
 };
 onUpdate: (data: any) => void;
 onNext: () => void;
 onBack: () => void;
 onSkip?: () => void;
}

// Location suggestions: City, State, Country
const LOCATION_SUGGESTIONS = [
  // India
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India', flag: '🇮🇳' },
  { city: 'Mumbai', state: 'Maharashtra', country: 'India', flag: '🇮🇳' },
  { city: 'Delhi', state: 'Delhi', country: 'India', flag: '🇮🇳' },
  { city: 'Bengaluru', state: 'Karnataka', country: 'India', flag: '🇮🇳' },
  { city: 'Hyderabad', state: 'Telangana', country: 'India', flag: '🇮🇳' },
  { city: 'Ahmedabad', state: 'Gujarat', country: 'India', flag: '🇮🇳' },
  { city: 'Kolkata', state: 'West Bengal', country: 'India', flag: '🇮🇳' },
  { city: 'Pune', state: 'Maharashtra', country: 'India', flag: '🇮🇳' },
  { city: 'Jaipur', state: 'Rajasthan', country: 'India', flag: '🇮🇳' },
  { city: 'Surat', state: 'Gujarat', country: 'India', flag: '🇮🇳' },
  { city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', flag: '🇮🇳' },
  { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', flag: '🇮🇳' },
  { city: 'Madurai', state: 'Tamil Nadu', country: 'India', flag: '🇮🇳' },
  { city: 'Kochi', state: 'Kerala', country: 'India', flag: '🇮🇳' },
  { city: 'Chandigarh', state: 'Chandigarh', country: 'India', flag: '🇮🇳' },
  { city: 'Nagpur', state: 'Maharashtra', country: 'India', flag: '🇮🇳' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India', flag: '🇮🇳' },
  { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India', flag: '🇮🇳' },
  // US
  { city: 'New York', state: 'New York', country: 'United States', flag: '🇺🇸' },
  { city: 'Los Angeles', state: 'California', country: 'United States', flag: '🇺🇸' },
  { city: 'Chicago', state: 'Illinois', country: 'United States', flag: '🇺🇸' },
  { city: 'San Francisco', state: 'California', country: 'United States', flag: '🇺🇸' },
  { city: 'Houston', state: 'Texas', country: 'United States', flag: '🇺🇸' },
  // UK
  { city: 'London', state: 'England', country: 'United Kingdom', flag: '🇬🇧' },
  { city: 'Manchester', state: 'England', country: 'United Kingdom', flag: '🇬🇧' },
  { city: 'Birmingham', state: 'England', country: 'United Kingdom', flag: '🇬🇧' },
  // Canada
  { city: 'Toronto', state: 'Ontario', country: 'Canada', flag: '🇨🇦' },
  { city: 'Vancouver', state: 'British Columbia', country: 'Canada', flag: '🇨🇦' },
  // Australia
  { city: 'Sydney', state: 'New South Wales', country: 'Australia', flag: '🇦🇺' },
  { city: 'Melbourne', state: 'Victoria', country: 'Australia', flag: '🇦🇺' },
  // UAE
  { city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', flag: '🇦🇪' },
  { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'United Arab Emirates', flag: '🇦🇪' },
  // Singapore
  { city: 'Singapore', state: 'Singapore', country: 'Singapore', flag: '🇸🇬' },
];

const LANGUAGES = [
  { value: 'English', label: 'English', flag: '🇬🇧' },
  { value: 'Hindi', label: 'हिन्दी (Hindi)', flag: '🇮🇳' },
  { value: 'Tamil', label: 'தமிழ் (Tamil)', flag: '🇮🇳' },
  { value: 'Telugu', label: 'తెలుగు (Telugu)', flag: '🇮🇳' },
  { value: 'Kannada', label: 'ಕನ್ನಡ (Kannada)', flag: '🇮🇳' },
  { value: 'Malayalam', label: 'മലയാളം (Malayalam)', flag: '🇮🇳' },
  { value: 'Bengali', label: 'বাংলা (Bengali)', flag: '🇮🇳' },
  { value: 'Marathi', label: 'मराठी (Marathi)', flag: '🇮🇳' },
  { value: 'Gujarati', label: 'ગુજરાતી (Gujarati)', flag: '🇮🇳' },
  { value: 'Spanish', label: 'Español (Spanish)', flag: '🇪🇸' },
  { value: 'French', label: 'Français (French)', flag: '🇫🇷' },
  { value: 'Arabic', label: 'العربية (Arabic)', flag: '🇦🇪' },
];


export const CountryLanguageStep: React.FC<CountryLanguageStepProps> = ({
 data,
 onUpdate,
 onNext,
 onBack,
 onSkip,
}) => {
 const [locationInput, setLocationInput] = useState(
 data.city ? `${data.city}, ${data.state}, ${data.country}` : ''
 );
 const [suggestions, setSuggestions] = useState<typeof LOCATION_SUGGESTIONS>([]);
 const [showDropdown, setShowDropdown] = useState(false);
 const [selectedLocation, setSelectedLocation] = useState<typeof LOCATION_SUGGESTIONS[0] | null>(
 data.city
 ? LOCATION_SUGGESTIONS.find(l => l.city === data.city) || null
 : null
 );
 const [errors, setErrors] = useState<Record<string, string>>({});
 const dropdownRef = useRef<HTMLDivElement>(null);
 const inputRef = useRef<HTMLInputElement>(null);

 // Close dropdown on outside click
 useEffect(() => {
 const handler = (e: MouseEvent) => {
 if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
 setShowDropdown(false);
 }
 };
 document.addEventListener('mousedown', handler);
 return () => document.removeEventListener('mousedown', handler);
 }, []);

  const handleLocationInput = (val: string) => {
    setLocationInput(val);
    setSelectedLocation(null);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = val.toLowerCase();
    const filtered = LOCATION_SUGGESTIONS.filter(
      l =>
        l.city.toLowerCase().includes(q) ||
        l.state.toLowerCase().includes(q) ||
        l.country.toLowerCase().includes(q)
    ).slice(0, 5);

    // Parse the input to offer a smart custom suggestion
    const parts = val.split(',').map(p => p.trim());
    const city = parts[0] || val;
    const state = parts[1] || '';
    const country = parts[2] || 'India'; // Default to India

    const customSuggestion = {
      city,
      state: state || 'Custom Location',
      country,
      flag: '📍',
      isCustom: true
    };

    setSuggestions([...filtered, customSuggestion]);
    setShowDropdown(true);
  };

  const handleSelectLocation = (loc: typeof LOCATION_SUGGESTIONS[0] & { isCustom?: boolean }) => {
    setSelectedLocation(loc);
    const displayVal = loc.isCustom
      ? `${loc.city}${loc.state && loc.state !== 'Custom Location' ? ', ' + loc.state : ''}, ${loc.country}`
      : `${loc.city}, ${loc.state}, ${loc.country}`;
    setLocationInput(displayVal);
    setSuggestions([]);
    setShowDropdown(false);
    onUpdate({ 
      city: loc.city, 
      state: loc.state === 'Custom Location' ? '' : loc.state, 
      country: loc.country 
    });
    setErrors(prev => ({ ...prev, location: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!selectedLocation && locationInput.trim()) {
      const parts = locationInput.split(',').map(p => p.trim());
      const city = parts[0] || '';
      const state = parts[1] || '';
      const country = parts[2] || 'India'; // Default to India
      
      const parsedLoc = { city, state, country, flag: '📍' };
      setSelectedLocation(parsedLoc);
    } else if (!locationInput.trim()) {
      newErrors.location = 'Please enter your location';
    }

    if (!data.language) {
      newErrors.language = 'Please select a preferred language';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) onNext();
  };

  return (
    <form data-testid="country-language-step-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Region &amp; Language
        </h3>
      </div>

      {/* Location input */}
      <div ref={dropdownRef} className="relative">
        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-2">
          <MapPin size={15} className="text-violet-600" />
          Your Location
        </label>
        <div className="relative">
          <input
            data-testid="country-language-step-e-g-chennai-tamil"
            ref={inputRef}
            type="text"
            value={locationInput}
            onChange={e => handleLocationInput(e.target.value)}
            onFocus={() => locationInput.length >= 2 && setShowDropdown(suggestions.length > 0)}
            placeholder="e.g. Chennai, Tamil Nadu, India"
            autoComplete="off"
            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 pr-10 text-sm bg-white text-slate-900 transition-all ${
              errors.location ? 'border-red-400 bg-red-50/30' : selectedLocation ? 'border-emerald-400/80 bg-emerald-50/20' : 'border-slate-200'
            }`}
          />
          {selectedLocation && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xl pointer-events-none">
              {selectedLocation.flag}
            </span>
          )}
        </div>

        {/* Dropdown suggestions */}
        {showDropdown && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-900/10 overflow-hidden divide-y divide-slate-100">
            {suggestions.map((loc, i) => (
              <button
                data-testid={`country-language-step-button-${i}`}
                key={i}
                type="button"
                onMouseDown={() => handleSelectLocation(loc)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50/70 transition-colors text-left group"
              >
                <span className="text-2xl leading-none">{loc.flag}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 leading-tight group-hover:text-violet-700 transition-colors">{loc.city}</p>
                  <p className="text-xs text-slate-500 truncate">{loc.state ? `${loc.state}, ` : ''}{loc.country}</p>
                </div>
                <ChevronRight size={14} className="ml-auto text-slate-400 group-hover:text-violet-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {errors.location && (
          <p className="mt-1 text-xs text-red-600 pl-1">{errors.location}</p>
        )}

        {/* Selected location chip */}
        {selectedLocation && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200/80 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
              <span>{selectedLocation.flag}</span>
              <span>{selectedLocation.city}</span>
              <span className="text-violet-300">•</span>
              <span>{selectedLocation.state || selectedLocation.country}</span>
              {selectedLocation.state && selectedLocation.country && (
                <>
                  <span className="text-violet-300">•</span>
                  <span>{selectedLocation.country}</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Language */}
      <div>
        <label htmlFor="language" className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-2">
          <Languages size={15} className="text-violet-600" />
          Preferred Language
        </label>
        <select
          data-testid="country-language-step-select"
          id="language"
          value={data.language || 'English'}
          onChange={e => { onUpdate({ language: e.target.value }); setErrors(prev => ({ ...prev, language: '' })); }}
          className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm text-slate-900 ${
            errors.language ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
          }`}
        >
          {LANGUAGES.map(lang => (
            <option data-testid={`country-language-step-option-${lang.value}`} key={lang.value} value={lang.value}>
              {lang.flag} {lang.label}
            </option>
          ))}
        </select>
        {errors.language && <p className="mt-1 text-xs text-red-600 pl-1">{errors.language}</p>}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="flex gap-3">
          <button
            data-testid="country-language-step-back"
            type="button"
            onClick={onBack}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl transition-all font-bold text-sm"
          >
            Back
          </button>
          <button
            data-testid="country-language-step-continue-to-bank"
            type="submit"
            className="flex-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white py-3 px-4 rounded-xl transition-all font-bold text-sm shadow-md shadow-violet-500/20 active:scale-[0.99]"
          >
            Continue to Bank
          </button>
        </div>
        {onSkip && (
          <button
            data-testid="country-language-step-skip-for-now-i"
            type="button"
            onClick={onSkip}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1.5 font-medium"
          >
            <SkipForward size={14} />
            Skip for now - I'll set this up later
          </button>
        )}
      </div>
    </form>
  );
};


