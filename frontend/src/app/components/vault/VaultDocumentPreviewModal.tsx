import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  X,
  Download,
  Clock,
  FileText,
  Loader2,
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

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const VaultDocumentPreviewModal: React.FC<VaultDocumentPreviewModalProps> = ({
  documentId,
  isOpen,
  onClose,
}) => {
  const [doc, setDoc] = useState<VaultDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

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

  if (!isOpen || !documentId || typeof document === 'undefined') return null;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await vaultService.downloadDocument(doc.id, doc.originalFileName);
      toast.success('Download started');
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  };

  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';
  const fileExt = (doc?.originalFileName?.split('.').pop() || 'PDF').toUpperCase();

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 md:p-6 pointer-events-auto select-none">
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
        className="relative w-full max-w-[calc(100vw-24px)] sm:max-w-xl lg:max-w-2xl h-[88dvh] sm:h-[88vh] max-h-[640px] sm:max-h-[760px] flex flex-col bg-white rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-100/80 overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Streamlined Header: File badge, Title, Category, Download & Close */}
        <div className="shrink-0 flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-slate-100 bg-white/95 backdrop-blur-md gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 font-bold text-xs tracking-wider">
              {fileExt}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {doc?.title || 'Document Preview'}
              </h2>
              <p className="text-xs text-slate-500 font-medium truncate">
                {doc?.category || 'Personal Documents'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {doc?.canDownload !== false && (
              <button
                type="button"
                onClick={handleDownload}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Download Document"
                aria-label="Download Document"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
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
        </div>

        {/* Non-scrollable flex column: preview fills remaining space, info anchored to bottom */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0">
          {/* Main Preview Area — fills available vertical space */}
          <div className="flex-1 min-h-0 p-2.5 sm:p-3 bg-slate-50/70 flex flex-col min-w-0">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                <p className="text-xs sm:text-sm font-medium text-slate-500">Decrypting document...</p>
              </div>
            ) : previewUrl ? (
              isImage ? (
                <div className="flex-1 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt={doc?.title}
                    className="max-h-full max-w-full object-contain rounded-2xl shadow-sm border border-slate-200/80 bg-white"
                  />
                </div>
              ) : isPdf ? (
                <iframe
                  src={previewUrl}
                  title={doc?.title || 'PDF Preview'}
                  className="flex-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xs min-w-0 min-h-0"
                  style={{ display: 'block' }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    Preview Not Supported
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 font-medium">
                    This file format can be downloaded to view on your device.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-500/20 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download File
                  </button>
                </div>
              )
            ) : null}
          </div>

          {/* Document Info — compact single-row footer */}
          <div className="shrink-0 px-3.5 sm:px-4 py-3 bg-white border-t border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Size</span>
              </span>
              <span className="text-xs font-bold text-slate-900 font-mono">
                {formatBytes(doc?.fileSize || 0)}
              </span>
              <span className="w-px h-3.5 bg-slate-200 shrink-0" />
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Uploaded</span>
              </span>
              <span className="text-xs font-bold text-slate-900 font-mono">
                {formatDate(doc?.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
