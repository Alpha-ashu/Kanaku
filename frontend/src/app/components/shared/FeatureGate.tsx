import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureAccess } from '@/hooks/useRBAC';
import { Lock, AlertCircle } from 'lucide-react';

interface FeatureGateProps {
 feature: string;
 children: React.ReactNode;
 fallback?: React.ReactNode;
 showError?: boolean;
}

/**
 * FeatureGate - Wraps components to check permission before rendering
 * Shows access denied message if user doesn't have permission for the feature
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({
 feature,
 children,
 fallback,
 showError = true,
}) => {
 const { user, role } = useAuth();
 const hasAccess = useFeatureAccess(feature);

 if (!hasAccess) {
 if (fallback) {
 return <>{fallback}</>;
 }

 if (!showError) {
 return null;
 }

 return (
 <div className="h-full flex items-center justify-center bg-bg-body">
 <div className="text-center max-w-md mx-auto px-6">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
 <Lock className="w-8 h-8 text-red-600" />
 </div>

 <h2 className="text-2xl font-bold text-text-primary mb-2">
 Access Denied
 </h2>

 <p className="text-text-secondary mb-4">
 This feature is not available for your role.
 </p>

 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
 <div className="flex gap-2">
 <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
 <div className="text-sm text-yellow-700">
 <p className="font-semibold mb-1">Your Role: <span className="capitalize">{role}</span></p>
 <p>This feature requires a different role to access.</p>
 </div>
 </div>
 </div>

 <div className="space-y-2 text-left bg-white rounded-lg p-4">
 <p className="text-sm font-semibold text-text-primary">Available to:</p>
 <ul className="text-sm text-text-secondary space-y-1">
 {feature === 'bookAdvisor' && (
 <>
 <li> Admin - Can book advisors</li>
 <li> Advisor - Cannot book self</li>
 <li> User - Can book advisors</li>
 </>
 )}
 {feature === 'adminPanel' && (
 <>
 <li> Admin - Full access</li>
 <li> Advisor - No access</li>
 <li> User - No access</li>
 </>
 )}
 {feature === 'advisorPanel' && (
 <>
 <li> Admin - No access</li>
 <li> Advisor - Full access</li>
 <li> User - No access</li>
 </>
 )}
 {!['bookAdvisor', 'adminPanel', 'advisorPanel'].includes(feature) && (
 <li className="text-xs italic">
 Contact an administrator for access to this feature.
 </li>
 )}
 </ul>
 </div>

 {user && (
 <p className="text-xs text-text-secondary mt-6">
 Email: {user.email}
 </p>
 )}
 </div>
 </div>
 );
 }

 return <>{children}</>;
};

export default FeatureGate;
