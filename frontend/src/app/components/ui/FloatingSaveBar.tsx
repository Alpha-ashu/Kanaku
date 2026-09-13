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
  accentClass = 'bg-indigo-600 hover:bg-indigo-700 bg-gradient-to-r from-blue-600 to-indigo-600',
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
    <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto max-w-lg lg:max-w-none mx-auto bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.18)] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5">
      <button
        type="button"
        onClick={onDiscard}
        disabled={isSaving}
        data-testid={discardTestId}
        style={{
          background: '#f1f5f9',
          color: '#334155',
        }}
        className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[40px] md:min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40 shrink-0 cursor-pointer border border-slate-200/80 shadow-sm"
      >
        <RotateCcw size={13} strokeWidth={2.5} className="text-slate-600 shrink-0 sm:w-3.5 sm:h-3.5 w-3 h-3" />
        <span style={{ color: '#334155', fontWeight: '700' }}>{discardLabel}</span>
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || disabled}
        data-testid={saveTestId}
        style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
        }}
        className={cn(
          'flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[40px] md:min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50 cursor-pointer',
          accentClass
        )}
      >
        {isSaving ? (
          <Loader2 className="animate-spin text-white shrink-0 sm:w-3.5 sm:h-3.5 w-3 h-3" size={13} />
        ) : (
          <Check size={13} strokeWidth={3} className="text-white shrink-0 sm:w-3.5 sm:h-3.5 w-3 h-3" />
        )}
        <span style={{ color: '#ffffff', fontWeight: '700' }}>{isSaving ? 'Saving…' : saveLabel}</span>
      </button>
    </div>
  </div>
);
