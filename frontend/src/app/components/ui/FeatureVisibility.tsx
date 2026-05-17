import React from 'react';
import { useFeatureAccess, usePermissions } from '@/hooks/usePermissions';

interface FeatureVisibilityProps {
 feature: string;
 children: React.ReactNode;
 fallback?: React.ReactNode;
 role?: 'admin' | 'advisor' | 'user' | string[];
 logAccess?: boolean;
}

/**
 * FeatureVisibility - Completely hides features if user doesn't have permission
 * No access denied screens - features simply don't render
 */
export const FeatureVisibility: React.FC<FeatureVisibilityProps> = ({
 feature,
 children,
 fallback = null,
 role,
 logAccess = false
}) => {
 const hasAccess = useFeatureAccess(feature);

 // If role is specified, do additional role check
 if (role) {
 const { role: userRole } = usePermissions();
 
 if (Array.isArray(role)) {
 if (!userRole || !role.includes(userRole)) {
 if (logAccess) {
 console.log(` Feature"${feature}" hidden - user role"${userRole}" not in allowed roles:`, role);
 }
 return <>{fallback}</>;
 }
 } else if (userRole !== role) {
 if (logAccess) {
 console.log(` Feature"${feature}" hidden - user role"${userRole}" != required role"${role}"`);
 }
 return <>{fallback}</>;
 }
 }

 // Log access attempts for debugging
 if (logAccess) {
 if (hasAccess) {
 console.log(` Feature"${feature}" accessible to current user`);
 } else {
 console.log(` Feature"${feature}" hidden - no permission`);
 }
 }

 // Return children if has access, otherwise return fallback (or null)
 return hasAccess ? <>{children}</> : <>{fallback}</>;
};

/**
 * AdminOnly - Component that only renders for admin users
 */
export const AdminOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
 children,
 fallback = null
}) => {
 return (
 <FeatureVisibility feature="adminPanel" role="admin" fallback={fallback}>
 {children}
 </FeatureVisibility>
 );
};

/**
 * AdvisorOnly - Component that only renders for advisor users
 */
export const AdvisorOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
 children,
 fallback = null
}) => {
 return (
 <FeatureVisibility feature="advisorPanel" role={['admin', 'advisor']} fallback={fallback}>
 {children}
 </FeatureVisibility>
 );
};

/**
 * UserOnly - Component that only renders for regular users
 */
export const UserOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
 children,
 fallback = null
}) => {
 return (
 <FeatureVisibility feature="userAccess" role={['admin', 'advisor', 'user']} fallback={fallback}>
 {children}
 </FeatureVisibility>
 );
};

/**
 * RoleBased - Component that renders based on specific roles
 */
export const RoleBased: React.FC<{
 children: React.ReactNode;
 roles: {
 admin?: React.ReactNode;
 advisor?: React.ReactNode;
 user?: React.ReactNode;
 };
}> = ({ children, roles }) => {
 const { role } = usePermissions();
 
 switch (role) {
 case 'admin':
 return <>{roles.admin || roles.user || null}</>;
 case 'advisor':
 return <>{roles.advisor || roles.user || null}</>;
 case 'user':
 return <>{roles.user || null}</>;
 default:
 return <>{roles.user || null}</>;
 }
};
