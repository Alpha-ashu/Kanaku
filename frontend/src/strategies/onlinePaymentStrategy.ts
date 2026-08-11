import type { ReceiptScanResult } from '@/types/receipt.types';
import type { ParsingContext, ParsingStrategy } from '@/services/receiptParserService';

export class OnlinePaymentStrategy implements ParsingStrategy {
  name = 'Online Payment';

  confidence(text: string): number {
    let score = 0;
    if (/upi|utr|transaction\s*id|txn\s*id|ref\s*no|debited|credited/i.test(text)) score += 0.35;
    if (/paytm|phonepe|gpay|google\s*pay|amazon\s*pay|bharatpe/i.test(text)) score += 0.35;
    if (/\b\d+\.\d{2}\b/.test(text)) score += 0.15;
    return Math.min(score, 1);
  }

  parse(text: string, _context?: ParsingContext): Partial<ReceiptScanResult> | null {
    const result: Partial<ReceiptScanResult> = {};

    const merchantMatch = text.match(/(?:paid\s*to|merchant\s*:?|to\s*:?)([A-Za-z0-9\s&._-]{3,})/i);
    if (merchantMatch?.[1]) {
      result.merchantName = merchantMatch[1].trim();
    }

    const amountMatch = text.match(/(?:rs\.?|inr|INR)\s*(\d+\.?\d*)/i)
      || text.match(/amount\s*:?\s*(\d+\.?\d*)/i);
    if (amountMatch?.[1]) {
      result.amount = Number.parseFloat(amountMatch[1]);
    }

    const dateMatch = text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
    if (dateMatch?.[1]) {
      const parts = dateMatch[1].split(/[/-]/);
      if (parts.length === 3) {
        let year = Number.parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        const date = new Date(year, Number.parseInt(parts[1], 10) - 1, Number.parseInt(parts[0], 10));
        if (!Number.isNaN(date.getTime())) result.date = date;
      }
    }

    result.paymentMethod = 'UPI';
    result.category = 'Utilities';
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  private calculateConfidence(result: Partial<ReceiptScanResult>) {
    let score = 0;
    if (result.paymentMethod) score += 0.3;
    if (result.amount && result.amount > 0) score += 0.4;
    if (result.merchantName) score += 0.2;
    if (result.date) score += 0.1;
    return Math.min(score, 1);
  }
}
