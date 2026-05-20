import { db } from '@/lib/database';
import { financialDataCaptureService } from './financialDataCaptureService';
import type { ReceiptScanResult } from '@/types/receipt.types';

export interface CreateTransactionParams {
  scanResult: ReceiptScanResult;
  accountId: number;
  userId: string;
  currency: string;
  currentBalance: number;
  onDuplicateNotify?: () => void;
}

const serializeReceiptField = (value: unknown) => {
  if (value == null) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const buildReceiptImportMetadata = (scanResult: ReceiptScanResult, currency: string) => ({
  Currency: scanResult.currency || currency,
  'Invoice Number': scanResult.invoiceNumber || '',
  'Payment Method': scanResult.paymentMethod || '',
  'OCR Confidence': scanResult.confidence?.toString() || '',
  'Tax Amount': scanResult.taxAmount?.toFixed(2) || '',
  'Subtotal': scanResult.subtotal?.toFixed(2) || '',
  'Location': scanResult.location || '',
  'Tax Breakdown': serializeReceiptField(scanResult.taxBreakdown),
  'Detected Items': serializeReceiptField(scanResult.items),
  'Validation Result': serializeReceiptField(scanResult.validationResult),
  'Receipt Summary': serializeReceiptField({
    merchantName: scanResult.merchantName || '',
    amount: scanResult.amount ?? '',
    subtotal: scanResult.subtotal ?? '',
    taxAmount: scanResult.taxAmount ?? '',
    paymentMethod: scanResult.paymentMethod || '',
    invoiceNumber: scanResult.invoiceNumber || '',
  }),
});

export class TransactionService {
  async createFromReceipt(
    params: CreateTransactionParams,
  ): Promise<{ transactionId?: number; saved: boolean; duplicate: boolean; message: string }> {
    const {
      scanResult,
      accountId,
      userId,
      currency,
      currentBalance,
      onDuplicateNotify,
    } = params;

    const amount = scanResult.amount || 0;
    if (amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    // Build smart description: AI-generated > notes > merchant name
    const baseDescription = scanResult.description?.trim()
      || scanResult.notes?.trim()
      || scanResult.merchantName
      || 'Receipt';

    const savedTransaction = await financialDataCaptureService.saveTransactionDraft(
      {
        type: 'expense',
        amount,
        accountId,
        category: scanResult.category || 'Shopping',
        subcategory: scanResult.subcategory?.trim() || '',
        description: baseDescription,
        merchant: scanResult.merchantName || '',
        date: scanResult.date || new Date(),
        importSource: 'receipt-scanner',
        importMetadata: buildReceiptImportMetadata(scanResult, currency),
      },
      {
        userId,
        duplicateDecision: 'notify',
        onDuplicateNotify: onDuplicateNotify || (() => {}),
      },
    );

    if (savedTransaction.saved && savedTransaction.transactionId) {
      const account = await db.accounts.get(accountId);
      if (account) {
        await this.updateAccountBalance(accountId, Number(account.balance) - amount);
      }
    }

    return savedTransaction;
  }

  private async updateAccountBalance(accountId: number, newBalance: number): Promise<void> {
    await db.accounts.update(accountId, {
      balance: newBalance,
      updatedAt: new Date(),
    });
  }
}
