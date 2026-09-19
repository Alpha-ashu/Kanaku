import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileText,
  AlertTriangle,
  Calendar,
  Building2,
  Hash,
  ChevronDown,
  Loader2,
  AlignLeft,
  Folder as FolderIcon,
  Files,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultFolder, VaultStorageUsage } from '@/services/vaultService';

interface VaultUploadModalProps {
  folders: VaultFolder[];
  defaultFolderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchToBulk?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.txt,.csv,.xlsx,.xls';

export const VaultUploadModal: React.FC<VaultUploadModalProps> = ({
  folders,
  defaultFolderId,
  isOpen,
  onClose,
  onSuccess,
  onSwitchToBulk,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string>(defaultFolderId || '');
  const [category, setCategory] = useState('Personal Documents');
  const [description, setDescription] = useState('');
  const [institution, setInstitution] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [storageUsage, setStorageUsage] = useState<VaultStorageUsage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderId(defaultFolderId || '');
      vaultService.getStorageUsage().then(setStorageUsage).catch(() => {});
    }
  }, [isOpen, defaultFolderId]);

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setInstitution('');
    setDocumentNumber('');
    setExpiryDate('');
    setShowOptionalFields(false);
    setCategory('Personal Documents');
  };

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.size > 25 * 1024 * 1024) {
      toast.error('File is too large. Maximum file size is 25 MB.');
      return;
    }
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }
    if (!title.trim()) {
      toast.error('Please provide a document title');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('category', category);
      if (folderId) formData.append('folderId', folderId);
      if (description.trim()) formData.append('description', description.trim());
      if (institution.trim()) formData.append('institution', institution.trim());
      if (documentNumber.trim()) formData.append('documentNumber', documentNumber.trim());
      if (expiryDate) formData.append('expiryDate', expiryDate);

      await vaultService.uploadDocument(formData);
      toast.success('Document uploaded successfully');
      resetForm();
      onSuccess();
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const storagePercent = storageUsage
    ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.limitBytes) * 100))
    : 0;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-1.5 sm:p-4 md:p-6 pointer-events-auto select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Screen Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-[calc(100vw-12px)] sm:max-w-xl h-[95dvh] sm:h-auto sm:max-h-[88vh] flex flex-col bg-white rounded-[28px] sm:rounded-[32px] shadow-2xl border border-slate-100/80 overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Streamlined Header */}
        <div className="shrink-0 flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-slate-100 bg-white/95 backdrop-blur-md gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                Upload Document
              </h2>
              <p className="text-xs text-slate-500 font-medium truncate">
                {category}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          id="vault-upload-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 min-w-0 overscroll-contain"
        >
          {/* Storage Warning if > 80% */}
          {storageUsage && storagePercent >= 80 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">
                Storage {storagePercent}% full ({formatBytes(storageUsage.usedBytes)} / {formatBytes(storageUsage.limitBytes)})
              </p>
            </div>
          )}

          {/* Switch to Bulk Upload Banner */}
          {onSwitchToBulk && (
            <button
              type="button"
              onClick={onSwitchToBulk}
              className="w-full p-2.5 rounded-xl bg-blue-50/70 hover:bg-blue-50 border border-blue-200/80 text-xs font-semibold text-blue-700 flex items-center justify-between transition-colors cursor-pointer group"
            >
              <span className="flex items-center gap-2">
                <Files className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Need to upload multiple documents?</span>
              </span>
              <span className="font-bold underline text-blue-800 group-hover:text-blue-900">
                Switch to Bulk &rarr;
              </span>
            </button>
          )}

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60'
                : file
                ? 'border-emerald-400 bg-emerald-50/40'
                : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center gap-2.5 justify-center min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <div className="text-left min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs font-medium text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="p-1 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1.5">
                  <Upload className="w-4.5 h-4.5" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-800">
                  Drop file here or <span className="text-blue-600 hover:underline">browse</span>
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">PDF, JPG, PNG, WEBP, DOCX · Max 25 MB</p>
              </>
            )}
          </div>

          {/* Document Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Document Title <span className="text-blue-600">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., PAN Card, Aadhaar, Property Deed"
              required
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none"
            />
          </div>

          {/* Category & Folder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="Personal Documents">Personal Documents</option>
                  <option value="Property Documents">Property Documents</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Financial Documents">Financial Documents</option>
                  <option value="Legal Documents">Legal Documents</option>
                  <option value="Medical Documents">Medical Documents</option>
                  <option value="Other">Other</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FolderIcon className="w-3.5 h-3.5 text-slate-400" /> Folder
              </label>
              <div className="relative">
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="">— Root Folder —</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Optional Details Collapsible Button */}
          <button
            type="button"
            onClick={() => setShowOptionalFields(!showOptionalFields)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 pt-0.5 cursor-pointer transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showOptionalFields ? 'rotate-180' : ''}`} />
            {showOptionalFields ? 'Hide optional details' : '+ Add institution, number, expiry (Optional)'}
          </button>

          {/* Optional fields section */}
          <AnimatePresence>
            {showOptionalFields && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 pt-1 overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" /> Institution
                    </label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="e.g., UIDAI, SBI"
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Hash className="w-3 h-3 text-slate-400" /> Document Number
                    </label>
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="e.g., XXXX-1234"
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> Expiry Date
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 font-medium transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <AlignLeft className="w-3 h-3 text-slate-400" /> Notes
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Additional notes..."
                    rows={2}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none resize-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Fixed Sticky Footer */}
        <div className="shrink-0 p-3 sm:p-3.5 border-t border-slate-100 bg-white/95 backdrop-blur-md flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="h-10 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="vault-upload-form"
            disabled={isUploading || !file}
            className="flex-1 h-10 px-3.5 rounded-xl bg-[#18181B] hover:bg-black active:bg-zinc-900 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-0 truncate"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="truncate">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 shrink-0" />
                <span className="truncate">Upload Document</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
