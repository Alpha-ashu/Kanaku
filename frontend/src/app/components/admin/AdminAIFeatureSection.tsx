import React, { useState } from 'react';
import { Brain, Shield, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  UserRole,
  AIModuleKey,
  AIModuleDef,
} from '@/lib/featureFlags';

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLED COMPONENT — no internal data fetching.
//
// Root cause of the repeated GET /admin/ai-features calls:
//   AdminFeaturePanel rendered <AdminAIFeatureSection /> with a ternary, which
//   caused React to UNMOUNT the component on tab-away and REMOUNT it on return.
//   Each mount fired a useEffect → GET /admin/ai-features.
//
// Fix: AdminFeaturePanel now fetches AI flags ONCE on its own mount using
//   GET /admin/ai-features/matrix (the new focused admin-only endpoint), stores
//   them in parent state, and passes them here as props. This component has no
//   useEffect, no internal fetch, and no network side-effects. The parent renders
//   both tab panels permanently via CSS hidden, so this component is never unmounted.
// ─────────────────────────────────────────────────────────────────────────────

const AI_MODULE_DESCRIPTIONS: Record<AIModuleKey, string> = {
  ocrEngine: 'Converts receipt images and PDF document uploads into structured transactional entries.',
  voiceAssistant: 'Hands-free command engine translating spoken voice transcripts into financial logs.',
  aiAutomation: 'Automated background algorithms executing smart category suggestions and health analysis.',
};

interface Props {
  /** Full AI module RBAC data from parent — never fetched internally */
  aiFeatures: Record<AIModuleKey, AIModuleDef>;
  /** Parent-owned save handler: persists to DB, updates localStorage, broadcasts */
  onSave: (updated: Record<AIModuleKey, AIModuleDef>) => void;
  /** Whether the parent is still loading the initial data */
  loading?: boolean;
}

