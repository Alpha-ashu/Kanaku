import React from 'react';
import { Sparkles, Check, RotateCcw, Info, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ALL_QUICK_ACTIONS,
  DEFAULT_QUICK_ACTION_IDS,
  useQuickActionPreferences,
  QuickActionDefinition,
} from '@/lib/quickActionPreferences';

export const QuickActionSettingsSection: React.FC = () => {
  const [selectedIds, setSelectedIds] = useQuickActionPreferences();

  const handleToggle = (actionId: string) => {
    let next: string[];
    if (selectedIds.includes(actionId)) {
      if (selectedIds.length <= 1) {
        toast.error('Keep at least 1 quick action selected');
        return;
      }
      next = selectedIds.filter((id) => id !== actionId);
      toast.success('Feature removed from Quick Actions');
    } else {
      if (selectedIds.length >= 15) {
        toast.info('Maximum 15 slots in the 3×5 grid. Uncheck an action first to swap.');
        return;
      }
      next = [...selectedIds, actionId];
      toast.success('Feature added to Quick Actions');
    }
    setSelectedIds(next);
  };

  const handleResetDefaults = () => {
    setSelectedIds(DEFAULT_QUICK_ACTION_IDS);
    toast.success(`Reset to default ${DEFAULT_QUICK_ACTION_IDS.length} quick action shortcuts`);
  };

  const selectedCount = selectedIds.length;
  const isDefaultCount = selectedCount === DEFAULT_QUICK_ACTION_IDS.length;
  const activeSet = new Set(selectedIds);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sliders size={13} strokeWidth={2.4} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 font-display tracking-tight">
              Quick Actions Customization
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Select shortcuts to display in your bottom navigation Quick Action popup.
          </p>
        </div>

        {/* Counter Badge & Reset Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-colors",
              isDefaultCount
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isDefaultCount ? "bg-blue-600" : "bg-amber-500 animate-pulse"
              )}
            />
            {selectedCount} / 15 selected
          </span>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 transition-all cursor-pointer shadow-xs active:scale-95"
            title={`Reset to default ${DEFAULT_QUICK_ACTION_IDS.length} items`}
          >
            <RotateCcw size={12} strokeWidth={2.2} />
            <span>Reset {DEFAULT_QUICK_ACTION_IDS.length} Defaults</span>
          </button>
        </div>
      </div>

      {/* Feature Selection Card */}
      <div className="bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] overflow-hidden divide-y divide-slate-100">
        <div className="p-3.5 bg-blue-50/50 border-b border-blue-100/60 flex items-start gap-2.5 text-xs text-blue-900">
          <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Check the shortcuts you want in your bottom navigation Quick Action popup.
            Selected actions appear in order when tapping the circular plus button.
          </p>
        </div>

        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {ALL_QUICK_ACTIONS.map((action: QuickActionDefinition) => {
            const isChecked = activeSet.has(action.id);
            const slotIndex = isChecked ? selectedIds.indexOf(action.id) + 1 : null;
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleToggle(action.id)}
                className={cn(
                  "flex items-center justify-between p-3 rounded-[20px] sm:rounded-[22px] border transition-all duration-150 text-left cursor-pointer select-none group",
                  isChecked
                    ? "bg-blue-50/50 border-blue-300 shadow-xs"
                    : "bg-slate-50/50 border-slate-200/70 hover:border-slate-300 hover:bg-white opacity-75 hover:opacity-100"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Squircle with vibrant gradient matching the popup */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-xs",
                      action.colorClass
                    )}
                  >
                    <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                        {action.label}
                      </p>
                      {slotIndex && (
                        <span className="text-[9.5px] font-bold text-blue-600 bg-blue-100/70 px-1.5 py-0.2 rounded-full shrink-0">
                          #{slotIndex}
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-slate-400 font-medium truncate mt-0.5">
                      {action.description}
                    </p>
                  </div>
                </div>

                {/* Checkbox indicator */}
                <div
                  className={cn(
                    "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ml-2 border transition-all duration-150",
                    isChecked
                      ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                      : "border-slate-300 bg-white group-hover:border-blue-400"
                  )}
                >
                  {isChecked && <Check size={12} strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
