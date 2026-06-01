import React, { useState, useEffect } from 'react';
import { Brain, Shield, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  UserRole,
  AIModuleKey,
  AIModuleDef,
  AICapabilityDef,
  AI_MODULE_DEFINITIONS
} from '@/lib/featureFlags';
import { backendService } from '@/lib/backend-api';

const ADMIN_AI_FEATURE_SETTINGS_KEY = 'admin_ai_feature_settings';
const AI_FEATURE_BROADCAST_CHANNEL = 'ai_feature_settings_channel';

const AI_MODULE_DESCRIPTIONS: Record<AIModuleKey, string> = {
  ocrEngine: 'Converts receipt images and PDF document uploads into structured transactional entries.',
  voiceAssistant: 'Hands-free command engine translating spoken voice transcripts into financial logs.',
  aiAutomation: 'Automated background algorithms executing smart category suggestions and health analysis.',
};

export const AdminAIFeatureSection: React.FC = () => {
  const [aiFeatures, setAiFeatures] = useState<Record<AIModuleKey, AIModuleDef>>(() => {
    const saved = localStorage.getItem(ADMIN_AI_FEATURE_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = { ...AI_MODULE_DEFINITIONS };
        (Object.keys(AI_MODULE_DEFINITIONS) as AIModuleKey[]).forEach((key) => {
          if (parsed[key]) {
            merged[key] = {
              ...merged[key],
              enabled: typeof parsed[key].enabled === 'boolean' ? parsed[key].enabled : merged[key].enabled,
              roleAccess: { ...merged[key].roleAccess, ...(parsed[key].roleAccess || {}) },
              capabilities: Object.keys(merged[key].capabilities).reduce((acc, capKey) => {
                const defaultCap = merged[key].capabilities[capKey];
                const savedCap = parsed[key].capabilities?.[capKey] || {};
                acc[capKey] = {
                  ...defaultCap,
                  enabled: typeof savedCap.enabled === 'boolean' ? savedCap.enabled : defaultCap.enabled,
                  roleAccess: { ...defaultCap.roleAccess, ...(savedCap.roleAccess || {}) }
                };
                return acc;
              }, {} as Record<string, AICapabilityDef>)
            };
          }
        });
        return merged;
      } catch {
        return AI_MODULE_DEFINITIONS;
      }
    }
    return AI_MODULE_DEFINITIONS;
  });

  const [expandedModule, setExpandedModule] = useState<AIModuleKey | null>('ocrEngine');

  const broadcastChannel = React.useMemo(() => {
    try {
      return new BroadcastChannel(AI_FEATURE_BROADCAST_CHANNEL);
    } catch {
      return null;
    }
  }, []);

  // Fetch settings from DB on mount
  useEffect(() => {
    const loadFromDb = async () => {
      try {
        const dbFlags = await backendService.getAIFeatureFlags();
        if (dbFlags && Object.keys(dbFlags).length > 0) {
          localStorage.setItem(ADMIN_AI_FEATURE_SETTINGS_KEY, JSON.stringify(dbFlags));
          const merged = { ...AI_MODULE_DEFINITIONS };
          (Object.keys(AI_MODULE_DEFINITIONS) as AIModuleKey[]).forEach((key) => {
            if (dbFlags[key]) {
              merged[key] = {
                ...merged[key],
                enabled: typeof dbFlags[key].enabled === 'boolean' ? dbFlags[key].enabled : merged[key].enabled,
                roleAccess: { ...merged[key].roleAccess, ...(dbFlags[key].roleAccess || {}) },
                capabilities: Object.keys(merged[key].capabilities).reduce((acc, capKey) => {
                  const defaultCap = merged[key].capabilities[capKey];
                  const savedCap = dbFlags[key].capabilities?.[capKey] || {};
                  acc[capKey] = {
                    ...defaultCap,
                    enabled: typeof savedCap.enabled === 'boolean' ? savedCap.enabled : defaultCap.enabled,
                    roleAccess: { ...defaultCap.roleAccess, ...(savedCap.roleAccess || {}) }
                  };
                  return acc;
                }, {} as Record<string, AICapabilityDef>)
              };
            }
          });
          setAiFeatures(merged);
        }
      } catch (err) {
        console.error('Failed to load global AI feature flags from backend database:', err);
      }
    };
    void loadFromDb();
  }, []);

  // Sync listener for cross-tab updates
  useEffect(() => {
    if (!broadcastChannel) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'AI_FEATURE_UPDATE') {
        setAiFeatures(event.data.features);
        toast.info('AI Feature settings updated by admin');
      }
    };

    broadcastChannel.addEventListener('message', handleMessage);
    return () => broadcastChannel.removeEventListener('message', handleMessage);
  }, [broadcastChannel]);

  const saveAndBroadcast = (updated: Record<AIModuleKey, AIModuleDef>) => {
    setAiFeatures(updated);
    localStorage.setItem(ADMIN_AI_FEATURE_SETTINGS_KEY, JSON.stringify(updated));

    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'AI_FEATURE_UPDATE',
        features: updated,
        timestamp: new Date().toISOString()
      });
    }

    void backendService.saveAIFeatureFlags(updated).catch((err) => {
      console.error('Failed to sync global AI feature flags to backend database:', err);
    });

    // Fire generic update event for context reload
    window.dispatchEvent(new CustomEvent('adminAIFeatureUpdate', { detail: { features: updated } }));
  };

  const handleToggleModuleEnabled = (key: AIModuleKey, isEnabled: boolean) => {
    const updated = {
      ...aiFeatures,
      [key]: {
        ...aiFeatures[key],
        enabled: isEnabled,
      }
    };
    saveAndBroadcast(updated);
    toast.success(`AI Module "${aiFeatures[key].name}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleModuleRoleAccess = (key: AIModuleKey, role: UserRole, isGranted: boolean) => {
    const updated = {
      ...aiFeatures,
      [key]: {
        ...aiFeatures[key],
        roleAccess: {
          ...aiFeatures[key].roleAccess,
          [role]: isGranted
        }
      }
    };
    saveAndBroadcast(updated);
    toast.success(`AI Module "${aiFeatures[key].name}" access for ${role} ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

  const handleToggleCapabilityEnabled = (moduleKey: AIModuleKey, capKey: string, isEnabled: boolean) => {
    const updated = {
      ...aiFeatures,
      [moduleKey]: {
        ...aiFeatures[moduleKey],
        capabilities: {
          ...aiFeatures[moduleKey].capabilities,
          [capKey]: {
            ...aiFeatures[moduleKey].capabilities[capKey],
            enabled: isEnabled
          }
        }
      }
    };
    saveAndBroadcast(updated);
    toast.success(`AI Capability "${capKey}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleCapabilityRoleAccess = (moduleKey: AIModuleKey, capKey: string, role: UserRole, isGranted: boolean) => {
    const updated = {
      ...aiFeatures,
      [moduleKey]: {
        ...aiFeatures[moduleKey],
        capabilities: {
          ...aiFeatures[moduleKey].capabilities,
          [capKey]: {
            ...aiFeatures[moduleKey].capabilities[capKey],
            roleAccess: {
              ...aiFeatures[moduleKey].capabilities[capKey].roleAccess,
              [role]: isGranted
            }
          }
        }
      }
    };
    saveAndBroadcast(updated);
    toast.success(`AI Capability "${capKey}" access for ${role} ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

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
              {/* Header Info */}
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

                {/* Master Status & Toggle */}
                <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-5 py-3 border border-slate-100 self-start md:self-auto">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Switch</span>
                  <button
                    type="button"
                    onClick={() => handleToggleModuleEnabled(key, !mod.enabled)}
                    className={cn(
                      "w-12 h-6 rounded-full relative transition-all duration-200 outline-none",
                      mod.enabled ? "bg-indigo-600" : "bg-slate-200"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                        mod.enabled ? "right-1" : "left-1"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Role Permissions Matrix */}
              <div className="py-6 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role Visibility Matrix</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(['admin', 'manager', 'advisor', 'user'] as const).map((role) => (
                    <div
                      key={role}
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200",
                        mod.roleAccess[role] && mod.enabled
                          ? "bg-slate-50/50 border-slate-200/60"
                          : "bg-slate-50/20 border-slate-100 opacity-60"
                      )}
                    >
                      <span className="text-xs font-bold text-slate-700 capitalize">{role}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleModuleRoleAccess(key, role, !mod.roleAccess[role])}
                        disabled={!mod.enabled}
                        className={cn(
                          "w-9 h-5 rounded-full relative transition-all duration-200",
                          mod.roleAccess[role] ? "bg-indigo-600" : "bg-slate-300",
                          !mod.enabled && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        <div
                          className={cn(
                            "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                            mod.roleAccess[role] ? "right-0.5" : "left-0.5"
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Granular Capabilities Accordion Toggle */}
              {capabilities.length > 0 && (
                <div className="pt-4">
                  <button
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

                  {/* Capabilities List */}
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
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{cap.key}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleCapabilityEnabled(key, cap.key, !cap.enabled)}
                              disabled={!mod.enabled}
                              className={cn(
                                "w-10 h-5 rounded-full relative transition-all duration-200",
                                cap.enabled && mod.enabled ? "bg-indigo-600" : "bg-slate-300",
                                !mod.enabled && "opacity-40 cursor-not-allowed"
                              )}
                            >
                              <div
                                className={cn(
                                  "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                                  cap.enabled && mod.enabled ? "right-0.5" : "left-0.5"
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
                                  type="button"
                                  onClick={() => handleToggleCapabilityRoleAccess(key, cap.key, r, !cap.roleAccess[r])}
                                  disabled={!cap.enabled || !mod.enabled}
                                  className={cn(
                                    "w-8 h-4 rounded-full relative transition-all duration-200",
                                    cap.roleAccess[r] ? "bg-indigo-600" : "bg-slate-200",
                                    (!cap.enabled || !mod.enabled) && "opacity-40 cursor-not-allowed"
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200",
                                      cap.roleAccess[r] ? "right-0.5" : "left-0.5"
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
