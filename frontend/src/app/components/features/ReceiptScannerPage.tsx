import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { useTransactionCreation } from '@/hooks/useTransactionCreation';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { ReceiptScanner, type ReceiptScanPayload } from '@/app/components/transactions/ReceiptScanner';
import { db, type DocumentRecord, type Transaction } from '@/lib/database';
import {
  ScanLine,
  FileText,
  Receipt,
  Eye,
  Trash2,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Layers,
  ArrowLeft,
  Store,
  Tag,
  Calendar,
  Wallet,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Download,
  RefreshCw,
  Sparkles,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';
import { calculateTaxSummary } from '@/lib/taxService';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { backendService } from '@/lib/backend-api';
import { syncBills } from '@/services/featureSyncService';
import { EnhancedReceiptScannerService } from '@/services/enhancedReceiptScannerService';
import { cloudReceiptScanService } from '@/services/cloudReceiptScanService';
import { getActiveUserId } from '@/services/documentIntelligenceService';
import { looksGarbled } from '@/lib/ocrTextQuality';
import type { ReceiptCharge, TaxComponent, ReceiptLineItem, ReceiptScanResult } from '@/types/receipt.types';

type TabKey = 'all' | 'expense' | 'income' | 'transfer';

const STATUS_META: Record<DocumentRecord['processingStatus'], { label: string; icon: React.ReactNode; cls: string }> = {
  completed: { label: 'Done', icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  preview:   { label: 'Preview', icon: <Eye size={12} />, cls: 'bg-sky-50 text-sky-700 border border-sky-200/60' },
  processing:{ label: 'Processing', icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  queued:    { label: 'Queued', icon: <Clock size={12} />, cls: 'bg-gray-100 text-gray-600 border border-gray-200/60' },
  failed:    { label: 'Failed', icon: <AlertCircle size={12} />, cls: 'bg-red-50 text-red-600 border border-red-200/60' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'expense',  label: 'Expense' },
  { key: 'income',   label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

/**
 * Background / on-demand bill processing helper.
 * Reads image from local Blob or cloud URL and runs OCR with SERC & GST extraction.
 */
async function processBillDocument(doc: DocumentRecord): Promise<ReceiptScanResult | null> {
  let file: File | null = null;
  if (doc.fileData) {
    file = doc.fileData instanceof File
      ? doc.fileData
      : new File([doc.fileData], doc.fileName || 'receipt.jpg', { type: doc.fileType || 'image/jpeg' });
  } else {
    const url = doc.fileUrl || doc.downloadUrl || (doc.cloudId ? backendService.getBillFileUrl(doc.cloudId) : null);
    if (url) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        file = new File([blob], doc.fileName || 'receipt.jpg', { type: doc.fileType || blob.type || 'image/jpeg' });
      } catch (fetchErr) {
        console.warn('[processBillDocument] Failed to fetch remote receipt blob:', fetchErr);
      }
    }
  }

  if (!file) {
    return null;
  }

  const userId = await getActiveUserId();
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  const isPdf = file.type === 'application/pdf';

  let result: ReceiptScanResult | null = null;

  // On-device OCR first (privacy & speed)
  if (!isPdf) {
    try {
      const ocrService = new EnhancedReceiptScannerService();
      result = await ocrService.scanAndParseReceipt(file, userId);
    } catch (err) {
      console.info('[processBillDocument] Local OCR error:', err);
    }
  }

  // Cloud fallback if local gave no total and device is online
  if ((!result || !result.amount || result.amount <= 0) && isOnline) {
    try {
      result = await cloudReceiptScanService.scanReceipt(file);
    } catch (cloudErr) {
      console.info('[processBillDocument] Cloud OCR error:', cloudErr);
    }
  }

  if (!result) {
    if (doc.id) {
      await db.documents.update(doc.id, { processingStatus: 'failed', updatedAt: new Date() });
    }
    return null;
  }

  if (looksGarbled(result.merchantName)) {
    result = { ...result, merchantName: undefined };
  }

  if (doc.id) {
    await db.documents.update(doc.id, {
      processingStatus: 'completed',
      extractedAmount: result.amount || 0,
      extractedCurrency: result.currency || 'INR',
      metadata: {
        ...doc.metadata,
        // The SERVER's id for this receipt, kept so the bill can be linked to an
        // expense later. Without it a bill scanned here is local-only: the
        // expense cannot reference it, the receipt does not follow the user to
        // another device, and the server cannot tell that this bill already
        // produced an expense. The cloud path returns it; the on-device OCR path
        // does not, which is why it is conditional rather than assumed.
        ...(result.billId ? { billId: result.billId } : {}),
        merchantName: result.merchantName || doc.metadata?.merchantName || '',
        merchant: result.merchantName || doc.metadata?.merchant || '',
        amount: result.amount ? String(result.amount) : '',
        totalAmount: result.amount ? String(result.amount) : '',
        invoiceNumber: result.invoiceNumber || '',
        paymentMethod: result.paymentMethod || '',
        taxAmount: result.taxAmount?.toFixed(2) || '',
        subtotal: result.subtotal?.toFixed(2) || '',
        category: result.category || doc.metadata?.category || 'Expense',
        date: result.date ? (result.date instanceof Date ? result.date.toISOString() : String(result.date)) : '',
        taxBreakdown: result.taxBreakdown ? JSON.stringify(result.taxBreakdown) : '',
        additionalCharges: result.additionalCharges ? JSON.stringify(result.additionalCharges) : '',
        totalCharges: result.totalCharges ? String(result.totalCharges) : '',
        roundOff: result.roundOff !== undefined ? String(result.roundOff) : '',
        items: result.items ? JSON.stringify(result.items) : '',
      },
      updatedAt: new Date(),
    });
  }

  return result;
}

/** Download bill helper */
function downloadBillFile(imgSrc: string, fileName: string) {
  const link = document.createElement('a');
  link.href = imgSrc;
  link.download = fileName || 'bill-receipt.jpg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Interactive Zoom & Pan Bill Viewer
 * Provides mouse drag, wheel zoom, touch pinch-to-zoom, double-click toggle, and controls toolbar.
 */
interface ZoomableImageViewerProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  onOpenLightbox?: () => void;
  showLightboxBtn?: boolean;
}

function ZoomableImageViewer({
  src,
  alt,
  className,
  containerClassName,
  onOpenLightbox,
  showLightboxBtn = true,
}: ZoomableImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const touchDistRef = useRef<number | null>(null);

  const handleZoomIn = useCallback(() => {
    setScale(s => Math.min(5, +(s + 0.35).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(s => {
      const next = Math.max(1, +(s - 0.35).toFixed(2));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleToggleZoom = (e: React.MouseEvent) => {
    if (scale > 1) {
      handleReset();
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        setScale(2.2);
        setPosition({ x: -clickX * 0.7, y: -clickY * 0.7 });
      } else {
        setScale(2.2);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale(s => {
      const next = Math.min(5, Math.max(1, +(s + delta).toFixed(2)));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        posX: position.x,
        posY: position.y,
      };
    } else if (e.touches.length === 2) {
      touchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && scale > 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
    } else if (e.touches.length === 2 && touchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistRef.current;
      touchDistRef.current = dist;
      setScale(s => {
        const next = Math.min(5, Math.max(1, +(s * factor).toFixed(2)));
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'relative overflow-hidden flex items-center justify-center select-none bg-slate-900/5',
        scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        containerClassName
      )}
    >
      {/* Zoomable Image Element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={handleToggleZoom}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
        className={cn('max-w-full max-h-full object-contain pointer-events-auto', className)}
      />

      {/* Floating Toolbar with Controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-950/85 backdrop-blur-md text-white shadow-xl border border-white/10">
        <button
          type="button"
          data-testid="receipt-zoom-out"
          onClick={handleZoomOut}
          disabled={scale <= 1}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 active:scale-95 disabled:opacity-30 transition-all text-white cursor-pointer"
          title="Zoom out"
        >
          <ZoomOut size={13} />
        </button>

        <span className="text-2xs font-mono font-bold px-1.5 min-w-[42px] text-center text-slate-200 select-none">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          data-testid="receipt-zoom-in"
          onClick={handleZoomIn}
          disabled={scale >= 5}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 active:scale-95 disabled:opacity-30 transition-all text-white cursor-pointer"
          title="Zoom in"
        >
          <ZoomIn size={13} />
        </button>

        <div className="h-3.5 w-px bg-white/20 mx-0.5" />

        <button
          type="button"
          data-testid="receipt-zoom-reset"
          onClick={handleReset}
          disabled={scale === 1 && position.x === 0 && position.y === 0}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 active:scale-95 disabled:opacity-30 transition-all text-white cursor-pointer"
          title="Reset zoom (1:1)"
        >
          <RotateCcw size={12} />
        </button>

        {showLightboxBtn && onOpenLightbox && (
          <button
            type="button"
            data-testid="receipt-fullscreen-btn"
            onClick={onOpenLightbox}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 active:scale-95 transition-all text-white cursor-pointer ml-0.5"
            title="Open Fullscreen Lightbox"
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>

      {/* Subtle interaction tip */}
      <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-xs text-3xs text-white/90 font-medium pointer-events-none">
        {scale > 1 ? 'Drag to pan • Pinch to zoom' : 'Double click or scroll to zoom'}
      </div>
    </div>
  );
}

/** Fullscreen Lightbox Portal Modal */
function FullscreenLightboxModal({
  imgSrc,
  merchantName,
  onClose,
}: {
  imgSrc: string;
  merchantName: string;
  onClose: () => void;
}) {
  const content = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-black/40 text-white shrink-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Receipt size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate leading-tight">{merchantName}</h3>
            <p className="text-2xs text-slate-400">High-Resolution Bill Inspector</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadBillFile(imgSrc, `${merchantName.replace(/\s+/g, '_')}_bill.jpg`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
            title="Download image"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close lightbox"
          >
            <Minimize2 size={15} />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-2 sm:p-6">
        <ZoomableImageViewer
          src={imgSrc}
          alt={merchantName}
          className="max-h-[86vh] max-w-[94vw] object-contain rounded-lg shadow-2xl"
          containerClassName="w-full h-full rounded-2xl bg-transparent"
          showLightboxBtn={false}
        />
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}

function BillCard({
  doc,
  tx,
  currency,
  onView,
  onDelete,
  onProcess,
  isProcessing = false,
}: {
  doc: DocumentRecord;
  tx?: Transaction;
  currency: string;
  onView: () => void;
  onDelete: () => void;
  onProcess?: (doc: DocumentRecord) => void;
  isProcessing?: boolean;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const { fileData, downloadUrl, fileUrl, cloudId } = doc;
  React.useEffect(() => {
    if (fileData) {
      try {
        const url = URL.createObjectURL(fileData);
        setImgSrc(url);
        return () => URL.revokeObjectURL(url);
      } catch {
        setImgSrc(null);
      }
    }
    if (downloadUrl) {
      setImgSrc(downloadUrl);
      return;
    }
    if (fileUrl) {
      setImgSrc(fileUrl);
      return;
    }
    if (cloudId) {
      setImgSrc(backendService.getBillFileUrl(cloudId));
    }
  }, [fileData, downloadUrl, fileUrl, cloudId]);

  const rawMerchant = tx?.merchant || doc.metadata?.merchantName || doc.metadata?.merchant || doc.fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const merchant = rawMerchant.length > 22 ? `${rawMerchant.slice(0, 20)}…` : rawMerchant;
  const rawAmount = tx
    ? Math.abs(Number(tx.amount))
    : Number(doc.extractedAmount ?? doc.metadata?.amount ?? doc.metadata?.totalAmount ?? doc.metadata?.total ?? 0);

  const type = tx?.type ?? 'expense';
  const category = tx?.category || (doc.metadata?.category as string) || 'Uncategorized';
  const dateVal = tx ? new Date(tx.date) : (doc.metadata?.date ? new Date(doc.metadata.date) : new Date(doc.uploadDate));
  const statusMeta = STATUS_META[doc.processingStatus];

  const amountColor = type === 'income' ? 'text-emerald-600' : type === 'expense' ? 'text-red-500' : 'text-sky-600';
  const amountPrefix = type === 'income' ? '+' : type === 'expense' ? '-' : '';

  const isPending = doc.processingStatus === 'processing' || doc.processingStatus === 'queued' || (rawAmount === 0 && isProcessing);

  return (
    <div
      onClick={onView}
      className="group relative flex flex-col overflow-hidden rounded-[26px] sm:rounded-[30px] border border-slate-100 bg-white shadow-[0_8px_24px_-4px_rgba(112,144,176,0.08)] transition-all hover:shadow-md cursor-pointer hover:border-slate-200/90"
    >
      {/* Thumbnail */}
      <div className="relative h-36 sm:h-40 w-full bg-slate-50 flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <>
            <img
              src={imgSrc}
              alt={merchant}
              onLoad={() => setImgLoaded(true)}
              className={cn('h-full w-full object-cover transition-opacity duration-200', imgLoaded ? 'opacity-100' : 'opacity-0')}
            />
            {!imgLoaded && <FileText size={40} className="text-gray-300" />}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <Receipt size={38} />
            <span className="text-3xs font-bold text-gray-400 uppercase tracking-widest">{doc.fileType?.split('/')[1]?.toUpperCase() ?? 'BILL'}</span>
          </div>
        )}

        {/* Status badge */}
        <span className={cn('absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-bold shadow-2xs z-10', statusMeta.cls)}>
          {isProcessing ? <Loader2 size={11} className="animate-spin text-amber-600" /> : statusMeta.icon}
          {isProcessing ? 'Processing' : statusMeta.label}
        </span>

        {/* Quick action buttons top-right */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
          <button
            type="button"
            data-testid="receipt-scanner-page-view-receipt-btn"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm border border-slate-200/80 hover:bg-white hover:text-indigo-600 active:scale-90 transition-all cursor-pointer"
            title="Preview receipt"
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            data-testid="receipt-scanner-page-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-sm border border-slate-200/80 hover:bg-rose-50 hover:text-rose-700 active:scale-90 transition-all cursor-pointer"
            title="Delete receipt"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Desktop hover overlay */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="absolute inset-0 hidden sm:flex items-center justify-center gap-2.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 z-20 backdrop-blur-2xs"
        >
          <button
            type="button"
            data-testid="receipt-scanner-page-view-receipt"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-100 cursor-pointer transition-transform active:scale-90"
            title="View receipt preview"
          >
            <Eye size={16} />
          </button>
          {onProcess && (rawAmount === 0 || isPending) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProcess(doc);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 cursor-pointer transition-transform active:scale-90"
              title="Process receipt with AI"
            >
              <RefreshCw size={15} className={cn(isProcessing && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            data-testid="receipt-scanner-page-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 cursor-pointer transition-transform active:scale-90"
            title="Delete receipt"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1 p-3 sm:p-3.5">
        <p className="truncate text-xs sm:text-sm font-bold text-gray-900" title={rawMerchant}>{merchant}</p>
        <div className="flex items-center justify-between">
          <p className="truncate text-2xs sm:text-xs text-gray-400">{category}</p>
          <span className="text-3xs text-gray-400">
            {dateVal.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between pt-1 border-t border-slate-50">
          {rawAmount > 0 ? (
            <span className={cn('text-xs sm:text-sm font-black', amountColor)}>
              {amountPrefix}{formatCurrencyAmount(rawAmount, currency)}
            </span>
          ) : (
            <div className="flex items-center gap-1 text-amber-600">
              <Loader2 size={10} className="animate-spin" />
              <span className="text-2xs font-bold uppercase tracking-wider">Processing</span>
            </div>
          )}
          {onProcess && (rawAmount === 0 || isPending) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProcess(doc);
              }}
              disabled={isProcessing}
              className="text-3xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200/50 cursor-pointer active:scale-95"
            >
              {isProcessing ? 'Reading...' : 'Process'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Redesigned BillDetailModal:
 * - Interactive zoom & pan viewer on left (desktop split view)
 * - Full financial breakdown with SERC / Service Charge, GST/taxes, subtotal, and round off
 * - Fullscreen lightbox portal
 * - AI re-scan button
 * - Safe bottom padding for mobile
 */
function BillDetailModal({
  doc,
  tx,
  currency,
  onClose,
  onDelete,
  onProcessBill,
  onAddExpense,
  isProcessing = false,
  isAddingExpense = false,
}: {
  doc: DocumentRecord;
  tx?: Transaction;
  currency: string;
  onClose: () => void;
  onDelete?: () => void;
  onProcessBill?: (doc: DocumentRecord) => Promise<void>;
  /**
   * Books this bill as an expense.
   *
   * Deliberately an explicit action rather than something the scan does on its
   * own: this page is a document library, and people upload bills they have
   * already entered by hand. Auto-creating would double-count those, and a
   * double-counted expense is worse than one the user has to add themselves.
   */
  onAddExpense?: (doc: DocumentRecord) => Promise<void>;
  isProcessing?: boolean;
  isAddingExpense?: boolean;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const { fileData, downloadUrl, fileUrl, cloudId } = doc;
  React.useEffect(() => {
    if (fileData) {
      try {
        const url = URL.createObjectURL(fileData);
        setImgSrc(url);
        return () => URL.revokeObjectURL(url);
      } catch {
        setImgSrc(null);
      }
    }
    if (downloadUrl) {
      setImgSrc(downloadUrl);
      return;
    }
    if (fileUrl) {
      setImgSrc(fileUrl);
      return;
    }
    if (cloudId) {
      setImgSrc(backendService.getBillFileUrl(cloudId));
    }
  }, [fileData, downloadUrl, fileUrl, cloudId]);

  const rawName = doc.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  const merchantName = tx?.merchant || doc.metadata?.merchantName || doc.metadata?.merchant || rawName || 'Store Receipt';
  const amount = tx
    ? Math.abs(Number(tx.amount))
    : Number(doc.extractedAmount ?? doc.metadata?.amount ?? doc.metadata?.totalAmount ?? doc.metadata?.total ?? 0);
  const category = tx?.category || (doc.metadata?.category as string) || 'Expense';
  const dateVal = tx ? new Date(tx.date) : (doc.metadata?.date ? new Date(doc.metadata.date) : new Date(doc.uploadDate));
  const dateStr = dateVal.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // Parse structured breakdown from doc metadata
  const rawAdditionalCharges = useMemo<ReceiptCharge[]>(() => {
    try {
      if (doc.metadata?.additionalCharges) {
        const parsed = JSON.parse(doc.metadata.additionalCharges);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* ignore */ }
    return [];
  }, [doc.metadata?.additionalCharges]);

  // Deduplicate identical additional charges
  const additionalCharges = useMemo<ReceiptCharge[]>(() => {
    const seen = new Set<string>();
    const result: ReceiptCharge[] = [];
    for (const chg of rawAdditionalCharges) {
      const key = `${(chg.label || '').toLowerCase().trim()}_${chg.amount}_${chg.rate ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(chg);
      }
    }
    return result;
  }, [rawAdditionalCharges]);

  // Parse and sanitize taxBreakdown:
  // 1. Exclude service charges / serc (they belong exclusively to additionalCharges)
  // 2. Exclude any tax component that duplicates an additional charge
  // 3. Disambiguate duplicate generic "GST" entries into SGST and CGST
  const taxBreakdown = useMemo<TaxComponent[]>(() => {
    try {
      if (!doc.metadata?.taxBreakdown) return [];
      const parsed: TaxComponent[] = JSON.parse(doc.metadata.taxBreakdown);
      if (!Array.isArray(parsed)) return [];

      const isServiceCharge = (name: string) =>
        /service\s*charge|serc|\bsc\b|s\.?\s*charge/i.test(name);

      const filtered = parsed.filter((t) => {
        if (isServiceCharge(t.name)) return false;
        const matchesCharge = additionalCharges.some(
          (c) => (c.label || '').toLowerCase() === t.name.toLowerCase() && Math.abs(c.amount - t.amount) < 0.01,
        );
        return !matchesCharge;
      });

      let gstCount = 0;
      const disambiguated = filtered.map((t) => {
        const norm = t.name.trim();
        if (/^state\s*gst/i.test(norm)) return { ...t, name: 'SGST' };
        if (/^central\s*gst/i.test(norm)) return { ...t, name: 'CGST' };
        if (norm.toUpperCase() === 'GST') {
          gstCount++;
          if (gstCount === 1) return { ...t, name: 'SGST' };
          if (gstCount === 2) return { ...t, name: 'CGST' };
        }
        return t;
      });

      const seen = new Set<string>();
      return disambiguated.filter((t) => {
        const key = `${t.name.toLowerCase()}_${t.amount}_${t.rate ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch { /* ignore */ }
    return [];
  }, [doc.metadata?.taxBreakdown, additionalCharges]);

  const lineItems = useMemo<ReceiptLineItem[]>(() => {
    try {
      if (doc.metadata?.items) {
        return JSON.parse(doc.metadata.items);
      }
    } catch { /* ignore */ }
    return [];
  }, [doc.metadata?.items]);

  const subtotal = doc.metadata?.subtotal ? Number(doc.metadata.subtotal) : undefined;
  const roundOff = doc.metadata?.roundOff ? Number(doc.metadata.roundOff) : undefined;
  const totalCharges = doc.metadata?.totalCharges ? Number(doc.metadata.totalCharges) : undefined;
  const taxAmount = doc.metadata?.taxAmount ? Number(doc.metadata.taxAmount) : undefined;

  // Calculate the bill's internal arithmetic total to ensure breakdown matches
  const billExtractedTotal = Number(doc.extractedAmount ?? doc.metadata?.totalAmount ?? doc.metadata?.amount ?? doc.metadata?.total ?? 0);
  const calculatedBreakdownTotal = useMemo(() => {
    if (subtotal !== undefined && subtotal > 0) {
      const chgSum = additionalCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0) || (totalCharges || 0);
      const taxSum = taxBreakdown.reduce((s, t) => s + (Number(t.amount) || 0), 0) || (taxAmount || 0);
      const net = subtotal + chgSum + taxSum + (roundOff || 0);
      return Number(net.toFixed(2));
    }
    return undefined;
  }, [subtotal, additionalCharges, totalCharges, taxBreakdown, taxAmount, roundOff]);

  const displayAmount = (calculatedBreakdownTotal && calculatedBreakdownTotal > 0)
    ? calculatedBreakdownTotal
    : (billExtractedTotal > 0 ? billExtractedTotal : amount);

  const modalContent = (
    <div
      data-testid="receipt-scanner-page-div"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        data-testid="receipt-scanner-page-div-2"
        className="relative w-full max-w-md md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-[20px] sm:rounded-[28px] bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-xs shrink-0">
              <Receipt size={15} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate max-w-[190px] sm:max-w-md">{merchantName}</h2>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Receipt Details</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {imgSrc && (
              <button
                type="button"
                onClick={() => downloadBillFile(imgSrc, `${merchantName.replace(/\s+/g, '_')}.jpg`)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Download Bill Image"
              >
                <Download size={13} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                data-testid="receipt-scanner-page-modal-delete-header"
                onClick={() => {
                  onClose();
                  onDelete();
                }}
                className="w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Delete Receipt"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              data-testid="receipt-scanner-page-close"
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Main Area: Responsive 2-Column Split View on Desktop */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-0">
          {/* Left Column: Interactive Zoom & Pan Bill Viewer */}
          <div className="w-full md:w-1/2 lg:w-1/2 flex flex-col bg-slate-950/5 p-2 sm:p-3.5 shrink-0 h-44 sm:h-52 md:h-auto md:min-h-[360px] lg:min-h-[400px]">
            {imgSrc ? (
              <div className="flex-1 w-full h-full rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-xs flex flex-col">
                <ZoomableImageViewer
                  src={imgSrc}
                  alt={merchantName}
                  className="h-full max-h-[170px] sm:max-h-[210px] md:max-h-[360px]"
                  containerClassName="flex-1 h-full min-h-[140px] md:min-h-[320px] w-full"
                  onOpenLightbox={() => setLightboxOpen(true)}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-slate-200 text-center">
                <Receipt size={32} className="text-slate-300 mb-1.5" />
                <p className="text-xs font-bold text-slate-700">Digital Receipt Record</p>
                <p className="text-2xs text-slate-400 mt-0.5">No scanned image attached</p>
              </div>
            )}
          </div>

          {/* Right Column: Financial Intelligence & Extracted Breakdown */}
          <div className="w-full md:w-1/2 lg:w-1/2 p-3 sm:p-4 space-y-2.5 overflow-y-auto bg-white">
            {/* Total Amount Hero Card */}
            <div className="p-2.5 sm:p-3.5 rounded-xl bg-slate-900 text-white shadow-xs space-y-1">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-wider">
                <span>Total Amount Payable</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-white text-[10px] sm:text-xs font-bold">
                  {doc.processingStatus.toUpperCase()}
                </span>
              </div>
              <p className="text-base sm:text-xl md:text-2xl font-black text-white tracking-tight">
                {displayAmount > 0 ? formatCurrencyAmount(displayAmount, currency) : '₹0.00'}
              </p>
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-300 pt-0.5">
                <span className="truncate">{category}</span>
                <span className="shrink-0 flex items-center gap-1 text-emerald-400 font-bold">
                  <CheckCircle2 size={11} /> {doc.processingStatus === 'completed' ? 'Verified' : 'Processed'}
                </span>
              </div>
            </div>

            {/* If bill is unparsed or ₹0.00, show prominent AI Processing Action */}
            {(displayAmount === 0 || doc.processingStatus !== 'completed') && onProcessBill && (
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/70 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                  <Sparkles size={13} className="text-amber-600 shrink-0" />
                  <span>Unprocessed Receipt Data</span>
                </div>
                <p className="text-[10px] sm:text-xs text-amber-700 leading-relaxed">
                  This bill was saved before OCR completed. Run instant AI scanning to extract the merchant, total, service charge, and taxes.
                </p>
                <Button
                  data-testid="receipt-scanner-page-process-bill"
                  onClick={() => onProcessBill(doc)}
                  disabled={isProcessing}
                  className="w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-1.5 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Processing Bill...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> Process Bill with AI
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Financial Breakdown Card (Subtotal, SERC, Taxes, Round Off) */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs space-y-2">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 m-0">Financial Breakdown</p>

              <div className="space-y-1.5 text-xs sm:text-sm">
                {subtotal !== undefined && subtotal > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Base Subtotal (Items)</span>
                    <span className="font-semibold text-slate-800">{formatCurrencyAmount(subtotal, currency)}</span>
                  </div>
                )}

                {/* Additional Charges / SERC / Service Charge */}
                {additionalCharges.length > 0 ? (
                  additionalCharges.map((chg, idx) => (
                    <div key={idx} className="flex items-center justify-between text-indigo-700 font-medium">
                      <span className="truncate pr-2">{(chg.label || 'Service Charge')} {chg.rate ? `(@ ${chg.rate}%)` : ''}</span>
                      <span className="font-bold shrink-0">+{formatCurrencyAmount(chg.amount, currency)}</span>
                    </div>
                  ))
                ) : (totalCharges !== undefined && totalCharges > 0) ? (
                  <div className="flex items-center justify-between text-indigo-700 font-medium">
                    <span>Service Charge / SERC</span>
                    <span className="font-bold">+{formatCurrencyAmount(totalCharges, currency)}</span>
                  </div>
                ) : null}

                {/* Tax Components */}
                {taxBreakdown.length > 0 ? (
                  taxBreakdown.map((txComp, idx) => (
                    <div key={idx} className="flex items-center justify-between text-amber-700 font-medium">
                      <span className="truncate pr-2">{txComp.name} {txComp.rate ? `(@ ${txComp.rate}%)` : ''}</span>
                      <span className="font-bold shrink-0">+{formatCurrencyAmount(txComp.amount, currency)}</span>
                    </div>
                  ))
                ) : (taxAmount !== undefined && taxAmount > 0) ? (
                  <div className="flex items-center justify-between text-amber-700 font-medium">
                    <span>Tax (GST / VAT)</span>
                    <span className="font-bold">+{formatCurrencyAmount(taxAmount, currency)}</span>
                  </div>
                ) : null}

                {/* Round Off */}
                {roundOff !== undefined && roundOff !== 0 && (
                  <div className="flex items-center justify-between text-slate-500 font-mono text-[11px] sm:text-xs">
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? `+${formatCurrencyAmount(roundOff, currency)}` : `-${formatCurrencyAmount(Math.abs(roundOff), currency)}`}</span>
                  </div>
                )}

                {/* Final Net Amount */}
                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-900">
                  <span>Net Total</span>
                  <span className="text-indigo-600 font-black">{formatCurrencyAmount(displayAmount, currency)}</span>
                </div>
              </div>
            </div>

            {/* Line Items Table if Extracted */}
            {lineItems.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 m-0">Line Items ({lineItems.length})</p>
                  <FileCheck size={12} className="text-slate-400" />
                </div>
                <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {lineItems.map((item, i) => (
                    <div key={i} className="py-1 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 truncate text-xs sm:text-sm">{item.name}</p>
                        {item.quantity && item.quantity > 1 && (
                          <span className="text-[10px] sm:text-xs text-slate-400">Qty: {item.quantity}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 shrink-0 text-xs sm:text-sm">
                        {formatCurrencyAmount(item.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2x2 Metadata Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                  <Store size={10} className="text-indigo-500" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Merchant</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{merchantName}</p>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                  <Tag size={10} className="text-purple-500" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Category</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{category}</p>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                  <Calendar size={10} className="text-blue-500" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Date</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{dateStr}</p>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                  <Wallet size={10} className="text-emerald-500" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Invoice #</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{doc.metadata?.invoiceNumber || '—'}</p>
              </div>
            </div>

            {doc.notes && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Notes</span>
                <p className="text-xs sm:text-sm text-slate-700">{doc.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 p-2.5 sm:p-3 bg-slate-50/70 flex items-center gap-2 shrink-0">
          {onProcessBill && (
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              className="rounded-lg font-bold text-xs py-2 flex items-center justify-center gap-1.5 border-slate-200 cursor-pointer"
              onClick={() => onProcessBill(doc)}
            >
              <RefreshCw size={12} className={cn(isProcessing && 'animate-spin')} />
              <span className="hidden sm:inline">Re-Scan</span>
            </Button>
          )}

          {/* Book this bill as an expense.
              Three states, because "nothing happens when I tap it" is the
              complaint this whole feature exists to answer:
                - already booked  -> shows so, and cannot be tapped again
                - no usable total -> disabled with the reason
                - otherwise       -> the action
              The server is the real guard (one expense per bill, keyed on
              ExpenseBill.transactionId); this only keeps the UI honest. */}
          {onAddExpense && (
            tx ? (
              <span
                className="rounded-lg font-bold text-xs py-2 px-3 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100"
                title="This bill is already recorded in your expenses"
              >
                <CheckCircle2 size={12} />
                <span className="hidden sm:inline">In expenses</span>
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={isAddingExpense || displayAmount <= 0}
                title={displayAmount <= 0
                  ? 'No total was read from this bill — re-scan or edit it first'
                  : 'Add this bill to your expense tracker'}
                className="rounded-lg font-bold text-xs py-2 flex items-center justify-center gap-1.5 border-slate-200 cursor-pointer disabled:cursor-not-allowed"
                onClick={() => onAddExpense(doc)}
              >
                {isAddingExpense
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Plus size={12} />}
                <span className="hidden sm:inline">Add as expense</span>
              </Button>
            )
          )}

          {onDelete && (
            <Button
              data-testid="receipt-scanner-page-modal-delete"
              variant="destructive"
              className="flex-1 rounded-lg font-bold text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 border border-rose-100 flex items-center justify-center gap-1.5 py-2 cursor-pointer"
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              <Trash2 size={13} /> Delete
            </Button>
          )}

          <Button
            variant="secondary"
            className="flex-1 rounded-lg font-bold text-xs py-2 cursor-pointer"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>

      {/* Fullscreen Lightbox */}
      {lightboxOpen && imgSrc && (
        <FullscreenLightboxModal
          imgSrc={imgSrc}
          merchantName={merchantName}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

export const ReceiptScannerPage: React.FC = () => {
  const { setCurrentPage, currency, accounts } = useApp();
  const { createTransaction } = useTransactionCreation();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ doc: DocumentRecord; tx?: Transaction } | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [processingDocIds, setProcessingDocIds] = useState<Set<number>>(new Set());

  // Auto-recovery hook for interrupted or stuck bill scans
  useEffect(() => {
    void syncBills();

    const autoRecoverBills = async () => {
      try {
        const pending = await db.documents
          .filter(d =>
            d.documentType === 'receipt' &&
            !d.deletedAt &&
            (d.processingStatus === 'processing' || d.processingStatus === 'queued' || (d.processingStatus === 'completed' && (!d.extractedAmount || d.extractedAmount === 0))) &&
            Boolean(d.fileData || d.fileUrl || d.downloadUrl || d.cloudId)
          )
          .toArray();

        if (pending.length > 0) {
          console.info(`[ReceiptScannerPage] Resuming ${pending.length} pending bill scan(s)...`);
          for (const doc of pending) {
            if (!doc.id) continue;
            setProcessingDocIds(prev => new Set(prev).add(doc.id!));
            try {
              await processBillDocument(doc);
            } catch (err) {
              console.warn('[ReceiptScannerPage] Auto recovery failed for doc', doc.id, err);
            } finally {
              setProcessingDocIds(prev => {
                const next = new Set(prev);
                next.delete(doc.id!);
                return next;
              });
            }
          }
        }
      } catch (err) {
        console.warn('[ReceiptScannerPage] Auto recovery scan error:', err);
      }
    };

    void autoRecoverBills();
  }, []);

  const receipts = useLiveQuery(
    () => db.documents.where('documentType').equals('receipt').reverse().sortBy('uploadDate'),
    []
  ) ?? [];

  const transactions = useLiveQuery(
    () => db.transactions.filter(t => !t.deletedAt).toArray(),
    []
  ) ?? [];

  const txById = useMemo(() => {
    const map = new Map<number, Transaction>();
    for (const t of transactions) if (t.id) map.set(t.id, t);
    return map;
  }, [transactions]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return receipts;
    return receipts.filter(doc => {
      if (!doc.linkedTransactionId) return activeTab === 'expense';
      const tx = txById.get(doc.linkedTransactionId);
      return tx?.type === activeTab;
    });
  }, [receipts, activeTab, txById]);

  const handleApplyScan = (scan: ReceiptScanPayload) => {
    localStorage.setItem('pendingReceiptScan', JSON.stringify(scan));
    setScannerOpen(false);
    setCurrentPage('add-transaction');
  };

  /**
   * Books a scanned bill as an expense.
   *
   * Routed through the SAME createFromReceipt the Transactions scanner uses, so
   * a receipt becomes an expense by exactly one code path. A second parallel
   * path here would drift — different category defaults, a different duplicate
   * story, a different idempotency key — and produce the disconnected records
   * this feature is supposed to stop.
   *
   * Duplicate safety comes from three places, and none of them is this button:
   *   - `attachment: bill:<id>` carried by createFromReceipt, which the server
   *     matches against ExpenseBill.transactionId (one expense per bill),
   *   - dedupHash for a same-amount/same-day/same-description repeat,
   *   - the local guard below so a double-tap cannot fire two requests.
   */
  const [addingExpenseDocIds, setAddingExpenseDocIds] = useState<Set<number>>(new Set());

  const handleAddAsExpense = async (doc: DocumentRecord) => {
    if (!doc.id || addingExpenseDocIds.has(doc.id)) return;

    const amount = Number(
      doc.extractedAmount ?? doc.metadata?.totalAmount ?? doc.metadata?.amount ?? doc.metadata?.total ?? 0,
    );
    if (!(amount > 0)) {
      toast.error('No total was read from this bill — re-scan or edit it first');
      return;
    }

    // An account is required and the page has no picker, so fall back to the
    // user's first active account rather than failing. Telling them WHICH
    // account it landed in matters: silently choosing one is how a user ends up
    // with an expense against a card they never use.
    const account = accounts.find((a) => !a.deletedAt && a.isActive !== false);
    if (!account?.id) {
      toast.error('Add a bank account or wallet first, then add this bill as an expense');
      return;
    }

    setAddingExpenseDocIds((prev) => new Set(prev).add(doc.id!));
    try {
      await createTransaction(
        {
          amount,
          currency: doc.extractedCurrency || currency,
          merchantName: doc.metadata?.merchantName || doc.metadata?.merchant || undefined,
          category: doc.metadata?.category || 'Shopping',
          subcategory: doc.metadata?.subcategory || undefined,
          date: doc.metadata?.date ? new Date(doc.metadata.date) : (doc.uploadDate ?? new Date()),
          // Links the expense to the SERVER-side bill, which is what makes it
          // visible with its receipt on another device — and what lets the
          // server refuse a second expense for the same receipt.
          billId: doc.metadata?.billId || undefined,
          taxAmount: doc.metadata?.taxAmount ? Number(doc.metadata.taxAmount) : undefined,
          subtotal: doc.metadata?.subtotal ? Number(doc.metadata.subtotal) : undefined,
          invoiceNumber: doc.metadata?.invoiceNumber || undefined,
          paymentMethod: doc.metadata?.paymentMethod || undefined,
        } as ReceiptScanResult,
        account.id,
        doc.id,
        () => {
          toast.success(`Added to ${account.name}`);
          setViewingDoc(null);
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add this bill as an expense');
    } finally {
      setAddingExpenseDocIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id!);
        return next;
      });
    }
  };

  const handleManualProcess = async (doc: DocumentRecord) => {
    if (!doc.id) return;
    setProcessingDocIds(prev => new Set(prev).add(doc.id!));
    toast.info('Analyzing bill with AI OCR...');
    try {
      const result = await processBillDocument(doc);
      if (result && result.amount && result.amount > 0) {
        toast.success(`Extracted: ${result.currency || 'INR'} ${result.amount.toFixed(2)} (${result.merchantName || 'Bill'})`);
        // If the modal was viewing this doc, update it
        const updated = await db.documents.get(doc.id);
        if (updated && viewingDoc?.doc.id === doc.id) {
          setViewingDoc({ doc: updated, tx: viewingDoc.tx });
        }
      } else {
        toast.warning('Could not detect total amount automatically. You can edit it manually.');
      }
    } catch (err) {
      console.error('Manual bill process error:', err);
      toast.error('Failed to process bill. Please try again.');
    } finally {
      setProcessingDocIds(prev => {
        const next = new Set(prev);
        next.delete(doc.id!);
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    if (!docToDelete?.id) return;
    setIsDeleting(true);
    try {
      if (docToDelete.cloudId) {
        try {
          await backendService.deleteExpenseBill(docToDelete.cloudId);
        } catch (apiErr) {
          console.warn('[ReceiptScannerPage] Cloud bill delete error:', apiErr);
        }
      }
      await db.documents.delete(docToDelete.id);
      toast.success('Receipt deleted');
      setDocToDelete(null);
    } catch (err) {
      console.error('Failed to delete receipt:', err);
      toast.error('Failed to delete receipt');
    } finally {
      setIsDeleting(false);
    }
  };

  const taxSummary = useMemo(() => {
    return calculateTaxSummary(transactions, receipts);
  }, [transactions, receipts]);

  const counts: Record<TabKey, number> = useMemo(() => ({
    all: receipts.length,
    expense: receipts.filter(d => {
      const tx = d.linkedTransactionId ? txById.get(d.linkedTransactionId) : undefined;
      return (tx?.type ?? 'expense') === 'expense';
    }).length,
    income: receipts.filter(d => {
      const tx = d.linkedTransactionId ? txById.get(d.linkedTransactionId) : undefined;
      return tx?.type === 'income';
    }).length,
    transfer: receipts.filter(d => {
      const tx = d.linkedTransactionId ? txById.get(d.linkedTransactionId) : undefined;
      return tx?.type === 'transfer';
    }).length,
  }), [receipts, txById]);

  return (
    <CenteredLayout onRefresh={async () => { await syncBills(); }}>
      {/* Generous bottom padding pb-36 sm:pb-28 so the bottom navigation dock never overlaps bills */}
      <div className="space-y-6 pb-36 sm:pb-28">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go to dashboard"
              title="Go to dashboard"
              data-testid="receipt-scanner-page-go-back-button"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Bills & Receipts</h1>
          </div>
          <Button
            data-testid="receipt-scanner-page-scan-add-bill"
            onClick={() => setScannerOpen(true)}
            className="shadow-xs bg-[#18181B] hover:bg-black text-white h-9 sm:h-10 px-4 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <ScanLine size={16} />
            <span>Scan / Add Bill</span>
          </Button>
        </div>

        {/* Detailed Tax Tracker Section */}
        <div className="rounded-2xl border border-orange-100/80 bg-gradient-to-br from-orange-50/80 via-amber-50/60 to-orange-50/30 p-3.5 sm:p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-500/10 text-orange-600 rounded-lg shrink-0">
                <Layers size={18} />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">Receipt Tax Tracker</h2>
                <p className="text-2xs text-slate-500">Live GST, VAT, and invoice tax intelligence extracted from scanned bills</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block">Total Tax Extracted</span>
              <p className="text-base sm:text-lg font-black text-orange-900">{formatCurrencyAmount(taxSummary.totalTax, currency)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-white/80 border border-orange-100 p-2 sm:p-2.5">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Total Tax</span>
              <p className="text-xs sm:text-sm font-black text-slate-900">{formatCurrencyAmount(taxSummary.totalTax, currency)}</p>
            </div>
            <div className="rounded-lg bg-white/80 border border-orange-100 p-2 sm:p-2.5">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Week</span>
              <p className="text-xs sm:text-sm font-black text-orange-700">{formatCurrencyAmount(taxSummary.weeklyTax, currency)}</p>
            </div>
            <div className="rounded-lg bg-white/80 border border-orange-100 p-2 sm:p-2.5">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Month</span>
              <p className="text-xs sm:text-sm font-black text-orange-900">{formatCurrencyAmount(taxSummary.monthlyTax, currency)}</p>
            </div>
          </div>

          {taxSummary.topCategories.length > 0 && (
            <div className="space-y-1 mb-2.5">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 px-0.5">Top Tax Categories</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {taxSummary.topCategories.map(([cat, amt]) => (
                  <div key={cat} className="rounded-lg bg-white/70 border border-orange-100 px-2.5 py-1.5">
                    <p className="text-2xs font-semibold text-slate-700 truncate">{cat}</p>
                    <p className="text-xs font-bold text-orange-900">{formatCurrencyAmount(amt, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taxSummary.topTaxTypes.length > 0 && (
            <div className="space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 px-0.5">Tax Components (GST / VAT / Cess)</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {taxSummary.topTaxTypes.map(([name, amt]) => (
                  <div key={name} className="rounded-lg bg-white/70 border border-orange-100 px-2.5 py-1.5">
                    <p className="text-2xs font-semibold text-slate-700 truncate">{name}</p>
                    <p className="text-xs font-bold text-orange-900">{formatCurrencyAmount(amt, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-full bg-white/95 backdrop-blur-xl border border-slate-200/80 p-1 shadow-xs max-w-full overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              data-testid={`receipt-scanner-page-button-${tab.key}`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 sm:py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer',
                activeTab === tab.key
                  ? 'bg-[#18181B] text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
              )}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-2xs font-bold',
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                )}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Receipt size={32} className="text-gray-400" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-700">No receipts yet</p>
              <p className="mt-1 text-sm text-gray-400">
                {activeTab === 'all'
                  ? 'Scan or upload your first bill to track it here.'
                  : `No ${activeTab} receipts found.`}
              </p>
            </div>
            {activeTab === 'all' && (
              <Button
                data-testid="receipt-scanner-page-add-your-first-bill"
                onClick={() => setScannerOpen(true)}
                className="mt-2 flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white"
              >
                <Plus size={16} />
                Add your first bill
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map(doc => (
              <BillCard
                key={doc.id}
                doc={doc}
                tx={doc.linkedTransactionId ? txById.get(doc.linkedTransactionId) : undefined}
                currency={currency}
                onView={() => setViewingDoc({ doc, tx: doc.linkedTransactionId ? txById.get(doc.linkedTransactionId) : undefined })}
                onDelete={() => setDocToDelete(doc)}
                onProcess={handleManualProcess}
                isProcessing={Boolean(doc.id && processingDocIds.has(doc.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scanner modal */}
      {scannerOpen && (
        <ReceiptScanner
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          initialMode="scan"
          onTransactionCreated={() => setScannerOpen(false)}
        />
      )}

      {/* Detail modal */}
      {viewingDoc && (
        <BillDetailModal
          doc={viewingDoc.doc}
          tx={viewingDoc.tx}
          currency={currency}
          onClose={() => setViewingDoc(null)}
          onDelete={() => setDocToDelete(viewingDoc.doc)}
          onProcessBill={handleManualProcess}
          onAddExpense={handleAddAsExpense}
          isProcessing={Boolean(viewingDoc.doc.id && processingDocIds.has(viewingDoc.doc.id))}
          isAddingExpense={Boolean(viewingDoc.doc.id && addingExpenseDocIds.has(viewingDoc.doc.id))}
        />
      )}

      {/* Delete confirmation modal */}
      <DeleteConfirmModal
        isOpen={!!docToDelete}
        title="Delete Receipt"
        message="Are you sure you want to delete this bill/receipt? This action cannot be undone."
        itemName={docToDelete?.metadata?.merchantName || docToDelete?.fileName}
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDocToDelete(null)}
      />
    </CenteredLayout>
  );
};

export default ReceiptScannerPage;
