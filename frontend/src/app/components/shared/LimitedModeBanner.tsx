import React, { useState } from 'react';
import { AlertTriangle, X, Mail, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useProfileVerification } from '@/hooks/useProfileVerification';

interface LimitedModeBannerProps {
  onVerify?: () => void;
}

export const LimitedModeBanner: React.FC<LimitedModeBannerProps> = ({ onVerify }) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { isViewOnly, openVerificationModal } = useProfileVerification();

  // Check if user is in view-only or limited mode
  const userStatus = localStorage.getItem('user_status');
  const emailVerified = localStorage.getItem('email_verified');

  const showBanner = isViewOnly || (userStatus === 'limited_access' && emailVerified !== 'true');

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
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-amber-800">
              <span className="font-bold">View-Only Mode:</span>{' '}
              Profile verification is pending. You can browse your financial dashboard, but adding or editing records requires verification.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="limited-mode-banner-verify-now"
            onClick={handleVerify}
            disabled={isVerifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Mail className="w-4 h-4" />
            Verify Now
          </button>
          <button data-testid="limited-mode-banner-dismiss-banner"
            onClick={() => setIsDismissed(true)}
            className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Full-page limited mode info for Settings
export const LimitedModeInfo: React.FC = () => {
  const { openVerificationModal } = useProfileVerification();
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
          <h3 className="text-lg font-semibold text-gray-900">View-Only / Limited Mode</h3>
          <p className="text-sm text-gray-500">Your account is pending profile verification</p>
        </div>
      </div>

      <div className="mb-4 p-4 bg-amber-50 rounded-lg">
        <p className="text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          Verify your profile to unlock adding transactions, linking bank accounts, and saving changes.
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

      <button data-testid="limited-mode-banner-verify-email-now"
        onClick={() => openVerificationModal()}
        className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
      >
        Verify Profile Now
      </button>
    </div>
  );
};
