import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ExternalLink, FileText, X } from 'lucide-react';
import type { LoadedAdvisorDocument } from '@/services/advisorApplicationService';

interface AdvisorDocumentViewerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Null when the document could not be loaded. */
  document: LoadedAdvisorDocument | null;
  onClose: () => void;
}

/**
 * In-page viewer for an advisor's KYC document, shared by the Manager and Admin
 * verification queues. The document arrives as an object URL fetched on an
 * authenticated request (there is no public link), so it is rendered here
 * rather than opened in a new window — a popup opened after the fetch is
 * blocked by Safari, and a blob URL cannot leave the native app's WebView.
 */
export const AdvisorDocumentViewer: React.FC<AdvisorDocumentViewerProps> = ({ open, title, subtitle, document, onClose }) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md bg-slate-950/75">
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col text-white max-h-[92vh]"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white truncate">{title}</h3>
                {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {document && (
                <a
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-xl text-slate-300 transition-colors"
                  title="Open in new tab"
                  data-testid="advisor-document-viewer-open-tab"
                >
                  <ExternalLink size={15} />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-slate-800/80 hover:bg-rose-500 hover:text-white border border-slate-700/60 rounded-xl text-slate-400 transition-colors"
                title="Close viewer"
                data-testid="advisor-document-viewer-close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-950 p-4 sm:p-8 flex items-center justify-center overflow-auto min-h-[380px]">
            {!document ? (
              <div className="text-center space-y-3 max-w-sm">
                <AlertTriangle size={36} className="mx-auto text-amber-400" />
                <p className="text-sm font-bold">This document could not be loaded</p>
                <p className="text-xs text-slate-400">
                  Do not approve an application whose documents you have not been able to inspect — try again, or escalate to an admin.
                </p>
              </div>
            ) : document.contentType === 'application/pdf' ? (
              <iframe
                src={document.url}
                title={title}
                className="w-full h-[70vh] rounded-2xl bg-white"
              />
            ) : document.contentType.startsWith('image/') ? (
              <img
                src={document.url}
                alt={title}
                className="max-w-full max-h-[70vh] object-contain rounded-2xl bg-white"
              />
            ) : (
              <div className="text-center space-y-3 max-w-sm">
                <AlertTriangle size={36} className="mx-auto text-amber-400" />
                <p className="text-sm font-bold">This file cannot be previewed</p>
                <p className="text-xs text-slate-400">It is not a PDF or an image. Open it in a new tab to inspect it.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
