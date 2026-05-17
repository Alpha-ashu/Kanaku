import React from 'react';
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

 return (
 <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
 <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-sm w-full border border-white/50 overflow-hidden transform transition-all">
 <div className={`p-6 border-l-4 ${isDangerous ? 'border-red-500' : 'border-yellow-500'}`}>
 <div className="flex items-start gap-4">
 <div className={`flex-shrink-0 ${isDangerous ? 'text-red-500' : 'text-yellow-500'}`}>
 <AlertTriangle size={24} />
 </div>
 <div className="flex-1">
 <h3 className={`text-lg font-bold ${isDangerous ? 'text-red-900' : 'text-yellow-900'}`}>
 {title}
 </h3>
 <p className="text-gray-700 mt-2 text-sm">
 {message}
 </p>
 {itemName && (
 <p className="text-gray-900 mt-1 font-medium text-sm break-words">
"{itemName}"
 </p>
 )}
 {isDangerous && (
 <p className="text-red-600 mt-3 text-xs font-medium">
 This action cannot be undone.
 </p>
 )}
 </div>
 </div>
 </div>

 <div className="flex gap-3 p-4 bg-white/50 border-t border-gray-200/50">
 <button
 onClick={onCancel}
 disabled={isLoading}
 className="flex-1 px-4 py-2.5 bg-gray-200/80 text-gray-800 rounded-xl hover:bg-gray-300 disabled:bg-gray-200 font-medium transition-colors backdrop-blur-sm"
 >
 Cancel
 </button>
 <button
 onClick={onConfirm}
 disabled={isLoading}
 className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg ${
 isDangerous
 ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-700 hover:to-rose-700 disabled:from-red-400 disabled:to-rose-400'
 : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:from-yellow-600 hover:to-amber-600 disabled:from-yellow-400 disabled:to-amber-400'
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
 </div>
 );
};
