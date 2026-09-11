import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalWrapperProps {
 title: string;
 subtitle?: string;
 children: React.ReactNode;
 onClose: () => void;
 footer?: React.ReactNode;
 className?: string;
 maxWidth?: string;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
 title,
 subtitle,
 children,
 onClose,
 footer,
 className,
 maxWidth = 'max-w-3xl',
}) => {
 const panelRef = useRef<HTMLDivElement | null>(null);

 useEffect(() => {
 const previousOverflow = document.body.style.overflow;
 document.body.style.overflow = 'hidden';

 const onKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') onClose();
 };

 window.addEventListener('keydown', onKeyDown);
 return () => {
 window.removeEventListener('keydown', onKeyDown);
 document.body.style.overflow = previousOverflow;
 };
 }, [onClose]);

 return (
    <div
      className="fixed inset-0 z-[300] bg-slate-950/55 p-4 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-testid="modal-wrapper-div"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'mx-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[28px] sm:rounded-[36px] border border-slate-100 bg-white shadow-2xl',
          maxWidth,
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
          <div className="min-w-0 pr-3">
            <h2 id="modal-title" className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight truncate">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400 font-medium truncate">{subtitle}</p>}
          </div>
          <button
            data-testid="modal-wrapper-close-modal"
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100/80 hover:bg-slate-200/80 active:scale-95 flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/60 px-5 sm:px-6 py-4">{footer}</div>}
      </div>
    </div>
 );
};
