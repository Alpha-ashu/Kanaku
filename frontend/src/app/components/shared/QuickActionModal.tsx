import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { useAICapability, useOptionalApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessPage, FeatureVisibility } from '@/lib/featureFlags';
import {
  ALL_QUICK_ACTIONS,
  useQuickActionPreferences,
  QuickActionDefinition,
} from '@/lib/quickActionPreferences';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  onAction,
}) => {
  const [selectedIds] = useQuickActionPreferences();
  const app = useOptionalApp();
  const { role } = useAuth();
  const voiceEnabled = useAICapability('voiceAssistant');
  const visibleFeatures = (app?.visibleFeatures ?? {}) as FeatureVisibility;

  // Filter actions based strictly on user selection in Settings (up to 15 items)
  const activeActions = React.useMemo(() => {
    const actionMap = new Map<string, QuickActionDefinition>(
      ALL_QUICK_ACTIONS.map((a) => [a.id, a])
    );

    const items: QuickActionDefinition[] = [];
    const seenIds = new Set<string>();

    for (const id of selectedIds) {
      const action = actionMap.get(id);
      if (!action || seenIds.has(action.id)) continue;
      if (action.roles && action.roles.length > 0 && !action.roles.includes(role)) continue;
      if (action.requiresVoice && !voiceEnabled) continue;
      if (action.category === 'navigation' || action.id === 'book-advisor') {
        if (!canAccessPage(action.id, visibleFeatures)) continue;
      }
      seenIds.add(action.id);
      items.push(action);
      if (items.length >= 15) break; // 3 columns × 5 rows = 15 total slots
    }

    return items;
  }, [selectedIds, role, voiceEnabled, visibleFeatures]);

  const handleAction = (actionId: string) => {
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
    onAction(actionId);
    onClose();
  };

  const handleOpenSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    if (app?.setCurrentPage) {
      app.setCurrentPage('settings');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
          {/* Frosted Glass Backdrop */}
          <motion.div
            data-testid="quick-action-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs pointer-events-auto"
            onClick={onClose}
          />

          {/* Centered Popup Dialog Card (Exact 3 Columns × 5 Rows Layout) */}
          <motion.div
            data-testid="quick-action-modal-popup"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            className="pointer-events-auto relative z-[61] w-full max-w-[390px] sm:max-w-[430px] bg-white rounded-[28px] shadow-[0_24px_70px_rgba(15,23,42,0.22),0_4px_16px_rgba(15,23,42,0.06)] border border-slate-100 overflow-hidden flex flex-col select-none"
          >
            {/* Accessible screen-reader title */}
            <h2 className="sr-only">Quick Actions</h2>

            {/* Grid Section: Keep only user-selected shortcuts visible */}
            <div className="p-3 sm:p-3.5 bg-slate-50/40 max-h-[74vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {activeActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleAction(action.id)}
                      data-testid={`quickaction-${action.id}-button`}
                      className="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-300 hover:bg-purple-50/30 hover:shadow-md hover:shadow-purple-500/8 transition-all active:scale-[0.95] group text-center cursor-pointer min-h-[82px] sm:min-h-[86px]"
                    >
                      {/* Vibrant Squircle Icon */}
                      <div
                        className={cn(
                          "w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center mb-1 transition-transform duration-200 group-hover:scale-108",
                          action.colorClass
                        )}
                      >
                        <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
                      </div>

                      {/* Label */}
                      <span className="text-[11.5px] sm:text-xs font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate w-full px-0.5 leading-tight">
                        {action.shortLabel || action.label}
                      </span>

                      {/* Subtitle */}
                      <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-medium truncate w-full px-0.5 mt-0.5 leading-none group-hover:text-slate-500 transition-colors">
                        {action.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer: Keep only Customize button */}
            <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex items-center justify-end text-xs shrink-0">
              <button
                type="button"
                onClick={handleOpenSettings}
                className="text-purple-600 hover:text-purple-800 hover:underline font-bold text-xs cursor-pointer flex items-center gap-1 ml-auto"
                title="Customize in Settings"
              >
                <span>Customize</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
