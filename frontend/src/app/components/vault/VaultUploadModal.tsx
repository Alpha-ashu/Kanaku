import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileText,
  AlertTriangle,
  Lock,
  Calendar,
  Tag,
  Building2,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultFolder, VaultStorageUsage } from '@/services/vaultService';

interface VaultUploadModalProps {
  folders: VaultFolder[];
  defaultFolderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.docx';

export const VaultUploadModal: React.FC<VaultUploadModalProps> = ({
  folders,
  defaultFolderId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string>(defaultFolderId || '');
  const [category, setCategory] = useState('Personal Documents');
  const [description, setDescription] = useState('');
  const [institution, setInstitution] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isSensitive, setIsSensitive] = useState(false);
  const [tags, setTags] = useState('');
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
    setIsSensitive(false);
    setTags('');
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
      toast.error('Please select a document to upload');
      return;
    }

    // Check quota client-side
    if (storageUsage && storageUsage.remainingBytes < file.size) {
      toast.error(`Not enough storage. You have ${formatBytes(storageUsage.remainingBytes)} remaining.`);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim() || file.name);
      formData.append('category', category);
      if (folderId) formData.append('folderId', folderId);
      if (description.trim()) formData.append('description', description.trim());
      if (institution.trim()) formData.append('institution', institution.trim());
      if (documentNumber.trim()) formData.append('documentNumber', documentNumber.trim());
      if (expiryDate) formData.append('expiryDate', expiryDate);
      if (isSensitive) formData.append('isSensitive', 'true');
      if (tags.trim()) {
        tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
          formData.append('tags', t);
        });
      }

      await vaultService.uploadDocument(formData);
      toast.success('Document uploaded & encrypted successfully');
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const storagePercent = storageUsage
    ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.limitBytes) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{
          background: 'var(--glass-modal-bg)',
          backdropFilter: 'var(--glass-modal-blur)',
          border: 'var(--glass-modal-border)',
          boxShadow: 'var(--glass-modal-shadow)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 pb-3 bg-white/95 backdrop-blur-md rounded-t-3xl border-b border-slate-100">
          <div>
            <h2 className="text-section-title">Upload Document</h2>
            <p className="text-caption mt-0.5">Encrypted with AES-256 at rest</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Storage Warning */}
          {storageUsage && storagePercent >= 80 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-body-sm text-amber-700">
                Storage {storagePercent}% full ({formatBytes(storageUsage.usedBytes)} / {formatBytes(storageUsage.limitBytes)})
              </p>
            </div>
          )}

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-purple-400 bg-purple-50/50'
                : file
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/20'
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
              <div className="flex items-center gap-3 justify-center">
                <FileText className="w-6 h-6 text-emerald-600" />
                <div className="text-left">
                  <p className="text-card-title text-emerald-800 truncate max-w-[260px]">{file.name}</p>
                  <p className="text-caption">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="p-1 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-body-sm text-slate-500 font-semibold">
                  Drop file here or <span className="text-purple-600">browse</span>
                </p>
                <p className="text-caption mt-1">PDF, JPG, PNG, WEBP, DOCX · Max 25 MB</p>
              </>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="KANAKU-label">Document Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., PAN Card, Aadhaar, Property Deed"
              className="KANAKU-input"
            />
          </div>

          {/* Category & Folder row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="KANAKU-label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
                <option value="Personal Documents">Personal Documents</option>
                <option value="Property Documents">Property Documents</option>
                <option value="Insurance">Insurance</option>
                <option value="Financial Documents">Financial Documents</option>
                <option value="Legal Documents">Legal Documents</option>
                <option value="Medical Documents">Medical Documents</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="KANAKU-label">Folder</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full">
                <option value="">— Root —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Institution & Document Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="KANAKU-label flex items-center gap-1"><Building2 className="w-3 h-3" /> Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g., UIDAI, SBI, LIC"
                className="KANAKU-input"
              />
            </div>
            <div>
              <label className="KANAKU-label flex items-center gap-1"><Hash className="w-3 h-3" /> Doc Number</label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="e.g., XXXX-1234"
                className="KANAKU-input"
              />
            </div>
          </div>

          {/* Expiry Date */}
          <div>
            <label className="KANAKU-label flex items-center gap-1"><Calendar className="w-3 h-3" /> Expiry Date (Optional)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="KANAKU-input"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="KANAKU-label flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma separated: identity, government, renewal"
              className="KANAKU-input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="KANAKU-label">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes about this document..."
              rows={2}
              className="KANAKU-input !h-auto py-2.5"
            />
          </div>

          {/* Sensitive Toggle */}
          <label className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/50 border border-amber-100/50 cursor-pointer">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-body-sm font-semibold text-amber-800">Mark as Sensitive</p>
              <p className="text-caption text-amber-600">Requires extra confirmation before sharing</p>
            </div>
            <input
              type="checkbox"
              checked={isSensitive}
              onChange={(e) => setIsSensitive(e.target.checked)}
              className="w-5 h-5 rounded accent-amber-600"
            />
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={isUploading || !file}
            className="KANAKU-btn KANAKU-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Encrypting & Uploading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Upload & Encrypt
              </span>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
