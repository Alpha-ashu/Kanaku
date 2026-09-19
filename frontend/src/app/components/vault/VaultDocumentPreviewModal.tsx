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
  FileText,
  Tag,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultDocument } from '@/services/vaultService';

interface VaultDocumentPreviewModalProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

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
      const documentData = await vaultService.getDocument(id);
      setDoc(documentData);

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
        className="relative w-full max-w-6xl h-[94vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          border: 'var(--glass-modal-border)',
          boxShadow: 'var(--glass-modal-shadow)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <span className="text-caption uppercase font-bold">
                {doc?.originalFileName?.split('.').pop() || 'FILE'}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-section-title truncate">
                {doc?.title || 'Document Preview'}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-caption">{doc?.category}</span>
                <span className="text-caption">·</span>
                <span className="text-caption">v{doc?.currentVersion}</span>
                {doc?.isSensitive && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-caption font-bold">
                    <Lock className="w-3 h-3" /> Sensitive
                  </span>
                )}
                {doc?.isEncrypted && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-caption font-bold">
                    <ShieldCheck className="w-3 h-3" /> Encrypted
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {doc?.canDownload !== false && (
              <button
                type="button"
                onClick={handleDownload}
                className="KANAKU-btn KANAKU-btn-secondary !h-9 !px-3"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Preview + Details Split */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Main Preview Area */}
          <div className="flex-1 bg-slate-50 p-4 flex items-center justify-center overflow-auto relative">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                <p className="text-body-sm text-slate-500">Decrypting in memory...</p>
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
                  className="w-full h-full rounded-2xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="text-center p-8 max-w-sm">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h4 className="text-section-title mb-1">
                    Preview Not Available
                  </h4>
                  <p className="text-body-sm text-slate-500 mb-4">
                    This file format ({contentType}) can be downloaded to view with your native application.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="KANAKU-btn KANAKU-btn-primary"
                  >
                    <Download className="w-4 h-4" /> Download File
                  </button>
                </div>
              )
            ) : null}
          </div>

          {/* Metadata & Version History Sidebar */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-100 bg-white p-5 overflow-y-auto space-y-5">
            {/* Metadata */}
            <div>
              <h4 className="text-label mb-3">DOCUMENT INFO</h4>
              <div className="space-y-2.5">
                {doc?.institution && (
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-slate-500 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" /> Institution
                    </span>
                    <span className="text-body-sm font-semibold text-slate-900">{doc.institution}</span>
                  </div>
                )}
                {doc?.documentNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-slate-500 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-slate-400" /> Number
                    </span>
                    <span className="text-body-sm font-mono font-semibold text-slate-900">
                      {doc.documentNumber}
                    </span>
                  </div>
                )}
                {doc?.expiryDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> Expiry
                    </span>
                    <span className="text-body-sm font-semibold text-amber-600">
                      {new Date(doc.expiryDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-slate-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Size
                  </span>
                  <span className="text-body-sm font-semibold text-slate-900">
                    {formatBytes(doc?.fileSize || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Uploaded
                  </span>
                  <span className="text-body-sm font-semibold text-slate-900">
                    {doc?.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {doc?.description && (
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-label mb-1.5">NOTES</h4>
                <p className="text-body-sm text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl">
                  {doc.description}
                </p>
              </div>
            )}

            {/* Tags */}
            {doc?.tags && doc.tags.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-label mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> TAGS
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 text-caption font-semibold"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Version History */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-label">VERSION HISTORY</h4>
                {doc?.userRole !== 'viewer' && (
                  <button
                    type="button"
                    onClick={() => setShowVersionForm(!showVersionForm)}
                    className="text-body-sm text-purple-600 font-semibold hover:underline"
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
                    className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl mb-3 space-y-2 overflow-hidden"
                  >
                    <input
                      type="text"
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      placeholder="Note (e.g. Policy renewal 2026)"
                      className="KANAKU-input !h-8"
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
                      className="KANAKU-btn KANAKU-btn-primary w-full !h-8"
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
                      className={`p-2.5 rounded-xl border transition-all ${
                        ver.versionNumber === doc.currentVersion
                          ? 'border-purple-200 bg-purple-50/30'
                          : 'border-slate-100 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-card-title">Version {ver.versionNumber}</span>
                        {ver.versionNumber === doc.currentVersion && (
                          <span className="text-caption bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-caption mt-0.5 truncate">{ver.note || ver.fileName}</p>
                      <span className="text-caption">
                        {new Date(ver.createdAt).toLocaleDateString()} · {formatBytes(ver.fileSize)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-caption">Initial version active</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
