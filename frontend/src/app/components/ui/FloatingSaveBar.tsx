import React from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingSaveBarProps {
  onSave: () => void;
  onDiscard: () => void;
  isSaving?: boolean;
  saveLabel?: string;
  discardLabel?: string;
  disabled?: boolean;
  className?: string;
  accentClass?: string;
  saveTestId?: string;
  discardTestId?: string;
}

export const FloatingSaveBar: React.FC<FloatingSaveBarProps> = ({
  onSave,
  onDiscard,
  isSaving = false,
  saveLabel = 'Save',
  discardLabel = 'Discard',
  disabled = false,
  className,
  accentClass = 'from-blue-500 to-indigo-600',
  saveTestId = 'floating-save-bar-save-button',
  discardTestId = 'floating-save-bar-discard-button',
}) => (
  <div
    className={cn(
      'fixed left-4 right-4 z-50',
      // Sit just above the mobile bottom-nav dock. `--bottom-nav-height` is
      // 64px on mobile/tablet but 0px on desktop (≥1025px, where the dock is
      // `lg:hidden`), so the bar automatically drops to ~10px from the bottom
      // on desktop instead of floating 72px up into the form fields.
      'bottom-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom,0px)+10px)]',
      // On desktop and tablet, make it follow the normal layout flow to prevent overlapping input fields
      'md:relative md:bottom-auto md:left-auto md:right-auto md:z-10 md:mt-8 md:mb-4 md:px-0',
      className
    )}
  >
    <div className="flex items-center gap-3 max-w-lg mx-auto bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-[0_8px_32px_rgba(0,0,0,0.14)] rounded-2xl px-4 py-3">
      <button
        onClick={onDiscard}
        disabled={isSaving}
        data-testid={discardTestId}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40 shrink-0"
      >
        <RotateCcw size={13} strokeWidth={3} />
        {discardLabel}
      </button>
      <button
        onClick={onSave}
        disabled={isSaving || disabled}
        data-testid={saveTestId}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-[12px] text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-60 shadow-[0_4px_12px_rgba(79,70,229,0.3)] bg-gradient-to-br',
          accentClass
        )}
      >
        {isSaving ? (
          <Loader2 className="animate-spin" size={13} />
        ) : (
          <Check size={13} strokeWidth={3} />
        )}
        {isSaving ? 'Saving…' : saveLabel}
      </button>
    </div>
  </div>
);
