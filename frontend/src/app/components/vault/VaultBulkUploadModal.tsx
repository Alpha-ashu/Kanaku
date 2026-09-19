import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  AlertTriangle,
  Folder as FolderIcon,
  ChevronDown,
  Loader2,
  CheckCircle2,
  CheckSquare,
  Square,
  FolderPlus,
  ArrowRight,
  Sparkles,
  Files,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultFolder, VaultStorageUsage, VaultDocument } from '@/services/vaultService';

interface VaultBulkUploadModalProps {
  folders: VaultFolder[];
  defaultFolderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onFolderCreated?: () => void;
}

interface QueuedFile {
  id: string;
  file: File;
  title: string;
  category: string;
  folderId: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  uploadedDoc?: VaultDocument;
  selectedForMove?: boolean;
}

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.txt,.csv,.xlsx,.xls';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const CATEGORIES = [
  'Personal Documents',
  'Property Documents',
  'Insurance',
  'Financial Documents',
  'Legal Documents',
  'Medical Documents',
  'Other',
];

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const getFileTypeDetails = (fileName: string, mimeType: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf' || mimeType.includes('pdf')) {
    return { icon: '📄', label: 'PDF', bg: 'bg-rose-50 text-rose-600 border-rose-200' };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || mimeType.startsWith('image/')) {
    return { icon: '🖼️', label: ext.toUpperCase() || 'IMG', bg: 'bg-blue-50 text-blue-600 border-blue-200' };
  }
  if (['doc', 'docx'].includes(ext) || mimeType.includes('word')) {
    return { icon: '📝', label: 'DOCX', bg: 'bg-indigo-50 text-indigo-600 border-indigo-200' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType.includes('sheet') || mimeType.includes('csv')) {
    return { icon: '📊', label: ext.toUpperCase(), bg: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
  }
  return { icon: '📃', label: ext.toUpperCase() || 'FILE', bg: 'bg-slate-50 text-slate-600 border-slate-200' };
};

export const VaultBulkUploadModal: React.FC<VaultBulkUploadModalProps> = ({
  folders,
  defaultFolderId,
  isOpen,
  onClose,
  onSuccess,
  onFolderCreated,
}) => {
  // Stages: 'select' -> 'uploading' -> 'organize'
  const [stage, setStage] = useState<'select' | 'uploading' | 'organize'>('select');
  const [filesQueue, setFilesQueue] = useState<QueuedFile[]>([]);
  const [defaultCategory, setDefaultCategory] = useState('Personal Documents');
  const [initialFolderId, setInitialFolderId] = useState<string>(defaultFolderId || '');
  const [isDragging, setIsDragging] = useState(false);
  const [storageUsage, setStorageUsage] = useState<VaultStorageUsage | null>(null);

  // Organize Stage State
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [showCreateFolderInline, setShowCreateFolderInline] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInitialFolderId(defaultFolderId || '');
      setTargetMoveFolderId(defaultFolderId || '');
      setStage('select');
      setFilesQueue([]);
      setShowCreateFolderInline(false);
      vaultService.getStorageUsage().then(setStorageUsage).catch(() => {});
    }
  }, [isOpen, defaultFolderId]);

  const addFilesToQueue = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: QueuedFile[] = [];

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds 25 MB limit and was skipped`);
        continue;
      }
      // Derive clean title from file name
      const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      validFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        title: cleanTitle || file.name,
        category: defaultCategory,
        folderId: initialFolderId,
        status: 'pending',
        selectedForMove: true,
      });
    }

    if (validFiles.length > 0) {
      setFilesQueue((prev) => [...prev, ...validFiles]);
    }
  }, [defaultCategory, initialFolderId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  }, [addFilesToQueue]);

  const removeFileFromQueue = (id: string) => {
    setFilesQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const updateFileTitle = (id: string, newTitle: string) => {
    setFilesQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const updateFileCategory = (id: string, newCat: string) => {
    setFilesQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category: newCat } : item))
    );
  };

  const applyDefaultCategoryToAll = (cat: string) => {
    setDefaultCategory(cat);
    setFilesQueue((prev) => prev.map((item) => ({ ...item, category: cat })));
  };

  // Start Bulk Upload
  const handleStartUpload = async () => {
    if (filesQueue.length === 0) {
      toast.error('Please select at least one document to upload');
      return;
    }

    setStage('uploading');

    let successCount = 0;
    const updatedQueue = [...filesQueue];

    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];
      // Set uploading status
      updatedQueue[i] = { ...item, status: 'uploading' };
      setFilesQueue([...updatedQueue]);

      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('title', item.title.trim() || item.file.name);
        formData.append('category', item.category);
        if (item.folderId) {
          formData.append('folderId', item.folderId);
        }

        const uploadedDoc = await vaultService.uploadDocument(formData);
        updatedQueue[i] = {
          ...updatedQueue[i],
          status: 'success',
          uploadedDoc,
          selectedForMove: true,
        };
        successCount++;
      } catch (err) {
        updatedQueue[i] = {
          ...updatedQueue[i],
          status: 'error',
          errorMessage: (err as Error)?.message || 'Upload failed',
          selectedForMove: false,
        };
      }
      setFilesQueue([...updatedQueue]);
    }

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}`);
      onSuccess(); // Refresh background vault data
      setStage('organize');
    } else {
      toast.error('All uploads failed. Please check file formats and storage limits.');
    }
  };

  // Organize Stage: Toggle single file selection
  const toggleFileSelectForMove = (id: string) => {
    setFilesQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selectedForMove: !item.selectedForMove } : item
      )
    );
  };

  // Organize Stage: Select / Deselect All
  const handleToggleSelectAll = () => {
    const successItems = filesQueue.filter((item) => item.status === 'success');
    const allSelected = successItems.every((item) => item.selectedForMove);
    setFilesQueue((prev) =>
      prev.map((item) =>
        item.status === 'success' ? { ...item, selectedForMove: !allSelected } : item
      )
    );
  };

  // Organize Stage: Move Selected Files to Target Folder
  const handleMoveSelectedFiles = async () => {
    const selectedItems = filesQueue.filter(
      (item) => item.status === 'success' && item.selectedForMove && item.uploadedDoc
    );

    if (selectedItems.length === 0) {
      toast.error('Please select at least one document to move');
      return;
    }

    setIsMoving(true);
    try {
      const docIds = selectedItems.map((item) => item.uploadedDoc!.id);
      const folderVal = targetMoveFolderId || null;

      await vaultService.batchMoveDocuments(docIds, folderVal);

      const targetFolderObj = folders.find((f) => f.id === targetMoveFolderId);
      const targetName = targetFolderObj ? targetFolderObj.name : 'Root Folder';

      // Update local state to reflect the new folder
      setFilesQueue((prev) =>
        prev.map((item) => {
          if (item.status === 'success' && item.selectedForMove && item.uploadedDoc) {
            return {
              ...item,
              folderId: targetMoveFolderId,
              uploadedDoc: {
                ...item.uploadedDoc,
                folderId: folderVal,
                folder: targetFolderObj || null,
              },
              selectedForMove: false, // uncheck moved documents
            };
          }
          return item;
        })
      );

      toast.success(
        `Moved ${selectedItems.length} document${selectedItems.length > 1 ? 's' : ''} to ${targetName}`
      );
      onSuccess(); // Refresh vault folders/docs
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to move documents');
    } finally {
      setIsMoving(false);
    }
  };

  // Organize Stage: Inline Create Folder
  const handleCreateFolderInline = async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    setIsCreatingFolder(true);
    try {
      const created = await vaultService.createFolder({
        name: newFolderName.trim(),
        category: defaultCategory,
      });
      toast.success(`Folder "${created.name}" created`);
      setTargetMoveFolderId(created.id);
      setNewFolderName('');
      setShowCreateFolderInline(false);
      if (onFolderCreated) onFolderCreated();
      onSuccess();
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Complete & Close
  const handleFinishAndClose = () => {
    onSuccess();
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const totalBytes = filesQueue.reduce((acc, curr) => acc + curr.file.size, 0);
  const successItems = filesQueue.filter((item) => item.status === 'success');
  const selectedToMoveCount = successItems.filter((item) => item.selectedForMove).length;
  const isAllSelected = successItems.length > 0 && successItems.every((item) => item.selectedForMove);

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
        onClick={stage === 'uploading' ? undefined : onClose}
      />

      {/* Modal Screen Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-[calc(100vw-12px)] sm:max-w-2xl h-[95dvh] sm:h-auto sm:max-h-[88vh] flex flex-col bg-white rounded-[28px] sm:rounded-[32px] shadow-2xl border border-slate-100/80 overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-white/95 backdrop-blur-md gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                stage === 'organize' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              {stage === 'organize' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Files className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                  {stage === 'select' && 'Bulk Document Upload'}
                  {stage === 'uploading' && 'Uploading Documents...'}
                  {stage === 'organize' && 'Organize Uploaded Documents'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0 uppercase tracking-wider">
                  Bulk
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                {stage === 'select' && 'Upload mixed PNG, JPG, PDF, DOCX & move to folders'}
                {stage === 'uploading' && `Processing ${filesQueue.length} files...`}
                {stage === 'organize' && 'Select documents below and move them to their respective folders'}
              </p>
            </div>
          </div>

          {stage !== 'uploading' && (
            <button
              type="button"
              onClick={stage === 'organize' ? handleFinishAndClose : onClose}
              className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {/* ================= STAGE 1: FILE SELECTION & QUEUE ================= */}
        {stage === 'select' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-w-0 overscroll-contain">
            {/* Storage Alert if > 80% */}
            {storageUsage && storagePercent >= 80 && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200/80">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-semibold text-amber-900">
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
              className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  if (e.target.files) addFilesToQueue(e.target.files);
                  e.target.value = ''; // allow re-selecting same files
                }}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                Drag & drop files here, or <span className="text-blue-600 hover:underline">browse files</span>
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Mixed files accepted: PDF, JPG, PNG, WEBP, DOCX, TXT, CSV · Max 25 MB each
              </p>
            </div>

            {/* Global Settings Toolbar */}
            {filesQueue.length > 0 && (
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Defaults for this batch
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => appendFileInputRef.current?.click()}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                    >
                      + Add More Files
                    </button>
                    <input
                      ref={appendFileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_TYPES}
                      onChange={(e) => {
                        if (e.target.files) addFilesToQueue(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setFilesQueue([])}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Default Category
                    </label>
                    <div className="relative">
                      <select
                        value={defaultCategory}
                        onChange={(e) => applyDefaultCategoryToAll(e.target.value)}
                        className="w-full h-9 px-3 pr-8 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <FolderIcon className="w-3 h-3 text-slate-400" /> Initial Folder (Optional)
                    </label>
                    <div className="relative">
                      <select
                        value={initialFolderId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInitialFolderId(val);
                          setFilesQueue((prev) => prev.map((item) => ({ ...item, folderId: val })));
                        }}
                        className="w-full h-9 px-3 pr-8 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">— Root Folder (Move after upload) —</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Files List */}
            {filesQueue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                  <span>FILES READY TO UPLOAD ({filesQueue.length})</span>
                  <span>{formatBytes(totalBytes)}</span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs max-h-60 sm:max-h-72 overflow-y-auto">
                  {filesQueue.map((item) => {
                    const typeDetails = getFileTypeDetails(item.file.name, item.file.type);
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 sm:p-3 flex items-center gap-2.5 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-base">
                          {typeDetails.icon}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => updateFileTitle(item.id, e.target.value)}
                            placeholder="Document Title"
                            className="w-full h-7 px-2 text-xs font-bold text-slate-800 bg-transparent hover:bg-slate-100/80 focus:bg-white rounded-lg border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all"
                            title="Click to rename document"
                          />
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 px-2 flex-wrap">
                            <span className="font-semibold text-slate-500">{formatBytes(item.file.size)}</span>
                            <span>•</span>
                            <span className="truncate max-w-[150px]">{item.file.name}</span>
                            <span>•</span>
                            <select
                              value={item.category}
                              onChange={(e) => updateFileCategory(item.id, e.target.value)}
                              className="text-[10px] font-semibold text-blue-600 bg-transparent hover:underline outline-none cursor-pointer"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFileFromQueue(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Remove file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STAGE 2: LIVE UPLOADING PROGRESS ================= */}
        {stage === 'uploading' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 min-w-0 flex flex-col justify-center">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 animate-pulse">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Uploading {filesQueue.length} Documents
              </h3>
              <p className="text-xs text-slate-500">
                Please wait while your documents are encrypted and saved to your vault.
              </p>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full space-y-1.5 max-w-md mx-auto">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Progress</span>
                <span>
                  {filesQueue.filter((i) => i.status === 'success' || i.status === 'error').length} of{' '}
                  {filesQueue.length} files
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (filesQueue.filter((i) => i.status === 'success' || i.status === 'error').length /
                        filesQueue.length) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Per-file Progress List */}
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white divide-y divide-slate-100 max-h-56 overflow-y-auto max-w-md mx-auto w-full shadow-2xs">
              {filesQueue.map((item) => {
                const typeDetails = getFileTypeDetails(item.file.name, item.file.type);
                return (
                  <div key={item.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm shrink-0">{typeDetails.icon}</span>
                      <span className="font-semibold text-slate-800 truncate">{item.title}</span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {item.status === 'pending' && (
                        <span className="text-[11px] text-slate-400 font-medium">Waiting...</span>
                      )}
                      {item.status === 'uploading' && (
                        <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading
                        </span>
                      )}
                      {item.status === 'success' && (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-[11px] font-bold text-rose-500 truncate max-w-[120px]">
                          {item.errorMessage || 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= STAGE 3: ORGANIZE & MOVE TO FOLDERS ================= */}
        {stage === 'organize' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-w-0 overscroll-contain">
            {/* Success Summary Banner */}
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3 sm:p-3.5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold text-emerald-950">
                  {successItems.length} Document{successItems.length > 1 ? 's' : ''} Uploaded Successfully
                </h4>
                <p className="text-xs text-emerald-800/80 mt-0.5">
                  Now choose which folder each document belongs to. You can select multiple documents and move them together.
                </p>
              </div>
            </div>

            {/* Move Action Toolbar */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {isAllSelected ? 'Deselect All' : 'Select All'} ({selectedToMoveCount} selected)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreateFolderInline(!showCreateFolderInline)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  + New Folder
                </button>
              </div>

              {/* Inline Folder Creation Form */}
              <AnimatePresence>
                {showCreateFolderInline && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden pt-1"
                  >
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-blue-200 shadow-2xs">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder name (e.g., Taxes, Medical 2026)"
                        className="flex-1 h-8 px-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFolderInline()}
                      />
                      <button
                        type="button"
                        onClick={handleCreateFolderInline}
                        disabled={isCreatingFolder || !newFolderName.trim()}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isCreatingFolder ? 'Creating...' : 'Create & Select'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Destination Folder Selector & Move Button */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 min-w-[180px]">
                  <select
                    value={targetMoveFolderId}
                    onChange={(e) => setTargetMoveFolderId(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">📁 Root Vault (No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={handleMoveSelectedFiles}
                  disabled={isMoving || selectedToMoveCount === 0}
                  className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm shadow-sm shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isMoving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Moving...</span>
                    </>
                  ) : (
                    <>
                      <span>Move Selected</span>
                      {selectedToMoveCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[11px] font-bold">
                          {selectedToMoveCount}
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Document List with Folder Badges & Selection */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                UPLOADED DOCUMENTS
              </span>

              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs max-h-60 sm:max-h-80 overflow-y-auto">
                {successItems.map((item) => {
                  const typeDetails = getFileTypeDetails(item.file.name, item.file.type);
                  const currentFolder = folders.find((f) => f.id === item.folderId);

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleFileSelectForMove(item.id)}
                      className={`p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                        item.selectedForMove ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSelectForMove(item.id);
                        }}
                        className="text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                      >
                        {item.selectedForMove ? (
                          <CheckSquare className="w-4.5 h-4.5 text-blue-600" />
                        ) : (
                          <Square className="w-4.5 h-4.5" />
                        )}
                      </button>

                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-base">
                        {typeDetails.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {item.category} · {formatBytes(item.file.size)}
                        </p>
                      </div>

                      {/* Current Folder Destination Badge */}
                      <div className="shrink-0">
                        {currentFolder ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                            <FolderIcon className="w-3 h-3 text-blue-600" />
                            <span className="max-w-[120px] truncate">{currentFolder.name}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            Root Vault
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-slate-100 bg-white/95 backdrop-blur-md flex items-center justify-between gap-3 min-w-0">
          {stage === 'select' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartUpload}
                disabled={filesQueue.length === 0}
                className="flex-1 max-w-xs h-10 px-4 rounded-xl bg-[#18181B] hover:bg-black active:bg-zinc-900 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ml-auto min-w-0 truncate"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {filesQueue.length > 0 ? `Upload ${filesQueue.length} Documents` : 'Upload Documents'}
                </span>
              </button>
            </>
          )}

          {stage === 'uploading' && (
            <div className="w-full text-center text-xs font-semibold text-slate-400">
              Uploading in progress, please do not close...
            </div>
          )}

          {stage === 'organize' && (
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-500 truncate hidden sm:inline">
                All documents have been securely uploaded to your vault.
              </span>
              <button
                type="button"
                onClick={handleFinishAndClose}
                className="w-full sm:w-auto h-10 px-5 rounded-xl bg-[#18181B] hover:bg-black active:bg-zinc-900 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ml-auto"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Done & View Vault</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
