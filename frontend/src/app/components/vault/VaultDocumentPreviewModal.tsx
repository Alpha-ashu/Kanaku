import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
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

/**
 * Can this device render a PDF inside an <iframe>?
 *
 * Everywhere except the Android WebView, which has no built-in PDF renderer and
 * silently shows a blank frame instead. Capacitor's iOS WebView and every
 * desktop/mobile browser handle it.
 */
export const supportsInlinePdfPreview = (): boolean => {
  try {
    return !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');
  } catch {
    return true; // not running under Capacitor — an ordinary browser
  }
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
  // Latest onClose without re-running the load effect: the parent passes a new
  // closure on every render, and reloading would re-decrypt the file each time.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !documentId) {
      if (cleanupRef.current) cleanupRef.current();
      setDoc(null);
      setPreviewUrl(null);
      return;
    }

    const loadDocumentAndPreview = async (id: string) => {
      setIsLoading(true);
      try {
        const documentData = await vaultService.getDocument(id);
        setDoc(documentData);

        const { objectUrl, contentType: cType, cleanup } = await vaultService.previewDocument(id);
        setPreviewUrl(objectUrl);
        setContentType(cType);
        cleanupRef.current = cleanup;
      } catch (err) {
        toast.error((err as Error)?.message || 'Failed to load document preview');
        onCloseRef.current();
      } finally {
        setIsLoading(false);
      }
    };

    loadDocumentAndPreview(documentId);

    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [isOpen, documentId]);

  if (!isOpen || !documentId || typeof document === 'undefined') return null;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await vaultService.downloadDocument(doc.id, doc.originalFileName);
      toast.success('Download started');
    } catch (err) {
      toast.error((err as Error)?.message || 'Download failed');
    }
  };

  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';
  // Android's WebView ships no PDF viewer, so an <iframe> pointed at a PDF
  // renders an empty white box there — the document decrypted and arrived
  // perfectly, and the user simply saw nothing, with no error to explain it.
  // iOS (WKWebView) and desktop browsers render it fine. Where it cannot be
  // shown inline, fall through to the same open/save path used for formats the
  // browser was never going to render.
  const canShowPdfInline = isPdf && supportsInlinePdfPreview();
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
        className="relative w-full max-w-[calc(100vw-12px)] sm:max-w-xl lg:max-w-2xl h-[93dvh] sm:h-[88vh] max-h-[680px] sm:max-h-[780px] flex flex-col bg-white rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-100/80 overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Streamlined Header: File badge, Title, Category, Download & Close */}
        <div className="shrink-0 flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-slate-100 bg-white/95 backdrop-blur-md gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold text-xs tracking-wider">
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
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
              ) : canShowPdfInline ? (
                <iframe
                  src={previewUrl}
                  title={doc?.title || 'PDF Preview'}
                  className="flex-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xs min-w-0 min-h-0"
                  style={{ display: 'block' }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    {isPdf ? 'Open in your PDF viewer' : 'Preview Not Supported'}
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 font-medium">
                    {isPdf
                      ? 'This device cannot display PDFs inside the app. Your document is ready — open it with your usual PDF app.'
                      : 'This file format can be downloaded to view on your device.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> {isPdf ? 'Open Document' : 'Download File'}
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
