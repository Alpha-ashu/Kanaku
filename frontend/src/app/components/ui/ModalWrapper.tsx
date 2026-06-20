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
 className="fixed inset-0 z-[300] bg-slate-950/55 p-4"
 onMouseDown={(event) => {
 if (event.target === event.currentTarget) onClose();
 }}
 >
 <div data-testid="modal-wrapper-div"
 ref={panelRef}
 role="dialog"
 aria-modal="true"
 aria-labelledby="modal-title"
 className={cn(
 'mx-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl',
 maxWidth,
 className,
 )}
 >
 <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
 <div>
 <h2 id="modal-title" className="text-lg font-semibold text-slate-950">{title}</h2>
 {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
 </div>
 <button data-testid="modal-wrapper-close-modal"
 type="button"
 onClick={onClose}
 className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
 aria-label="Close modal"
 >
 <X size={18} />
 </button>
 </div>
 <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
 {footer && <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">{footer}</div>}
 </div>
 </div>
 );
};
