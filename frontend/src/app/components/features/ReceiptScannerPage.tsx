import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';
import { db, type DocumentRecord, type Transaction } from '@/lib/database';
import { ScanLine, FileText, Receipt, Eye, Trash2, Plus, ImageOff, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';

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

  const merchant = doc.metadata?.merchantName || doc.metadata?.merchant || doc.fileName.replace(/\.[^.]+$/, '');
  const amount = tx ? Math.abs(Number(tx.amount)) : Number(doc.metadata?.amount ?? 0);
  const type = tx?.type ?? 'expense';
  const category = tx?.category ?? doc.metadata?.category ?? 'Uncategorized';
  const dateVal = tx ? new Date(tx.date) : new Date(doc.uploadDate);
  const statusMeta = STATUS_META[doc.processingStatus];

  const amountColor = type === 'income' ? 'text-emerald-600' : type === 'expense' ? 'text-red-500' : 'text-sky-600';
  const amountPrefix = type === 'income' ? '+' : type === 'expense' ? '-' : '';

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
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
            <span className="text-xs font-medium text-gray-400">{doc.fileType.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>
          </div>
        )}
        {/* Status badge */}
        <span className={cn('absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', statusMeta.cls)}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>
        {/* Action buttons on hover */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onView}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow hover:bg-white"
            title="View receipt"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDelete}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 shadow hover:bg-red-100"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-sm font-bold text-gray-900">{merchant}</p>
        <p className="truncate text-xs text-gray-400">{category}</p>
        <div className="mt-1 flex items-center justify-between">
          {amount > 0 ? (
            <span className={cn('text-sm font-bold', amountColor)}>
              {amountPrefix}{formatCurrencyAmount(amount, currency)}
            </span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
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
    if (!doc.fileData) return;
    const url = URL.createObjectURL(doc.fileData);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [doc.fileData]);

  const merchant = doc.metadata?.merchantName || doc.metadata?.merchant || doc.fileName;
  const rows: { label: string; value: string }[] = [
    { label: 'File', value: doc.fileName },
    { label: 'Type', value: doc.fileType },
    { label: 'Size', value: `${(doc.fileSize / 1024).toFixed(1)} KB` },
    { label: 'Uploaded', value: new Date(doc.uploadDate).toLocaleString('en-IN') },
    ...(tx ? [
      { label: 'Amount', value: formatCurrencyAmount(Math.abs(Number(tx.amount)), currency) },
      { label: 'Category', value: tx.category },
      { label: 'Date', value: new Date(tx.date).toLocaleDateString('en-IN') },
      { label: 'Description', value: tx.description || '—' },
    ] : []),
    ...(doc.notes ? [{ label: 'Notes', value: doc.notes }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative h-64 w-full bg-gray-100 flex items-center justify-center overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt={merchant} className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-300">
              <ImageOff size={48} />
              <span className="text-sm text-gray-400">No preview available</span>
            </div>
          )}
        </div>
        {/* Info */}
        <div className="p-5">
          <h2 className="mb-3 text-lg font-bold text-gray-900 truncate">{merchant}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.map(r => (
              <React.Fragment key={r.label}>
                <dt className="font-medium text-gray-400">{r.label}</dt>
                <dd className="truncate text-gray-800">{r.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <Button variant="secondary" className="w-full" onClick={onClose}>Close</Button>
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

  const handleDelete = async (doc: DocumentRecord) => {
    if (!doc.id) return;
    try {
      await db.documents.delete(doc.id);
      toast.success('Receipt deleted');
    } catch {
      toast.error('Failed to delete receipt');
    }
  };

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
          <Button
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-gray-800"
          >
            <ScanLine size={16} />
            Scan / Add Bill
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl bg-gray-100 p-1">
          {TABS.map(tab => (
            <button
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
              <Button
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
                onDelete={() => handleDelete(doc)}
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
    </CenteredLayout>
  );
};

export default ReceiptScannerPage;
