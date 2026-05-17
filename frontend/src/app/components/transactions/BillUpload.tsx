import React, { useState, useEffect } from 'react';
import { backendService } from '@/lib/backend-api';
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
 const fetchBills = async () => {
 const backendBills = await backendService.getExpenseBills(String(transactionId));
 setBills(backendBills || []);
 };
 fetchBills();
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

 await backendService.uploadExpenseBill({ transactionId, file });

 toast.success(`${file.name} uploaded`);
 }
 // Refresh bills after upload
 const backendBills = await backendService.getExpenseBills(String(transactionId));
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
 // Refresh bills after delete
 const backendBills = await backendService.getExpenseBills(String(transactionId));
 setBills(backendBills || []);
 } catch (error) {
 console.error('Failed to delete bill:', error);
 toast.error('Failed to delete bill');
 }
 };

 const handleDownloadBill = async (bill: ExpenseBillItem) => {
 try {
 if (!bill.downloadUrl) {
 toast.error('Download link expired. Please refresh and try again.');
 return;
 }
 const response = await fetch(bill.downloadUrl);
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
 className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
 isDragging
 ? 'border-blue-500 bg-blue-50'
 : 'border-gray-300 bg-white hover:border-gray-400'
 }`}
 >
 <Upload
 size={32}
 className={`mx-auto mb-2 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`}
 />
 <p className="font-medium text-gray-900 mb-1">
 Drag and drop your bills/receipts here
 </p>
 <p className="text-sm text-gray-500 mb-4">
 or click to browse (JPG, PNG, WebP, PDF, DOC/DOCX, XLS/XLSX, CSV - Max 10MB)
 </p>
 <label className="inline-block">
 <input
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
 className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
 uploading
 ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
 : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
 }`}
 aria-label="Select Files"
 title="Select Files"
 >
 <Upload size={18} />
 {uploading ? 'Uploading...' : 'Select Files'}
 </span>
 </label>
 </div>

 {/* Uploaded Bills List */}
 {bills.length > 0 && (
 <div className="space-y-2">
 <h4 className="font-medium text-gray-900">Attached Bills ({bills.length})</h4>
 <div className="space-y-2">
 {bills.map((bill) => (
 <div
 key={bill.id}
 className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
 >
 <div className="flex items-center gap-3 flex-1 min-w-0">
 {getFileIcon(bill.fileType)}
 <div className="flex-1 min-w-0">
 <p className="font-medium text-gray-900 truncate">
 {bill.fileName}
 </p>
 <p className="text-xs text-gray-500">
 {formatFileSize(bill.fileSize)} - {new Date(bill.uploadedAt).toLocaleDateString()}
 </p>
 </div>
 </div>

 <div className="flex gap-2 ml-2">
 <button
 onClick={() => handleDownloadBill(bill)}
 title="Download bill"
 aria-label="Download bill"
 className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
 >
 <Download size={18} />
 </button>
 <button
 onClick={() => handleDeleteBill(bill.id!)}
 title="Delete bill"
 aria-label="Delete bill"
 className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
 >
 <Trash2 size={18} />
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
