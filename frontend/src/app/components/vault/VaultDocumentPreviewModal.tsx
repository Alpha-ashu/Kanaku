import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Upload,
  Calendar,
  Building2,
  Hash,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ExternalLink,
  Tag,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultDocument } from '@/services/vaultService';

interface VaultDocumentPreviewModalProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

export const VaultDocumentPreviewModal: React.FC<VaultDocumentPreviewModalProps> = ({
  documentId,
  isOpen,
  onClose,
  onDocumentUpdated,
}) => {
  const [doc, setDoc] = useState<VaultDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [showVersionForm, setShowVersionForm] = useState(false);

  const newVersionInputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen || !documentId) {
      if (cleanupRef.current) cleanupRef.current();
      setDoc(null);
      setPreviewUrl(null);
      return;
    }

    loadDocumentAndPreview(documentId);

    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [isOpen, documentId]);

  const loadDocumentAndPreview = async (id: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch metadata
      const documentData = await vaultService.getDocument(id);
      setDoc(documentData);

      // 2. Fetch decrypted blob
      const { objectUrl, contentType: cType, cleanup } = await vaultService.previewDocument(id);
      setPreviewUrl(objectUrl);
      setContentType(cType);
      cleanupRef.current = cleanup;
    } catch (err: any) {
      toast.error(err.message || 'Failed to load document preview');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !documentId) return null;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await vaultService.downloadDocument(doc.id, doc.originalFileName);
      toast.success('Download started');
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  };

  const handleNewVersionSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !doc) return;
    const file = e.target.files[0];

    setIsUploadingVersion(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (versionNote.trim()) formData.append('note', versionNote.trim());

      const updated = await vaultService.uploadNewVersion(doc.id, formData);
      toast.success(`Version ${updated.currentVersion} uploaded successfully`);
      setShowVersionForm(false);
      setVersionNote('');
      loadDocumentAndPreview(doc.id);
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload new version');
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-6xl h-[94vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0 font-bold text-xs uppercase">
              {doc?.originalFileName?.split('.').pop() || 'FILE'}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {doc?.title || 'Document Preview'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{doc?.category}</span>
                <span>•</span>
                <span>Version {doc?.currentVersion}</span>
                {doc?.isSensitive && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                    <ShieldCheck className="w-3 h-3" /> Sensitive
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {doc?.canDownload !== false && (
              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Preview + Details Split */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Main Preview Area */}
          <div className="flex-1 bg-slate-100 dark:bg-slate-950/60 p-4 flex items-center justify-center overflow-auto relative">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-medium">Decrypting in memory...</p>
              </div>
            ) : previewUrl ? (
              isImage ? (
                <img
                  src={previewUrl}
                  alt={doc?.title}
                  className="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-white/20"
                />
              ) : isPdf ? (
                <iframe
                  src={previewUrl}
                  title={doc?.title}
                  className="w-full h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <div className="text-center p-8 max-w-sm">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    Preview Not Available Directly
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    This file format ({contentType}) can be downloaded securely to view with your native application.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download Encrypted File
                  </button>
                </div>
              )
            ) : null}
          </div>

          {/* Metadata & Version History Sidebar */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 overflow-y-auto space-y-5">
            {/* Metadata Card */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Document Info</h4>
              <div className="space-y-2.5 text-xs">
                {doc?.institution && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" /> Institution
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{doc.institution}</span>
                  </div>
                )}
                {doc?.documentNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-slate-400" /> Number
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {doc.documentNumber}
                    </span>
                  </div>
                )}
                {doc?.expiryDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> Expiry
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {new Date(doc.expiryDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Size
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {((doc?.fileSize || 0) / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Uploaded
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {doc?.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {doc?.description && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Notes</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                  {doc.description}
                </p>
              </div>
            )}

            {/* Tags */}
            {doc?.tags && doc.tags.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tags
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Versioning Section */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Version History</h4>
                {doc?.userRole !== 'viewer' && (
                  <button
                    type="button"
                    onClick={() => setShowVersionForm(!showVersionForm)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    + New Version
                  </button>
                )}
              </div>

              {/* Upload New Version Form */}
              <AnimatePresence>
                {showVersionForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/30 rounded-xl mb-3 space-y-2 overflow-hidden"
                  >
                    <input
                      type="text"
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      placeholder="Note (e.g. Policy renewal 2026)"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      ref={newVersionInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleNewVersionSelect}
                    />
                    <button
                      type="button"
                      disabled={isUploadingVersion}
                      onClick={() => newVersionInputRef.current?.click()}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isUploadingVersion ? (
                        <span>Uploading...</span>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" /> Select File for v{(doc?.currentVersion || 1) + 1}
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Versions List */}
              <div className="space-y-2">
                {doc?.versions && doc.versions.length > 0 ? (
                  doc.versions.map((ver) => (
                    <div
                      key={ver.id}
                      className={`p-2.5 rounded-xl border text-xs transition-all ${
                        ver.versionNumber === doc.currentVersion
                          ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-white">
                        <span>Version {ver.versionNumber}</span>
                        {ver.versionNumber === doc.currentVersion && (
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ver.note || ver.fileName}</p>
                      <span className="text-[10px] text-slate-400">
                        {new Date(ver.createdAt).toLocaleDateString()} • {(ver.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Initial version active</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
