import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  itemName?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title = 'Delete Confirmation',
  message,
  itemName,
  isLoading = false,
  onConfirm,
  onCancel,
  isDangerous = true,
}) => {
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[130] p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] shadow-2xl max-w-sm w-full border border-slate-100 overflow-hidden transform transition-all">
        <div className={`p-6 border-l-4 ${isDangerous ? 'border-rose-500' : 'border-amber-500'}`}>
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${isDangerous ? 'text-rose-500' : 'text-amber-500'}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">
                {title}
              </h3>
              <p className="text-slate-600 mt-2 text-sm">
                {message}
              </p>
              {itemName && (
                <p className="text-slate-900 mt-1 font-semibold text-sm break-words">
                  "{itemName}"
                </p>
              )}
              {isDangerous && (
                <p className="text-rose-600 mt-3 text-xs font-semibold">
                  This action cannot be undone.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-4 bg-slate-50/60 border-t border-slate-100">
          <button
            data-testid="delete-confirm-modal-cancel"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-slate-200/80 text-slate-800 rounded-full hover:bg-slate-300 disabled:bg-slate-200 font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="delete-confirm-modal-button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 rounded-full font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm ${
              isDangerous
                ? 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-400'
                : 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-400'
            }`}
          >
            {isLoading ? (
              <>
                <Loader size={16} className="animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
