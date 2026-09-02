import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';
import { db, type DocumentRecord, type Transaction } from '@/lib/database';
import { ScanLine, FileText, Receipt, Eye, Trash2, Plus, ImageOff, CheckCircle2, Clock, AlertCircle, Loader2, X, Layers } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';
import { calculateTaxSummary } from '@/lib/taxService';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';

type TabKey = 'all' | 'expense' | 'income' | 'transfer';

const STATUS_META: Record<DocumentRecord['processingStatus'], { label: string; icon: React.ReactNode; cls: string }> = {
  completed: { label: 'Done', icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-50 text-emerald-700' },
  preview:   { label: 'Preview', icon: <Eye size={12} />, cls: 'bg-sky-50 text-sky-700' },
  processing:{ label: 'Processing', icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-amber-50 text-amber-700' },
  queued:    { label: 'Queued', icon: <Clock size={12} />, cls: 'bg-gray-100 text-gray-600' },
  failed:    { label: 'Failed', icon: <AlertCircle size={12} />, cls: 'bg-red-50 text-red-600' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'expense',  label: 'Expense' },
  { key: 'income',   label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

function BillCard({
  doc,
  tx,
  currency,
  onView,
  onDelete,
}: {
  doc: DocumentRecord;
  tx?: Transaction;
  currency: string;
  onView: () => void;
  onDelete: () => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  React.useEffect(() => {
    if (!doc.fileData) return;
    const url = URL.createObjectURL(doc.fileData);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [doc.fileData]);

  const rawMerchant = doc.metadata?.merchantName || doc.metadata?.merchant || doc.fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const merchant = rawMerchant.length > 22 ? `${rawMerchant.slice(0, 20)}…` : rawMerchant;
  const rawAmount = tx
    ? Math.abs(Number(tx.amount))
    : Number((doc as any).extractedAmount ?? doc.metadata?.amount ?? doc.metadata?.totalAmount ?? doc.metadata?.total ?? 0);

  const type = tx?.type ?? 'expense';
  const category = tx?.category ?? doc.metadata?.category ?? 'Uncategorized';
  const dateVal = tx ? new Date(tx.date) : new Date(doc.uploadDate);
  const statusMeta = STATUS_META[doc.processingStatus];

  const amountColor = type === 'income' ? 'text-emerald-600' : type === 'expense' ? 'text-red-500' : 'text-sky-600';
  const amountPrefix = type === 'income' ? '+' : type === 'expense' ? '-' : '';

  return (
    <div
      onClick={onView}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md cursor-pointer hover:border-gray-300"
    >
      {/* Thumbnail */}
      <div className="relative h-36 w-full bg-gray-50 flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <>
            <img
              src={imgSrc}
              alt={merchant}
              onLoad={() => setImgLoaded(true)}
              className={cn('h-full w-full object-cover transition-opacity', imgLoaded ? 'opacity-100' : 'opacity-0')}
            />
            {!imgLoaded && <FileText size={40} className="text-gray-300" />}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <Receipt size={40} />
            <span className="text-xs font-medium text-gray-400">{doc.fileType?.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>
          </div>
        )}
        {/* Status badge */}
        <span className={cn('absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', statusMeta.cls)}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>
        {/* Action buttons on hover */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
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
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-sm font-bold text-gray-900" title={rawMerchant}>{merchant}</p>
        <p className="truncate text-xs text-gray-400">{category}</p>
        <div className="mt-1 flex items-center justify-between">
          {rawAmount > 0 ? (
            <span className={cn('text-sm font-bold', amountColor)}>
              {amountPrefix}{formatCurrencyAmount(rawAmount, currency)}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400 italic">Processing</span>
          )}
          <span className="text-[11px] text-gray-400">
            {dateVal.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}

function BillDetailModal({ doc, tx, currency, onClose }: { doc: DocumentRecord; tx?: Transaction; currency: string; onClose: () => void }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  React.useEffect(() => {
    const fileUrl = (doc as any).fileUrl;
    if (fileUrl) {
      setImgSrc(fileUrl);
      return;
    }
    if (!doc.fileData) return;
    try {
      const url = URL.createObjectURL(doc.fileData);
      setImgSrc(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setImgSrc(null);
    }
  }, [doc.fileData, (doc as any).fileUrl]);

  const rawName = doc.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  const merchantName = doc.metadata?.merchantName || doc.metadata?.merchant || rawName || 'Store Receipt';
  const amount = tx 
    ? Math.abs(Number(tx.amount)) 
    : Number((doc as any).extractedAmount ?? doc.metadata?.amount ?? doc.metadata?.totalAmount ?? doc.metadata?.total ?? 0);
  const category = tx?.category || doc.metadata?.category || 'Expense';
  const dateVal = tx ? new Date(tx.date) : new Date(doc.uploadDate);
  const dateStr = dateVal.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div data-testid="receipt-scanner-page-div" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div
        data-testid="receipt-scanner-page-div-2"
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-xs">
              <Receipt size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 leading-none">Receipt Details</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Scanned Document</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Bill / Receipt Visual Container */}
        <div className="relative min-h-[220px] max-h-[320px] w-full bg-slate-900/5 p-4 flex flex-col items-center justify-center border-b border-slate-100">
          {imgSrc ? (
            <img src={imgSrc} alt={merchantName} className="max-h-72 w-full object-contain rounded-2xl shadow-sm border border-slate-200/60" />
          ) : (
            /* Digital Styled Receipt Card */
            <div className="w-full bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-xs">
                    {merchantName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900 leading-tight">{merchantName}</h3>
                    <span className="text-[10px] font-bold text-slate-400">{category}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black border border-emerald-200/60">
                  Verified
                </span>
              </div>

              <div className="text-center py-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Amount</span>
                <span className="text-xl font-black text-slate-900">
                  {amount > 0 ? formatCurrencyAmount(amount, currency) : '₹0.00'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-1">
                <span>Date: {dateStr}</span>
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <CheckCircle2 size={11} /> Processed
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Clean 2x2 Info Grid (Always includes Merchant, Category, Amount, Date) */}
        <div className="p-6 space-y-4 bg-white">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Merchant</span>
              <p className="text-xs font-black text-slate-900 leading-snug break-words">{merchantName}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category</span>
              <p className="text-xs font-black text-slate-900 truncate">{category}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Amount</span>
              <p className="text-xs font-black text-emerald-600">
                {amount > 0 ? formatCurrencyAmount(amount, currency) : '₹0.00'}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Date</span>
              <p className="text-xs font-black text-slate-900 truncate">{dateStr}</p>
            </div>
          </div>

          {doc.notes && (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</span>
              <p className="text-xs font-medium text-slate-700">{doc.notes}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <Button data-testid="receipt-scanner-page-close" variant="secondary" className="w-full rounded-2xl font-bold text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}


export const ReceiptScannerPage: React.FC = () => {
  const { setCurrentPage, currency } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ doc: DocumentRecord; tx?: Transaction } | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleApplyScan = (scan: any) => {
    localStorage.setItem('pendingReceiptScan', JSON.stringify(scan));
    setScannerOpen(false);
    setCurrentPage('add-transaction');
  };

  const confirmDelete = async () => {
    if (!docToDelete?.id) return;
    setIsDeleting(true);
    try {
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
    <CenteredLayout>
      <div className="space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Bills & Receipts</h1>
            <p className="mt-0.5 text-sm text-gray-500">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''} stored</p>
          </div>
          <Button data-testid="receipt-scanner-page-scan-add-bill"
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-gray-800"
          >
            <ScanLine size={16} />
            Scan / Add Bill
          </Button>
        </div>

        {/* Detailed Tax Tracker Section */}
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50/40 p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-orange-500/10 text-orange-600 rounded-xl">
                <Layers size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Receipt Tax Tracker</h2>
                <p className="text-xs text-slate-500">Live GST, VAT, and invoice tax intelligence extracted from scanned bills</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Tax Extracted</span>
              <p className="text-xl font-black text-orange-900">{formatCurrencyAmount(taxSummary.totalTax, currency)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="rounded-xl bg-white/80 border border-orange-100 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Total Tax</span>
              <p className="text-sm sm:text-base font-black text-slate-900">{formatCurrencyAmount(taxSummary.totalTax, currency)}</p>
            </div>
            <div className="rounded-xl bg-white/80 border border-orange-100 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Week</span>
              <p className="text-sm sm:text-base font-black text-orange-700">{formatCurrencyAmount(taxSummary.weeklyTax, currency)}</p>
            </div>
            <div className="rounded-xl bg-white/80 border border-orange-100 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Month</span>
              <p className="text-sm sm:text-base font-black text-orange-900">{formatCurrencyAmount(taxSummary.monthlyTax, currency)}</p>
            </div>
          </div>

          {taxSummary.topCategories.length > 0 && (
            <div className="space-y-1.5 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Top Tax Categories</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {taxSummary.topCategories.map(([cat, amt]) => (
                  <div key={cat} className="rounded-xl bg-white/70 border border-orange-100 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700 truncate">{cat}</p>
                    <p className="text-sm font-bold text-orange-900">{formatCurrencyAmount(amt, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taxSummary.topTaxTypes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Tax Components (GST / VAT / Cess)</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {taxSummary.topTaxTypes.map(([name, amt]) => (
                  <div key={name} className="rounded-xl bg-white/70 border border-orange-100 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700 truncate">{name}</p>
                    <p className="text-sm font-bold text-orange-900">{formatCurrencyAmount(amt, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl bg-gray-100 p-1">
          {TABS.map(tab => (
            <button data-testid={`receipt-scanner-page-button-${tab.key}`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all',
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
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
              <Button data-testid="receipt-scanner-page-add-your-first-bill"
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
          onApplyScan={handleApplyScan}
        />
      )}

      {/* Detail modal */}
      {viewingDoc && (
        <BillDetailModal
          doc={viewingDoc.doc}
          tx={viewingDoc.tx}
          currency={currency}
          onClose={() => setViewingDoc(null)}
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
