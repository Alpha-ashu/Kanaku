import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, X, Eye } from 'lucide-react';

interface VerificationRequiredModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onVerifyNow?: () => void;
  actionName?: string;
}

export const VerificationRequiredModal: React.FC<VerificationRequiredModalProps> = ({
  isOpen: propsIsOpen,
  onClose: propsOnClose,
  onVerifyNow: propsOnVerifyNow,
  actionName: propsActionName,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const [actionLabel, setActionLabel] = useState<string>('enter records');

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ actionName?: string }>).detail;
      if (detail?.actionName) {
        setActionLabel(detail.actionName);
      } else {
        setActionLabel('enter or modify records');
      }
      setInternalIsOpen(true);
    };

    window.addEventListener('OPEN_VERIFICATION_REQUIRED_MODAL', handleOpen);
    return () => {
      window.removeEventListener('OPEN_VERIFICATION_REQUIRED_MODAL', handleOpen);
    };
  }, []);

  const isOpen = propsIsOpen !== undefined ? propsIsOpen : internalIsOpen;
  const close = () => {
    if (propsOnClose) {
      propsOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const handleVerifyNow = () => {
    close();
    if (propsOnVerifyNow) {
      propsOnVerifyNow();
    } else {
      window.dispatchEvent(new CustomEvent('OPEN_PROFILE_VERIFICATION_MODAL'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-modal-title"
      >
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-7 text-center">
          <div className="relative w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Lock className="w-8 h-8" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center border-2 border-white shadow-xs">
              <Eye className="w-3.5 h-3.5" />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100/70 text-amber-800 mb-3 border border-amber-200/60">
            View-Only Mode Active
          </span>

          <h3 id="lock-modal-title" className="text-xl font-black text-slate-900 mb-2">
            Verification Required
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
            Your profile is currently unverified. You can view existing reports and dashboard data, but you must verify your profile to {propsActionName || actionLabel}.
          </p>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleVerifyNow}
              data-testid="verification-required-verify-now-btn"
              className="w-full py-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-md shadow-violet-500/20 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Verify Profile Now</span>
            </button>

            <button
              type="button"
              onClick={close}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-xs cursor-pointer"
            >
              Stay in View-Only Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
