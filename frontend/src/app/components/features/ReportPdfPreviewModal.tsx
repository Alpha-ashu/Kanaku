import React, { useMemo, useEffect } from 'react';
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
import { downloadFile } from '@/lib/download';

interface ReportPdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBlob: Blob | null;
  filename: string;
  title?: string;
  periodLabel?: string;
  isLoading?: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const ReportPdfPreviewModal: React.FC<ReportPdfPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfBlob,
  filename,
  title = 'Financial Statement Report',
  periodLabel = 'All Time',
  isLoading = false,
}) => {
  const objectUrl = useMemo(() => {
    if (!pdfBlob) return null;
    return URL.createObjectURL(pdfBlob);
  }, [pdfBlob]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleDownload = async () => {
    if (!pdfBlob) return;
    try {
      await downloadFile({
        filename,
        mimeType: 'application/pdf',
        data: pdfBlob,
        preferShare: false,
        shareTitle: title,
      });
      toast.success('Report downloaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 pointer-events-auto select-none">
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
        {/* Header: File badge, Title, Period, Download & Close */}
        <div className="shrink-0 flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-slate-100 bg-white/95 backdrop-blur-md gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold text-xs tracking-wider">
              PDF
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {title}
              </h2>
              <p className="text-xs text-slate-500 font-medium truncate">
                {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!pdfBlob || isLoading}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              title="Download Report PDF"
              aria-label="Download Report PDF"
            >
              <Download className="w-4 h-4" />
            </button>
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

        {/* Non-scrollable flex column: PDF fills remaining space, info is fixed at bottom */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0">
          {/* PDF Preview Area — fills all available vertical space */}
          <div className="flex-1 min-h-0 p-2.5 sm:p-3 bg-slate-50/70 flex flex-col min-w-0">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-xs sm:text-sm font-medium text-slate-500">Generating report preview...</p>
              </div>
            ) : objectUrl ? (
              <iframe
                src={objectUrl}
                title={title}
                className="flex-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xs min-w-0 min-h-0"
                style={{ display: 'block' }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  Preview Unavailable
                </h4>
                <p className="text-xs text-slate-500 mb-4 font-medium">
                  The report could not be previewed directly in the browser.
                </p>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 hover:bg-black text-white shadow-sm transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Report
                </button>
              </div>
            )}
          </div>

          {/* Document Info — fixed height footer inside the flex column */}
          <div className="shrink-0 px-3.5 sm:px-4 py-3 bg-white border-t border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Size</span>
              </span>
              <span className="text-xs font-bold text-slate-900 font-mono">
                {pdfBlob ? formatBytes(pdfBlob.size) : '—'}
              </span>
              <span className="w-px h-3.5 bg-slate-200 shrink-0" />
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Generated</span>
              </span>
              <span className="text-xs font-bold text-slate-900 font-mono">
                {formatDate(new Date())}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
