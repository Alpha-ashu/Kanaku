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
      'fixed z-50 transition-all duration-300 pointer-events-none',
      // Mobile / Tablet layout (bottom centered above mobile nav dock)
      'left-0 right-0 flex justify-center px-3 sm:px-4 bottom-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom,0px)+10px)]',
      // Desktop view: float on the bottom right side as a fixed right-side widget
      'lg:left-auto lg:right-8 lg:bottom-8 lg:w-auto lg:block',
      className
    )}
  >
    <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 w-[300px] min-[400px]:w-[320px] sm:w-[360px] lg:w-auto max-w-[calc(100vw-24px)] mx-auto bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_6px_24px_rgba(0,0,0,0.14)] rounded-full px-2 sm:px-2.5 py-1.5">
      <button
        type="button"
        onClick={onDiscard}
        disabled={isSaving}
        data-testid={discardTestId}
        style={{
          background: '#f1f5f9',
          color: '#334155',
        }}
        className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 min-h-[34px] sm:min-h-[36px] rounded-full text-[10px] sm:text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40 shrink-0 cursor-pointer border border-slate-200/80 shadow-xs"
      >
        <RotateCcw size={12} strokeWidth={2.5} className="text-slate-600 shrink-0 w-3 h-3" />
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
          boxShadow: '0 3px 12px rgba(79, 70, 229, 0.3)',
        }}
        className={cn(
          'flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-5 py-1.5 min-h-[34px] sm:min-h-[36px] rounded-full text-[10px] sm:text-[11px] font-bold text-white active:scale-95 transition-all disabled:opacity-50 cursor-pointer',
          accentClass
        )}
      >
        {isSaving ? (
          <Loader2 className="animate-spin text-white shrink-0 w-3 h-3" size={12} />
        ) : (
          <Check size={12} strokeWidth={3} className="text-white shrink-0 w-3 h-3" />
        )}
        <span style={{ color: '#ffffff', fontWeight: '700' }}>{isSaving ? 'Saving…' : saveLabel}</span>
      </button>
    </div>
  </div>
);
