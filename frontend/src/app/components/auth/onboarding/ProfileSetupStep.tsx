import React, { useState, useMemo } from 'react';
import { Check, Calendar, ShieldCheck, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { AVATAR_OPTIONS, getAvatarById, resolveAvatarSelection } from '@/lib/avatar-gallery';
import { ProfileVerificationModal } from '@/app/components/auth/ProfileVerificationModal';
import { useProfileVerification, setLocalProfileVerification } from '@/hooks/useProfileVerification';

interface ProfileSetupStepProps {
  data: {
    displayName: string;
    dateOfBirth: string;
    gender: string;
    mobile: string;
    jobType: string;
    salary: string;
    avatarUrl?: string;
    avatarId?: string;
  };
  onUpdate: (data: Record<string, unknown>) => void;
  onNext: () => void;
  onDiscard?: () => void;
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

const SALARY_OPTIONAL_TYPES = ['Student', 'Retired', 'Unemployed', 'Other'];

export const ProfileSetupStep: React.FC<ProfileSetupStepProps> = ({
  data,
  onUpdate,
  onNext,
  onDiscard,
}) => {
  const { isVerified, userEmail } = useProfileVerification();
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLaterChosen, setVerifyLaterChosen] = useState(!isVerified);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSalaryOptional = SALARY_OPTIONAL_TYPES.includes(data.jobType);
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

    if (!SALARY_OPTIONAL_TYPES.includes(data.jobType)) {
      if (!data.salary) {
        newErrors.salary = 'Salary is required';
      } else if (isNaN(Number(data.salary)) || Number(data.salary) < 0) {
        newErrors.salary = 'Please enter a valid salary amount';
      }
    } else if (data.salary && (isNaN(Number(data.salary)) || Number(data.salary) < 0)) {
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
      if (!isVerified && !verifyLaterChosen) {
        setLocalProfileVerification(false);
      }
      onNext();
    }
  };

  return (
    <form data-testid="profile-setup-step-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Profile Information
        </h3>
      </div>

      {/* Profile Verification Section placed on top above grid */}
      <div className={`p-4 rounded-2xl border transition-all ${
        isVerified
          ? 'bg-emerald-50/70 border-emerald-200/80'
          : verifyLaterChosen
          ? 'bg-amber-50/70 border-amber-200/80'
          : 'bg-slate-50 border-slate-200/80'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isVerified ? 'bg-emerald-100 text-emerald-600' : 'bg-violet-100 text-violet-600'
            }`}>
              {isVerified ? <CheckCircle size={16} /> : <ShieldCheck size={16} />}
            </div>
            <span className="text-xs font-bold text-slate-900">
              Profile Verification
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mb-3">
          {isVerified
            ? 'Your profile is verified. You can add transactions, link accounts, and edit records.'
            : verifyLaterChosen
            ? 'View-Only Mode selected: You can explore your dashboard, but adding or editing records is locked until verification.'
            : 'Verify your profile now to unlock adding transactions and full ledger features, or choose verify later to preview in View-Only mode.'}
        </p>

        {!isVerified && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowVerifyModal(true)}
              data-testid="profile-setup-verify-now-btn"
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <ShieldCheck size={14} />
              <span>Verify Now</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVerifyLaterChosen(true);
                setLocalProfileVerification(false);
              }}
              data-testid="profile-setup-verify-later-btn"
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                verifyLaterChosen
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Clock size={14} />
              <span>Verify Later</span>
            </button>
          </div>
        )}
      </div>

      {/* Responsive Grid layout for desktop support */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
        {/* Left Column: Avatar Selection Area */}
        <div className="md:col-span-6 space-y-4">
          <div className="flex flex-col items-center justify-center bg-slate-50/70 rounded-2xl p-4 border border-slate-200/70">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-violet-600 overflow-hidden bg-white flex items-center justify-center shadow-lg shadow-violet-500/20">
                <img src={pendingAvatar.url} alt="Selected avatar" className="w-full h-full object-cover" />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center max-w-xs font-medium">
              Choose a ready-made avatar. You can change this anytime.
            </p>
          </div>

          <div className="w-full">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Choose Your Avatar</h4>
              <button
                data-testid="profile-setup-step-save-avatar"
                type="button"
                onClick={() => onUpdate({ avatarId: pendingAvatar.id, avatarUrl: pendingAvatar.url })}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50/60 px-3 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100/70 transition-colors cursor-pointer"
              >
                <Check size={13} />
                Save Avatar
              </button>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-6 lg:grid-cols-7 gap-2 max-h-[260px] overflow-y-auto p-2 border border-slate-200/80 rounded-2xl bg-slate-50/40 scrollbar-thin scrollbar-thumb-slate-200">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  data-testid={`profile-setup-step-select-avatar-${avatar.id}`}
                  key={avatar.id}
                  type="button"
                  onClick={() => setPendingAvatarId(avatar.id)}
                  className={`h-11 w-11 rounded-full overflow-hidden border-2 transition-all mx-auto cursor-pointer ${
                    pendingAvatarId === avatar.id
                      ? 'border-violet-600 ring-4 ring-violet-100 scale-105'
                      : 'border-transparent hover:border-slate-300'
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
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
            <span className="text-xs font-medium text-slate-400 block mb-0.5">Signed in as</span>
            <span className="font-bold text-slate-800 text-sm">{data.displayName || 'User'}</span>
          </div>

          <div>
            <label htmlFor="gender" className="block text-xs font-bold text-slate-700 mb-1.5">
              Gender
            </label>
            <select
              data-testid="profile-setup-step-select"
              id="gender"
              value={data.gender || ''}
              onChange={(e) => onUpdate({ gender: e.target.value })}
              className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm ${
                errors.gender ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            >
              <option data-testid="profile-setup-step-select-gender" value="">Select gender</option>
              <option data-testid="profile-setup-step-male" value="male">Male</option>
              <option data-testid="profile-setup-step-female" value="female">Female</option>
              <option data-testid="profile-setup-step-non-binary" value="non-binary">Non-binary</option>
              <option data-testid="profile-setup-step-prefer-not-to-say" value="prefer-not-to-say">Prefer not to say</option>
            </select>
            {errors.gender && (
              <p className="mt-1 text-xs text-red-600 pl-1">{errors.gender}</p>
            )}
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="block text-xs font-bold text-slate-700 mb-1.5">
              Date of Birth
            </label>
            <div
              data-testid="profile-setup-step-div"
              className="relative group w-full"
              onClick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input && 'showPicker' in input) (input as HTMLInputElement).showPicker();
              }}
            >
              <div className={`w-full px-3.5 py-2.5 border rounded-xl focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 text-sm text-left flex items-center justify-between bg-white min-h-[42px] cursor-pointer ${
                errors.dateOfBirth ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}>
                <span className={data.dateOfBirth ? "text-slate-900 font-medium" : "text-slate-400"}>
                  {(() => {
                    if (!data.dateOfBirth) return 'Select Date of Birth';
                    try {
                      const date = new Date(data.dateOfBirth);
                      if (isNaN(date.getTime())) return data.dateOfBirth;
                      const day = String(date.getDate()).padStart(2, '0');
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
                    } catch {
                      return data.dateOfBirth;
                    }
                  })()}
                </span>
                <Calendar size={15} className="text-slate-400" />
              </div>
              <input
                data-testid="profile-setup-step-input"
                type="date"
                id="dateOfBirth"
                value={data.dateOfBirth}
                onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer z-20"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            {errors.dateOfBirth && (
              <p className="mt-1 text-xs text-red-600 pl-1">{errors.dateOfBirth}</p>
            )}
          </div>

          <div>
            <label htmlFor="jobType" className="block text-xs font-bold text-slate-700 mb-1.5">
              Job Type / Occupation
            </label>
            <select
              data-testid="profile-setup-step-select-2"
              id="jobType"
              value={data.jobType}
              onChange={(e) => onUpdate({ jobType: e.target.value })}
              className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm ${
                errors.jobType ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            >
              <option data-testid="profile-setup-step-select-job-type" value="">Select job type</option>
              {JOB_TYPES.map((job) => (
                <option data-testid={`profile-setup-step-option-${job}`} key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
            {errors.jobType && (
              <p className="mt-1 text-xs text-red-600 pl-1">{errors.jobType}</p>
            )}
          </div>

          <div>
            <label htmlFor="salary" className="block text-xs font-bold text-slate-700 mb-1.5">
              Annual Salary (INR)
              {isSalaryOptional && (
                <span className="ml-1 text-xs font-normal text-slate-400">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                ₹
              </span>
              <input
                data-testid="profile-setup-step-is-salary-optional-not"
                type="number"
                id="salary"
                value={data.salary}
                onChange={(e) => onUpdate({ salary: e.target.value })}
                className={`w-full pl-8 pr-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm ${
                  errors.salary ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
                placeholder={isSalaryOptional ? 'Not applicable' : 'e.g. 850000'}
              />
            </div>
            {errors.salary && (
              <p className="mt-1 text-xs text-red-600 pl-1">{errors.salary}</p>
            )}
          </div>

          <div className="pt-2 space-y-2">
            <button
              data-testid="profile-setup-step-continue-to-bank-account"
              type="submit"
              className="w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-md shadow-violet-500/20 transition-all text-sm cursor-pointer active:scale-[0.99]"
            >
              {isVerified
                ? 'Continue to Location & Language'
                : verifyLaterChosen
                ? 'Continue in View-Only Mode'
                : 'Continue to Location & Language'}
            </button>

            {onDiscard && (
              <button
                type="button"
                data-testid="discard-profile-setup-button"
                onClick={onDiscard}
                className="w-full py-2.5 px-4 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-2xl transition-all border border-rose-200/80 hover:border-rose-300 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
              >
                <Trash2 size={14} />
                <span>Discard Profile Setup & Cancel Registration</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <ProfileVerificationModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        email={userEmail}
        onVerified={() => {
          setShowVerifyModal(false);
          setVerifyLaterChosen(false);
        }}
      />
    </form>
  );
};
