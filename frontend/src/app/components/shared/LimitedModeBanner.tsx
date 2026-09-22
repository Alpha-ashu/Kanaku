import React, { useState } from 'react';
import { AlertTriangle, X, Mail, Shield } from 'lucide-react';
import { useProfileVerification } from '@/hooks/useProfileVerification';

interface LimitedModeBannerProps {
  onVerify?: () => void;
}

export const LimitedModeBanner: React.FC<LimitedModeBannerProps> = ({ onVerify }) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { isViewOnly, isExpired, openVerificationModal } = useProfileVerification();

  // Check if user is in view-only or limited mode
  const userStatus = localStorage.getItem('user_status');
  const emailVerified = localStorage.getItem('email_verified');

  const showBanner = isViewOnly || isExpired || (userStatus === 'limited_access' && emailVerified !== 'true');

  if (isDismissed || !showBanner) {
    return null;
  }

  const handleVerify = () => {
    setIsVerifying(true);
    if (onVerify) {
      onVerify();
    } else {
      openVerificationModal();
    }
    setIsVerifying(false);
  };

  return (
    <div className="px-3 sm:px-6 pt-2 pb-2 w-full">
      <div className="rounded-2xl border border-amber-200/90 bg-amber-50/95 backdrop-blur-md px-3.5 sm:px-5 py-3 sm:py-3.5 text-amber-950 shadow-xs transition-all max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
                <span className="font-bold text-amber-950">
                  {isExpired ? 'Re-Verification Required:' : 'View-Only Mode:'}
                </span>{' '}
                {isExpired
                  ? 'Your 90-day verification period has expired. Please verify your account again to add or edit records.'
                  : 'Profile verification is pending. You can browse your financial dashboard, but adding or editing records requires verification.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              data-testid="limited-mode-banner-verify-now"
              onClick={handleVerify}
              disabled={isVerifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-xs active:scale-98"
            >
              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {isExpired ? 'Re-Verify Now' : 'Verify Now'}
            </button>
            <button
              data-testid="limited-mode-banner-dismiss-banner"
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg transition-colors cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Full-page limited mode info for Settings
export const LimitedModeInfo: React.FC = () => {
  const { isExpired, openVerificationModal } = useProfileVerification();
  const features = [
    { name: 'Access App UI', allowed: true },
    { name: 'View Dashboard & Transactions', allowed: true },
    { name: 'Add Transactions', allowed: false },
    { name: 'Add / Edit Accounts', allowed: false },
    { name: 'Cloud Sync & Backup', allowed: false },
    { name: 'Multi-device Access', allowed: false },
    { name: 'Integrations & Budgets', allowed: false },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Shield className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {isExpired ? 'Re-Verification Required' : 'View-Only / Limited Mode'}
          </h3>
          <p className="text-sm text-gray-500">
            {isExpired ? 'Your 90-day verification period has expired' : 'Your account is pending profile verification'}
          </p>
        </div>
      </div>

      <div className="mb-4 p-4 bg-amber-50 rounded-lg">
        <p className="text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          {isExpired
            ? 'Please re-verify your profile to continue adding transactions, linking bank accounts, and saving changes.'
            : 'Verify your profile to unlock adding transactions, linking bank accounts, and saving changes.'}
        </p>
      </div>

      <div className="space-y-2 mb-6">
        {features.map((feature, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-700">{feature.name}</span>
            <span className={`text-sm font-medium ${feature.allowed ? 'text-green-600' : 'text-red-500'}`}>
              {feature.allowed ? ' Available' : ' Locked'}
            </span>
          </div>
        ))}
      </div>

      <button
        data-testid="limited-mode-banner-verify-email-now"
        onClick={() => openVerificationModal()}
        className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
      >
        {isExpired ? 'Re-Verify Profile Now' : 'Verify Profile Now'}
      </button>
    </div>
  );
};
