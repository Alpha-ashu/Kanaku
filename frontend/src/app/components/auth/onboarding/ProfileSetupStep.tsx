import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { AVATAR_OPTIONS, getAvatarById, resolveAvatarSelection } from '@/lib/avatar-gallery';

interface ProfileSetupStepProps {
 data: {
 displayName: string;
 dateOfBirth: string;
 gender: string;
 jobType: string;
 salary: string;
 avatarUrl?: string;
 avatarId?: string;
 };
 onUpdate: (data: any) => void;
 onNext: () => void;
}

const JOB_TYPES = [
 'Full-time Employment',
 'Part-time Employment',
 'Self-employed',
 'Freelance',
 'Business Owner',
 'Student',
 'Retired',
 'Unemployed',
 'Other',
];

export const ProfileSetupStep: React.FC<ProfileSetupStepProps> = ({
 data,
 onUpdate,
 onNext,
}) => {
 const [errors, setErrors] = useState<Record<string, string>>({});
 const resolvedAvatar = useMemo(
 () => resolveAvatarSelection({ avatarId: data.avatarId, avatarUrl: data.avatarUrl }),
 [data.avatarId, data.avatarUrl],
 );
 const [pendingAvatarId, setPendingAvatarId] = useState(resolvedAvatar.id);

 React.useEffect(() => {
 if (!data.avatarUrl && !data.avatarId) {
 onUpdate({ avatarId: resolvedAvatar.id, avatarUrl: resolvedAvatar.url });
 }
 }, [data.avatarId, data.avatarUrl, onUpdate, resolvedAvatar.id, resolvedAvatar.url]);

 React.useEffect(() => {
 setPendingAvatarId(resolvedAvatar.id);
 }, [resolvedAvatar.id]);

 const pendingAvatar = getAvatarById(pendingAvatarId) || resolvedAvatar;

 const validateForm = () => {
 const newErrors: Record<string, string> = {};

 if (!data.dateOfBirth) {
 newErrors.dateOfBirth = 'Date of birth is required';
 } else {
 const dob = new Date(data.dateOfBirth);
 const today = new Date();
 const ageValue = today.getFullYear() - dob.getFullYear();
 if (ageValue < 13 || ageValue > 120) {
 newErrors.dateOfBirth = 'You must be between 13 and 120 years old';
 }
 }

 if (!data.jobType) {
 newErrors.jobType = 'Job type is required';
 }

 if (!data.salary) {
 newErrors.salary = 'Salary is required';
 } else if (isNaN(Number(data.salary)) || Number(data.salary) < 0) {
 newErrors.salary = 'Please enter a valid salary amount';
 }

 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (validateForm()) {
 if (pendingAvatarId && pendingAvatarId !== data.avatarId) {
 const selected = getAvatarById(pendingAvatarId);
 if (selected) {
 onUpdate({ avatarId: selected.id, avatarUrl: selected.url });
 }
 }
 onNext();
 }
 };

 return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-4 md:mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">
          Profile Information
        </h3>
        <p className="text-sm text-gray-500">
          Let's set up your profile with basic information about you.
        </p>
      </div>

      {/* Responsive Grid layout for desktop support */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
        {/* Left Column: Avatar Selection Area */}
        <div className="md:col-span-6 space-y-4">
          <div className="flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-blue-500 overflow-hidden bg-white flex items-center justify-center shadow-md">
                <img src={pendingAvatar.url} alt="Selected avatar" className="w-full h-full object-cover" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center max-w-xs">
              Choose a ready-made avatar. You can change this anytime.
            </p>
          </div>

          <div className="w-full">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">Choose Your Avatar</h4>
              <button
                type="button"
                onClick={() => onUpdate({ avatarId: pendingAvatar.id, avatarUrl: pendingAvatar.url })}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <Check size={14} />
                Save Avatar
              </button>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-6 lg:grid-cols-7 gap-2 max-h-[300px] overflow-y-auto p-2 border border-gray-100 rounded-xl bg-gray-50/30 scrollbar-thin scrollbar-thumb-gray-200">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setPendingAvatarId(avatar.id)}
                  className={`h-11 w-11 rounded-full overflow-hidden border-2 transition-all mx-auto ${
                    pendingAvatarId === avatar.id
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                  aria-label={`Select avatar ${avatar.label}`}
                  title={avatar.label}
                >
                  <img src={avatar.url} alt={avatar.label} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Profile Info Fields */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <span className="text-sm text-gray-500 block mb-1">Signed in as</span>
            <span className="font-semibold text-gray-800">{data.displayName || 'User'}</span>
          </div>

          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              id="gender"
              value={data.gender || ''}
              onChange={(e) => onUpdate({ gender: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.gender ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
            {errors.gender && (
              <p className="mt-1 text-sm text-red-600">{errors.gender}</p>
            )}
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              id="dateOfBirth"
              value={data.dateOfBirth}
              onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.dateOfBirth && (
              <p className="mt-1 text-sm text-red-600">{errors.dateOfBirth}</p>
            )}
          </div>

          <div>
            <label htmlFor="jobType" className="block text-sm font-medium text-gray-700 mb-1">
              Job Type
            </label>
            <select
              id="jobType"
              value={data.jobType}
              onChange={(e) => onUpdate({ jobType: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.jobType ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select job type</option>
              {JOB_TYPES.map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
            {errors.jobType && (
              <p className="mt-1 text-sm text-red-600">{errors.jobType}</p>
            )}
          </div>

          <div>
            <label htmlFor="salary" className="block text-sm font-medium text-gray-700 mb-1">
              Annual Salary (INR)
            </label>
            <input
              type="number"
              id="salary"
              value={data.salary}
              onChange={(e) => onUpdate({ salary: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.salary ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="50000"
            />
            {errors.salary && (
              <p className="mt-1 text-sm text-red-600">{errors.salary}</p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              Continue to Bank Account Setup
            </button>
          </div>
        </div>
      </div>
    </form>
 );
};
