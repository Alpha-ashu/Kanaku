import React from 'react';
import { Sliders, Check, RotateCcw, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ALL_BOTTOM_NAV_ITEMS,
  DEFAULT_BOTTOM_NAV_IDS,
  useBottomNavPreferences,
  BottomNavItemDefinition,
} from '@/lib/bottomNavPreferences';

export const BottomNavSettingsSection: React.FC = () => {
  const [selectedIds, setSelectedIds] = useBottomNavPreferences();

  const handleToggle = (itemId: string) => {
    let next: string[];
    if (selectedIds.includes(itemId)) {
      if (selectedIds.length <= 3) {
        toast.error('Keep at least 3 icons in your bottom navigation dock');
        return;
      }
      next = selectedIds.filter((id) => id !== itemId);
      toast.success('Removed from bottom navigation');
    } else {
      if (selectedIds.length >= 7) {
        toast.info('Maximum 7 icons in bottom navigation dock. Uncheck an item first to swap.');
        return;
      }
      next = [...selectedIds, itemId];
      toast.success('Added to bottom navigation');
    }
    setSelectedIds(next);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setSelectedIds(next);
  };

  const handleResetDefaults = () => {
    setSelectedIds(DEFAULT_BOTTOM_NAV_IDS);
    toast.success(`Reset to default ${DEFAULT_BOTTOM_NAV_IDS.length} bottom navigation icons`);
  };

  const selectedCount = selectedIds.length;
  const isDefaultCount = selectedCount === DEFAULT_BOTTOM_NAV_IDS.length;
  const activeSet = new Set(selectedIds);

  // Group items by selected and unselected
  const selectedItems = selectedIds
    .map((id) => ALL_BOTTOM_NAV_ITEMS.find((item) => item.id === id))
    .filter(Boolean) as BottomNavItemDefinition[];

  const unselectedItems = ALL_BOTTOM_NAV_ITEMS.filter((item) => !activeSet.has(item.id));

  return (
    <div className="space-y-5 select-none">
      {/* ── Section Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sliders size={13} strokeWidth={2.4} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 font-display tracking-tight">
              Bottom Navigation Customization
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Choose and arrange between 3 to 7 icons displayed in your mobile bottom navigation dock.
          </p>
        </div>

        {/* Counter Badge & Reset Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-colors',
              isDefaultCount
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isDefaultCount ? 'bg-purple-600' : 'bg-slate-500'
              )}
            />
            {selectedCount} / 7 icons active
          </span>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 whitespace-nowrap rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 transition-all cursor-pointer shadow-xs active:scale-95"
            title={`Reset to default ${DEFAULT_BOTTOM_NAV_IDS.length} items`}
          >
            <RotateCcw size={12} strokeWidth={2.2} />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* ── Live Dock Preview ── */}
      <div className="bg-slate-950 p-4 rounded-[28px] border border-white/10 shadow-lg flex flex-col items-center gap-2">
        <span className="text-2xs font-black text-slate-400 tracking-wider uppercase">
          Live Dock Preview (Mobile)
        </span>
        <div className="bg-[#000000] border border-white/[0.12] rounded-full p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.6)] flex items-center gap-1 sm:gap-1.5 max-w-full overflow-x-auto">
          {selectedItems.map((item, idx) => {
            const Icon = item.icon;
            const isFirst = idx === 0;
            return (
              <div
                key={item.id}
                className={cn(
                  'relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 text-white transition-all',
                  isFirst
                    ? 'bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] shadow-[0_4px_16px_rgba(124,58,237,0.5)]'
                    : 'bg-[#1C1C20]'
                )}
                title={item.label}
              >
                <Icon size={18} strokeWidth={2.3} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active Items with Reorder ── */}
      <div className="space-y-2">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider px-1">
          Active Dock Icons ({selectedItems.length})
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {selectedItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-white border border-purple-200/80 shadow-xs hover:border-purple-300 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-xs',
                      item.colorClass
                    )}
                  >
                    <Icon size={18} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-slate-900 truncate">
                        {item.label}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full text-2xs font-black bg-purple-100 text-purple-700">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Move left"
                  >
                    <ChevronUp size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === selectedItems.length - 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Move right"
                  >
                    <ChevronDown size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-600 text-white shadow-2xs hover:bg-rose-600 transition-colors cursor-pointer ml-1"
                    title="Remove from dock"
                  >
                    <Check size={14} strokeWidth={2.8} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Available Items (Click to Add) ── */}
      {unselectedItems.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider px-1">
            Available Pages to Pin ({unselectedItems.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unselectedItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleToggle(item.id)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 hover:bg-white border border-slate-200/60 hover:border-slate-300 text-left transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br opacity-80 group-hover:opacity-100 transition-opacity shadow-xs',
                        item.colorClass
                      )}
                    >
                      <Icon size={18} strokeWidth={2.3} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors truncate block">
                        {item.label}
                      </span>
                      <p className="text-xs text-slate-400 truncate">{item.description}</p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-purple-600 group-hover:bg-purple-50 px-2.5 py-1 rounded-full border border-transparent group-hover:border-purple-200 transition-all shrink-0 ml-2">
                    + Add
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BottomNavSettingsSection;
