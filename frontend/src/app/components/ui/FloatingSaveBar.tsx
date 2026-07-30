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
      'fixed z-50 transition-all duration-300',
      // Mobile / Tablet layout (bottom centered above mobile nav dock)
      'left-4 right-4 bottom-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom,0px)+10px)]',
      // Desktop view: float on the bottom right side as a fixed right-side widget
      'lg:left-auto lg:right-8 lg:bottom-8 lg:w-auto',
      className
    )}
  >
    <div className="flex items-center gap-3 w-full lg:w-auto max-w-lg lg:max-w-none mx-auto bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-[0_8px_32px_rgba(0,0,0,0.14)] rounded-2xl px-4 py-3">
      <button
        onClick={onDiscard}
        disabled={isSaving}
        data-testid={discardTestId}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40 shrink-0 cursor-pointer"
      >
        <RotateCcw size={13} strokeWidth={3} />
        {discardLabel}
      </button>
      <button
        onClick={onSave}
        disabled={isSaving || disabled}
        data-testid={saveTestId}
        className={cn(
          'flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-[12px] text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-60 shadow-[0_4px_12px_rgba(79,70,229,0.3)] bg-gradient-to-br cursor-pointer',
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
