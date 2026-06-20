import React, { useState, useRef, useEffect } from 'react';
import { Globe, Languages, MapPin, ChevronRight, SkipForward } from 'lucide-react';

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
 { city: 'Chennai', state: 'Tamil Nadu', country: 'India', flag: '' },
 { city: 'Mumbai', state: 'Maharashtra', country: 'India', flag: '' },
 { city: 'Delhi', state: 'Delhi', country: 'India', flag: '' },
 { city: 'Bengaluru', state: 'Karnataka', country: 'India', flag: '' },
 { city: 'Hyderabad', state: 'Telangana', country: 'India', flag: '' },
 { city: 'Ahmedabad', state: 'Gujarat', country: 'India', flag: '' },
 { city: 'Kolkata', state: 'West Bengal', country: 'India', flag: '' },
 { city: 'Pune', state: 'Maharashtra', country: 'India', flag: '' },
 { city: 'Jaipur', state: 'Rajasthan', country: 'India', flag: '' },
 { city: 'Surat', state: 'Gujarat', country: 'India', flag: '' },
 { city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', flag: '' },
 { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', flag: '' },
 { city: 'Madurai', state: 'Tamil Nadu', country: 'India', flag: '' },
 { city: 'Kochi', state: 'Kerala', country: 'India', flag: '' },
 { city: 'Chandigarh', state: 'Chandigarh', country: 'India', flag: '' },
 { city: 'Nagpur', state: 'Maharashtra', country: 'India', flag: '' },
 { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India', flag: '' },
 { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India', flag: '' },
 // US
 { city: 'New York', state: 'New York', country: 'United States', flag: '' },
 { city: 'Los Angeles', state: 'California', country: 'United States', flag: '' },
 { city: 'Chicago', state: 'Illinois', country: 'United States', flag: '' },
 { city: 'San Francisco', state: 'California', country: 'United States', flag: '' },
 { city: 'Houston', state: 'Texas', country: 'United States', flag: '' },
 // UK
 { city: 'London', state: 'England', country: 'United Kingdom', flag: '' },
 { city: 'Manchester', state: 'England', country: 'United Kingdom', flag: '' },
 { city: 'Birmingham', state: 'England', country: 'United Kingdom', flag: '' },
 // Canada
 { city: 'Toronto', state: 'Ontario', country: 'Canada', flag: '' },
 { city: 'Vancouver', state: 'British Columbia', country: 'Canada', flag: '' },
 // Australia
 { city: 'Sydney', state: 'New South Wales', country: 'Australia', flag: '' },
 { city: 'Melbourne', state: 'Victoria', country: 'Australia', flag: '' },
 // UAE
 { city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', flag: '' },
 { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'United Arab Emirates', flag: '' },
 // Singapore
 { city: 'Singapore', state: 'Singapore', country: 'Singapore', flag: '' },
];

const LANGUAGES = [
 { value: 'English', label: 'English', flag: '' },
 { value: 'Hindi', label: ' (Hindi)', flag: '' },
 { value: 'Tamil', label: ' (Tamil)', flag: '' },
 { value: 'Telugu', label: ' (Telugu)', flag: '' },
 { value: 'Kannada', label: ' (Kannada)', flag: '' },
 { value: 'Malayalam', label: ' (Malayalam)', flag: '' },
 { value: 'Bengali', label: ' (Bengali)', flag: '' },
 { value: 'Marathi', label: ' (Marathi)', flag: '' },
 { value: 'Gujarati', label: ' (Gujarati)', flag: '' },
 { value: 'Spanish', label: 'Espaol (Spanish)', flag: '' },
 { value: 'French', label: 'Franais (French)', flag: '' },
 { value: 'Arabic', label: ' (Arabic)', flag: '' },
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
      onUpdate({ city, state, country });
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
 <div className="text-center mb-2">
 <h3 className="text-xl font-bold text-gray-900 mb-1">Region &amp; Language</h3>
 <p className="text-sm text-gray-500">
 Help us customize your experience by setting your location and language.
 </p>
 </div>

 {/* Location input */}
 <div ref={dropdownRef} className="relative">
 <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
 <MapPin size={15} className="text-blue-500" />
 Your Location
 </label>
 <div className="relative">
 <input data-testid="country-language-step-e-g-chennai-tamil"
 ref={inputRef}
 type="text"
 value={locationInput}
 onChange={e => handleLocationInput(e.target.value)}
 onFocus={() => locationInput.length >= 2 && setShowDropdown(suggestions.length > 0)}
 placeholder="e.g. Chennai, Tamil Nadu, India"
 autoComplete="off"
 className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
 errors.location ? 'border-red-400 bg-red-50' : selectedLocation ? 'border-green-400 bg-green-50/30' : 'border-gray-300'
 }`}
 />
 {selectedLocation && (
 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl">
 {selectedLocation.flag}
 </span>
 )}
 </div>

 {/* Dropdown suggestions */}
 {showDropdown && (
 <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
 {suggestions.map((loc, i) => (
 <button data-testid={`country-language-step-button-${i}`}
 key={i}
 type="button"
 onMouseDown={() => handleSelectLocation(loc)}
 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0"
 >
 <span className="text-2xl leading-none">{loc.flag}</span>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-gray-900 leading-tight">{loc.city}</p>
 <p className="text-xs text-gray-500 truncate">{loc.state}, {loc.country}</p>
 </div>
 <ChevronRight size={14} className="ml-auto text-gray-400 flex-shrink-0" />
 </button>
 ))}
 </div>
 )}

 {errors.location && (
 <p className="mt-1 text-sm text-red-600">{errors.location}</p>
 )}

 {/* Selected location chip */}
 {selectedLocation && (
 <div className="mt-2 flex flex-wrap gap-2">
 <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">
 {selectedLocation.flag} {selectedLocation.city}
 <span className="text-blue-400"></span>
 {selectedLocation.state}
 <span className="text-blue-400"></span>
 {selectedLocation.country}
 </span>
 </div>
 )}
 </div>

 {/* Language */}
 <div>
 <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
 <Languages size={15} className="text-blue-500" />
 Preferred Language
 </label>
 <select data-testid="country-language-step-select"
 id="language"
 value={data.language || 'English'}
 onChange={e => { onUpdate({ language: e.target.value }); setErrors(prev => ({ ...prev, language: '' })); }}
 className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
 errors.language ? 'border-red-400' : 'border-gray-300'
 }`}
 >
 {LANGUAGES.map(lang => (
 <option data-testid={`country-language-step-option-${lang.value}`} key={lang.value} value={lang.value}>
 {lang.flag} {lang.label}
 </option>
 ))}
 </select>
 {errors.language && <p className="mt-1 text-sm text-red-600">{errors.language}</p>}
 </div>

 {/* Actions */}
 <div className="space-y-3 pt-2">
 <div className="flex gap-3">
 <button data-testid="country-language-step-back"
 type="button"
 onClick={onBack}
 className="flex-1 bg-gray-100 text-gray-800 py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
 >
 Back
 </button>
 <button data-testid="country-language-step-continue-to-bank"
 type="submit"
 className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md border-b-4 border-blue-700 active:border-b-0 active:mt-1"
 >
 Continue to Bank
 </button>
 </div>
 {onSkip && (
 <button data-testid="country-language-step-skip-for-now-i"
 type="button"
 onClick={onSkip}
 className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
 >
 <SkipForward size={14} />
 Skip for now - I'll set this up later
 </button>
 )}
 </div>
 </form>
 );
};
