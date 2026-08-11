import type { ReceiptScanResult } from '@/types/receipt.types';
import { TesseractOCRService } from './ocrService';

export class EnhancedReceiptScannerService {
  private readonly ocrService: TesseractOCRService;

  constructor() {
    this.ocrService = new TesseractOCRService();
  }

  async scanAndParseReceipt(
    file: File,
    userId?: string,
    onProgress?: (status: string, progress: number) => void,
  ): Promise<ReceiptScanResult> {
    onProgress?.('Scanning receipt...', 10);
    const parsed = await this.ocrService.scanReceipt(file, userId, (progress) => {
      onProgress?.(progress.status, progress.progress);
    });

    onProgress?.('Validating extracted fields...', 90);
    const merged = await this.validateAndCorrect(parsed);

    onProgress?.('Validation complete', 100);
    return merged;
  }

  async validateAndCorrect(result: ReceiptScanResult): Promise<ReceiptScanResult> {
    const next = { ...result };

    if ((!next.amount || next.amount <= 0) && next.items && next.items.length > 0) {
      const totalFromItems = next.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      if (totalFromItems > 0) {
        next.amount = Number(totalFromItems.toFixed(2));
      }
    }

    if ((!next.amount || next.amount <= 0) && next.subtotal && next.subtotal > 0) {
      next.amount = Number((next.subtotal + (next.taxAmount || 0)).toFixed(2));
    }

    if ((!next.taxAmount || next.taxAmount <= 0) && next.taxBreakdown && next.taxBreakdown.length > 0) {
      next.taxAmount = Number(next.taxBreakdown.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    }

    if (!next.category || this.isClearlyMismatchedCategory(next)) {
      next.category = this.suggestCategory(next);
    }

    // Recover date from rawText if strategy parsers missed it
    if (!next.date && next.rawText) {
      next.date = this.recoverDate(next.rawText);
    }

    // Derive tax from subtotal + total if both exist but tax is missing
    if (!next.taxAmount && next.subtotal && next.amount && next.amount > next.subtotal) {
      const derivedTax = next.amount - next.subtotal;
      if (derivedTax > 0 && derivedTax <= next.amount * 0.35) {
        next.taxAmount = Number(derivedTax.toFixed(2));
      }
    }

    // Derive subtotal from total - tax if both exist but subtotal is missing
    if (!next.subtotal && next.amount && next.taxAmount && next.amount > next.taxAmount) {
      next.subtotal = Number((next.amount - next.taxAmount).toFixed(2));
    }

    if ((!next.taxBreakdown || next.taxBreakdown.length === 0) && next.taxAmount && next.taxAmount > 0) {
      next.taxBreakdown = [{ name: 'Tax', amount: Number(next.taxAmount.toFixed(2)) }];
    }

    if (!next.validationResult && next.amount) {
      const itemSubtotal = next.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
      const subtotal = next.subtotal ?? (itemSubtotal > 0 ? Number(itemSubtotal.toFixed(2)) : 0);
      const taxAmount = next.taxAmount ?? 0;
      const discount = (next as any).discountAmount ?? 0;
      const calculated = Number((subtotal - discount + taxAmount).toFixed(2));

      if (calculated > 0) {
        next.validationResult = {
          isValid: Math.abs(calculated - next.amount) <= Math.max(2, next.amount * 0.05),
          calculated,
          detected: Number(next.amount.toFixed(2)),
        };
      }
    }

    // Clean garbage merchant/subcategory. Two failure shapes from table-layout
    // OCR merges: pure noise ("y + oR", single symbols) and receipt-metadata
    // bleed-through ("Code: #VCNKA CS: Tacka? | Table: 11-FLOOR") — neither
    // belongs in a user-facing field; blank beats garbage in the review card.
    const looksLikeGarbage = (val: string) =>
      val.length < 3 ||
      !/[a-z]{2,}/i.test(val) ||
      /[#|+]|Code:|Table:|Bill number|C\/S:|CS:/i.test(val);

    if (next.merchantName && looksLikeGarbage(next.merchantName)) {
      next.merchantName = undefined;
    }
    if (next.subcategory && looksLikeGarbage(next.subcategory)) {
      next.subcategory = undefined;
    }

    return next;
  }

  private isClearlyMismatchedCategory(result: ReceiptScanResult): boolean {
    const text = [result.merchantName, result.notes, result.rawText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!result.category) return true;
    if (result.category === 'Housing' && /restaurant|cafe|food|menu|gst|fssai|dinner|lunch/i.test(text)) return true;
    return false;
  }

  private recoverDate(rawText: string): Date | undefined {
    const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

    // Prioritize lines with date labels
    const dateLabelLines = lines.filter((l) => /date|dt\.?\s*:/i.test(l));
    const allLines = [...dateLabelLines, ...lines];

    const patterns = [
      /(\d{1,2})\s*[/\-.|]\s*(\d{1,2})\s*[/\-.|]\s*(\d{2,4})/,
      /(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})/,
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s+(\d{2,4})/i,
    ];

    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    for (const line of allLines) {
      for (const pattern of patterns) {
        const m = line.match(pattern);
        if (!m) continue;

        if (/^\(\\d\{4\}/.test(pattern.source) || /^\d{4}$/.test(m[1])) {
          const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          if (!Number.isNaN(d.getTime())) return d;
          continue;
        }

        if (/[a-z]/i.test(m[2])) {
          let yr = Number(m[3]);
          if (yr < 100) yr += 2000;
          const d = new Date(yr, monthMap[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
          if (!Number.isNaN(d.getTime())) return d;
          continue;
        }

        const a = Number(m[1]);
        const b = Number(m[2]);
        let yr = Number(m[3]);
        if (yr < 100) yr += 2000;
        if (a <= 31 && b <= 12) {
          const d = new Date(yr, b - 1, a);
          if (!Number.isNaN(d.getTime())) return d;
        } else if (b <= 31 && a <= 12) {
          const d = new Date(yr, a - 1, b);
          if (!Number.isNaN(d.getTime())) return d;
        }
      }
    }
    return undefined;
  }

  private suggestCategory(result: ReceiptScanResult): string {
    const text = [result.merchantName, result.notes, result.rawText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const categoryKeywords: Record<string, string[]> = {
      'Food & Dining': ['restaurant', 'cafe', 'hotel', 'food', 'dinner', 'lunch', 'breakfast', 'pizza', 'burger'],
      Groceries: ['grocery', 'supermarket', 'vegetables', 'fruits', 'milk', 'bread', 'mart'],
      Shopping: ['shopping', 'mall', 'store', 'retail', 'clothing', 'apparel'],
      Transport: ['fuel', 'petrol', 'gas', 'uber', 'ola', 'taxi', 'metro'],
      Entertainment: ['movie', 'cinema', 'netflix', 'spotify', 'theatre'],
      Healthcare: ['medical', 'pharmacy', 'doctor', 'hospital', 'clinic'],
      Utilities: ['electricity', 'water', 'gas', 'internet', 'broadband'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return category;
      }
    }

    return result.category || 'Shopping';
  }
}
