import React, { useState, useEffect } from 'react';
import { backendService } from '@/lib/backend-api';
import { db } from '@/lib/database';
import { Upload, Trash2, Download, FileText, Image } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFile } from '@/lib/download';

interface BillUploadProps {
 transactionId: number;
 onBillsChange?: (bills: ExpenseBillItem[]) => void;
}

interface ExpenseBillItem {
 id: string;
 transactionId?: string;
 fileName: string;
 fileType: string;
 fileSize: number;
 uploadedAt: string;
 downloadUrl?: string | null;
}

export const BillUpload: React.FC<BillUploadProps> = ({ transactionId, onBillsChange }) => {
 const [isDragging, setIsDragging] = useState(false);
 const [uploading, setUploading] = useState(false);

  // Replace with backendService call for bills
  const [bills, setBills] = useState<ExpenseBillItem[]>([]);
  useEffect(() => {
    let isMounted = true;
    const fetchBills = async () => {
      try {
        const tx = await db.transactions.get(transactionId);
        const queryId = tx?.cloudId || (tx?.attachment?.startsWith('bill:') ? undefined : String(transactionId));
        const backendBills = await backendService.getExpenseBills(queryId);
        if (isMounted) {
          setBills(backendBills || []);
        }
      } catch {
        if (isMounted) setBills([]);
      }
    };
    fetchBills();
    return () => {
      isMounted = false;
    };
  }, [transactionId]);

  useEffect(() => {
    if (onBillsChange) {
      onBillsChange(bills);
    }
  }, [bills, onBillsChange]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const tx = await db.transactions.get(transactionId);
      const targetTransactionId = tx?.cloudId || undefined;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file type
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
        ];
        if (!allowedTypes.includes(file.type)) {
          toast.error(`${file.name} - Unsupported file type. Use JPG, PNG, WebP, PDF, DOC/DOCX, XLS/XLSX, or CSV.`);
          continue;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} - File size exceeds 10MB`);
          continue;
        }

        const uploaded = await backendService.uploadExpenseBill({ transactionId: targetTransactionId, file });

        if (uploaded?.id) {
          await db.transactions.update(transactionId, {
            attachment: `bill:${uploaded.id}`,
            updatedAt: new Date(),
          });
        }

        toast.success(`${file.name} uploaded`);
      }

      // Refresh bills after upload
      const refreshedTx = await db.transactions.get(transactionId);
      const queryId = refreshedTx?.cloudId || (refreshedTx?.attachment?.startsWith('bill:') ? undefined : String(transactionId));
      const backendBills = await backendService.getExpenseBills(queryId);
      setBills(backendBills || []);
    } catch (error) {
      console.error('Failed to upload bill:', error);
      toast.error('Failed to upload bill');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBill = async (billId: string) => {
    try {
      await backendService.deleteExpenseBill(billId);
      toast.success('Bill deleted');

      await db.transactions.update(transactionId, {
        attachment: undefined,
        updatedAt: new Date(),
      });

      // Refresh bills after delete
      const tx = await db.transactions.get(transactionId);
      const queryId = tx?.cloudId || String(transactionId);
      const backendBills = await backendService.getExpenseBills(queryId);
      setBills(backendBills || []);
    } catch (error) {
      console.error('Failed to delete bill:', error);
      toast.error('Failed to delete bill');
    }
  };

  const handleDownloadBill = async (bill: ExpenseBillItem) => {
    try {
      const downloadUrl = bill.downloadUrl || backendService.getBillFileUrl(bill.id);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      await downloadFile({
        filename: bill.fileName,
        mimeType: bill.fileType,
        data: blob,
      });
    } catch (error) {
      console.error('Failed to download bill:', error);
      toast.error('Failed to download bill');
    }
  };

 const getFileIcon = (fileType: string) => {
 if (fileType.startsWith('image')) {
 return <Image size={20} className="text-blue-600" />;
 }
 return <FileText size={20} className="text-red-600" />;
 };

 const formatFileSize = (bytes: number) => {
 if (bytes === 0) return '0 Bytes';
 const k = 1024;
 const sizes = ['Bytes', 'KB', 'MB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
 };

  return (
  <div className="space-y-4">
  {/* Upload Area */}
  <div
  onDragEnter={() => setIsDragging(true)}
  onDragLeave={() => setIsDragging(false)}
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => {
  e.preventDefault();
  setIsDragging(false);
  handleFileSelect(e.dataTransfer.files);
  }}
  className={`border-2 border-dashed rounded-[24px] sm:rounded-[28px] p-6 text-center transition-all ${
  isDragging
  ? 'border-purple-500 bg-purple-50/50'
  : 'border-slate-200/80 bg-white hover:border-slate-300'
  }`}
  >
  <Upload
  size={32}
  className={`mx-auto mb-2 ${isDragging ? 'text-purple-600' : 'text-slate-400'}`}
  />
  <p className="font-bold text-slate-900 mb-1 text-sm">
  Drag and drop your bills/receipts here
  </p>
  <p className="text-xs text-slate-400 mb-4">
  or click to browse (JPG, PNG, WebP, PDF, DOC/DOCX, XLS/XLSX, CSV - Max 10MB)
  </p>
  <label className="inline-block">
  <input data-testid="bill-upload-select-bill-files"
  type="file"
  multiple
  accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
  onChange={(e) => handleFileSelect(e.target.files)}
  disabled={uploading}
  className="hidden"
  aria-label="Select bill files"
  title="Select bill files"
  />
  <span
  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs sm:text-sm shadow-xs transition-all active:scale-95 ${
  uploading
  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
  : 'bg-[#18181B] text-white hover:bg-black cursor-pointer'
  }`}
  aria-label="Select Files"
  title="Select Files"
  >
  <Upload size={16} />
  {uploading ? 'Uploading...' : 'Select Files'}
  </span>
  </label>
  </div>

  {/* Uploaded Bills List */}
  {bills.length > 0 && (
  <div className="space-y-2">
  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Attached Bills ({bills.length})</h4>
  <div className="space-y-2">
  {bills.map((bill) => (
  <div
  key={bill.id}
  className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-100 shadow-2xs"
  >
  <div className="flex items-center gap-3 flex-1 min-w-0">
  {getFileIcon(bill.fileType)}
  <div className="flex-1 min-w-0">
  <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
  {bill.fileName}
  </p>
  <p className="text-xs text-slate-400 font-medium mt-0.5">
  {formatFileSize(bill.fileSize)} • {new Date(bill.uploadedAt).toLocaleDateString()}
  </p>
  </div>
  </div>

  <div className="flex items-center gap-1.5 ml-2 shrink-0">
  <button data-testid={`bill-upload-download-bill-${bill.id}`}
  onClick={() => handleDownloadBill(bill)}
  title="Download bill"
  aria-label="Download bill"
  className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
  >
  <Download size={15} />
  </button>
  <button data-testid={`bill-upload-delete-bill-${bill.id}`}
  onClick={() => handleDeleteBill(bill.id!)}
  title="Delete bill"
  aria-label="Delete bill"
  className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
  >
  <Trash2 size={15} />
  </button>
  </div>
  </div>
  ))}
  </div>
  </div>
  )}
 </div>
 );
};
