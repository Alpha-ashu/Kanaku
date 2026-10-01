import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Crown, Lock, RotateCcw, User, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/featureFlags';
import {
  ROLES,
  SECTION_TITLES,
  appliesToRole,
  defaultRoleAccess,
  isRoleLocked,
  type FeatureSection,
  type RoleAccess,
} from './featureCatalog';

/**
 * The Feature Panel seen one role at a time: every page that role can be
 * given, with a single switch each, and a one-click restore of that role's
 * defaults. The by-module grid answers "who sees Goals?"; this answers "what
 * does a manager see?" — which is what an admin needs when a role's pages have
 * gone missing.
 */

export interface RoleViewFeature {
  key: string;
  name: string;
  description: string;
  section: FeatureSection;
  enabled: boolean;
  roleAccess: RoleAccess;
}

interface FeatureRoleViewProps {
  features: RoleViewFeature[];
  onToggle: (key: string, role: UserRole, granted: boolean) => void;
  onRestoreDefaults: (role: UserRole) => void;
}

const ROLE_META: Record<UserRole, { label: string; icon: React.ElementType; blurb: string }> = {
  admin: { label: 'Admin', icon: Crown, blurb: 'Platform owners. Admin workspaces are always on.' },
  manager: { label: 'Manager', icon: UserCog, blurb: 'Staff who verify advisors and look after assigned users.' },
  advisor: { label: 'Advisor', icon: Briefcase, blurb: 'Verified financial advisors.' },
  user: { label: 'User', icon: User, blurb: 'Everyone else.' },
};

const Switch: React.FC<{ on: boolean; disabled?: boolean; label: string; testId: string; onClick?: () => void }> = ({ on, disabled, label, testId, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    data-testid={testId}
    className={cn(
      'w-11 h-6 rounded-full relative transition-all duration-200 shrink-0',
      on ? 'bg-indigo-600' : 'bg-slate-200',
      disabled && 'opacity-50 cursor-not-allowed',
    )}
  >
    <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200', on ? 'right-1' : 'left-1')} />
  </button>
);

export const FeatureRoleView: React.FC<FeatureRoleViewProps> = ({ features, onToggle, onRestoreDefaults }) => {
  const [role, setRole] = useState<UserRole>('admin');
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => features.filter((f) => appliesToRole(f.key, role)), [features, role]);
  const onCount = rows.filter((f) => f.enabled && (isRoleLocked(f.key, role) || f.roleAccess[role])).length;
  const differsFromDefault = rows.filter((f) => !isRoleLocked(f.key, role) && f.roleAccess[role] !== defaultRoleAccess(f.key)[role]);

  return (
    <div className="space-y-6" data-testid="feature-role-view">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Role">
        {ROLES.map((r) => {
          const Icon = ROLE_META[r].icon;
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              onClick={() => { setRole(r); setConfirming(false); }}
              data-testid={`feature-role-tab-${r}`}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-colors',
                role === r ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon size={15} /> {ROLE_META[r].label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm">
        <div className="min-w-0">
          <p className="text-lg font-black text-slate-900">{ROLE_META[role].label} pages</p>
          <p className="text-sm text-slate-500">
            {ROLE_META[role].blurb} {onCount} of {rows.length} on
            {differsFromDefault.length > 0 && <> · <span className="font-semibold text-amber-700">{differsFromDefault.length} changed from default</span></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={differsFromDefault.length === 0}
          data-testid={`feature-role-restore-${role}`}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw size={14} /> Restore {ROLE_META[role].label.toLowerCase()} defaults
        </button>
      </div>

      {(['workspace', 'app'] as const).map((section) => {
        const sectionRows = rows.filter((f) => f.section === section);
        if (sectionRows.length === 0) return null;
        return (
          <section key={section} className="space-y-2" aria-label={SECTION_TITLES[section]}>
            <p className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">{SECTION_TITLES[section]}</p>
            <ul className="rounded-[24px] bg-white border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {sectionRows.map((f) => {
                const locked = isRoleLocked(f.key, role);
                const on = f.enabled && (locked || f.roleAccess[role] === true);
                return (
                  <li key={f.key} className="flex items-center gap-3 px-4 sm:px-5 py-3.5" data-testid={`feature-role-row-${f.key}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        {f.name}
                        {locked && <Lock size={12} className="text-slate-400" aria-label="Always on" />}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {!f.enabled ? 'Switched off for everyone in the module grid.' : locked ? 'Always on for this role.' : f.description}
                      </p>
                    </div>
                    <Switch
                      on={on}
                      disabled={locked || !f.enabled}
                      label={`${on ? 'Revoke' : 'Grant'} ${ROLE_META[role].label} access to ${f.name}`}
                      testId={`feature-role-switch-${f.key}`}
                      onClick={() => onToggle(f.key, role, !f.roleAccess[role])}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {confirming && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Restore defaults" className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-slate-900">Restore {ROLE_META[role].label.toLowerCase()} defaults?</h3>
              <p className="text-sm text-slate-600 mt-1">
                {differsFromDefault.length === 1 ? 'This page goes' : `These ${differsFromDefault.length} pages go`} back to the default for every {ROLE_META[role].label.toLowerCase()}:
              </p>
            </div>
            <ul className="max-h-56 overflow-y-auto rounded-2xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
              {differsFromDefault.map((f) => (
                <li key={f.key} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{f.name}</span>
                  <span className={cn('text-xs font-bold', defaultRoleAccess(f.key)[role] ? 'text-emerald-700' : 'text-slate-500')}>
                    {defaultRoleAccess(f.key)[role] ? 'turns on' : 'turns off'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                onClick={() => { onRestoreDefaults(role); setConfirming(false); }}
                data-testid="feature-role-restore-confirm"
                className="flex-1 py-2.5 rounded-full bg-slate-900 text-sm font-bold text-white hover:bg-black"
              >
                Restore
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default FeatureRoleView;