export const AdminAIFeatureSection: React.FC<Props> = ({ aiFeatures, onSave, loading = false }) => {
  const [expandedModule, setExpandedModule] = useState<AIModuleKey | null>('ocrEngine');

  // ── Toggle handlers — all delegate to parent via onSave ──────────────────

  const handleToggleModuleEnabled = (key: AIModuleKey, isEnabled: boolean) => {
    const updated = {
      ...aiFeatures,
      [key]: { ...aiFeatures[key], enabled: isEnabled },
    };
    onSave(updated);
    toast.success(`AI Module "${aiFeatures[key].name}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleModuleRoleAccess = (key: AIModuleKey, role: UserRole, isGranted: boolean) => {
    const updated = {
      ...aiFeatures,
      [key]: {
        ...aiFeatures[key],
        roleAccess: { ...aiFeatures[key].roleAccess, [role]: isGranted },
      },
    };
    onSave(updated);
    toast.success(`AI Module "${aiFeatures[key].name}" access for ${role} ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

  const handleToggleCapabilityEnabled = (moduleKey: AIModuleKey, capKey: string, isEnabled: boolean) => {
    const updated = {
      ...aiFeatures,
      [moduleKey]: {
        ...aiFeatures[moduleKey],
        capabilities: {
          ...aiFeatures[moduleKey].capabilities,
          [capKey]: { ...aiFeatures[moduleKey].capabilities[capKey], enabled: isEnabled },
        },
      },
    };
    onSave(updated);
    toast.success(`AI Capability "${capKey}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleCapabilityRoleAccess = (
    moduleKey: AIModuleKey,
    capKey: string,
    role: UserRole,
    isGranted: boolean,
  ) => {
    const updated = {
      ...aiFeatures,
      [moduleKey]: {
        ...aiFeatures[moduleKey],
        capabilities: {
          ...aiFeatures[moduleKey].capabilities,
          [capKey]: {
            ...aiFeatures[moduleKey].capabilities[capKey],
            roleAccess: { ...aiFeatures[moduleKey].capabilities[capKey].roleAccess, [role]: isGranted },
          },
        },
      },
    };
    onSave(updated);
    toast.success(`AI Capability "${capKey}" access for ${role} ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/80 rounded-3xl border border-slate-100 p-8 shadow-sm animate-pulse">
            <div className="h-6 bg-slate-100 rounded-xl w-1/3 mb-4" />
            <div className="h-4 bg-slate-100 rounded-xl w-2/3 mb-6" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-12 bg-slate-100 rounded-2xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {(Object.keys(aiFeatures) as AIModuleKey[]).map((key) => {
          const mod = aiFeatures[key];
          const isExpanded = expandedModule === key;
          const capabilities = Object.values(mod.capabilities);

          return (
            <div
              key={key}
              className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300"
            >
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0 mt-0.5">
                    <Brain size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{mod.name}</h3>
                    <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed max-w-xl">
                      {AI_MODULE_DESCRIPTIONS[key]}
                    </p>
                  </div>
                </div>

                {/* Master Switch */}
                <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-5 py-3 border border-slate-100 self-start md:self-auto">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Switch</span>
                  <button
                    data-testid={`admin-aifeature-section-button-${key}`}
                    type="button"
                    onClick={() => handleToggleModuleEnabled(key, !mod.enabled)}
                    className={cn(
                      'w-12 h-6 rounded-full relative transition-all duration-200 outline-none',
                      mod.enabled ? 'bg-indigo-600' : 'bg-slate-200',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200',
                        mod.enabled ? 'right-1' : 'left-1',
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Role Visibility Matrix */}
              <div className="py-6 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Role Visibility Matrix
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(['admin', 'manager', 'advisor', 'user'] as const).map((role) => (
                    <div
                      key={role}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200',
                        mod.roleAccess[role] && mod.enabled
                          ? 'bg-slate-50/50 border-slate-200/60'
                          : 'bg-slate-50/20 border-slate-100 opacity-60',
                      )}
                    >
                      <span className="text-xs font-bold text-slate-700 capitalize">{role}</span>
                      <button
                        data-testid={`admin-aifeature-section-button-2-${role}`}
                        type="button"
                        onClick={() => handleToggleModuleRoleAccess(key, role, !mod.roleAccess[role])}
                        disabled={!mod.enabled}
                        className={cn(
                          'w-9 h-5 rounded-full relative transition-all duration-200',
                          mod.roleAccess[role] ? 'bg-indigo-600' : 'bg-slate-300',
                          !mod.enabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <div
                          className={cn(
                            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200',
                            mod.roleAccess[role] ? 'right-0.5' : 'left-0.5',
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Granular Capabilities */}
              {capabilities.length > 0 && (
                <div className="pt-4">
                  <button
                    data-testid={`admin-aifeature-section-button-3-${key}`}
                    type="button"
                    onClick={() => setExpandedModule(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between text-slate-500 hover:text-slate-900 transition-colors py-2"
                  >
                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                      <Layers size={12} />
                      Granular Capabilities ({capabilities.length})
                    </span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                      {capabilities.map((cap) => (
                        <div
                          key={cap.key}
                          className="bg-slate-50/50 border border-slate-100/80 rounded-2xl p-5 hover:border-slate-200/50 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">{cap.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {cap.key}
                              </p>
                            </div>
                            <button
                              data-testid={`admin-aifeature-section-button-4-${cap.key}`}
                              type="button"
                              onClick={() => handleToggleCapabilityEnabled(key, cap.key, !cap.enabled)}
                              disabled={!mod.enabled}
                              className={cn(
                                'w-10 h-5 rounded-full relative transition-all duration-200',
                                cap.enabled && mod.enabled ? 'bg-indigo-600' : 'bg-slate-300',
                                !mod.enabled && 'opacity-40 cursor-not-allowed',
                              )}
                            >
                              <div
                                className={cn(
                                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200',
                                  cap.enabled && mod.enabled ? 'right-0.5' : 'left-0.5',
                                )}
                              />
                            </button>
                          </div>

                          {/* Cap Role Matrix */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                            {(['admin', 'manager', 'advisor', 'user'] as const).map((r) => (
                              <div
                                key={r}
                                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-100"
                              >
                                <span className="text-[10px] font-bold text-slate-500 capitalize">{r}</span>
                                <button
                                  data-testid={`admin-aifeature-section-button-5-${r}`}
                                  type="button"
                                  onClick={() =>
                                    handleToggleCapabilityRoleAccess(key, cap.key, r, !cap.roleAccess[r])
                                  }
                                  disabled={!cap.enabled || !mod.enabled}
                                  className={cn(
                                    'w-8 h-4 rounded-full relative transition-all duration-200',
                                    cap.roleAccess[r] ? 'bg-indigo-600' : 'bg-slate-200',
                                    (!cap.enabled || !mod.enabled) && 'opacity-40 cursor-not-allowed',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200',
                                      cap.roleAccess[r] ? 'right-0.5' : 'left-0.5',
                                    )}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
