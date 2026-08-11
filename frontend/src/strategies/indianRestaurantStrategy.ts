import type { ReceiptScanResult } from '@/types/receipt.types';
import type { ParsingContext, ParsingStrategy } from '@/services/receiptParserService';

export class IndianRestaurantStrategy implements ParsingStrategy {
  name = 'Indian Restaurant';

  confidence(text: string): number {
    let score = 0;
    if (/GSTIN|FSSAI|VAT\s*TIN|CGST|SGST|IGST/i.test(text)) score += 0.3;
    if (/Tax\s*Invoice|Bill\s*No|Invoice/i.test(text)) score += 0.2;
    if (/Qty|Quantity|Rate|Amount/i.test(text)) score += 0.2;
    if (/\d{1,2}[/ \-.]\d{1,2}[/ \-.]\d{2,4}/.test(text)) score += 0.1;
    if (/upi|phonepe|paytm|gpay|card|cash/i.test(text)) score += 0.1;
    return Math.min(score, 1);
  }

  parse(text: string, _context?: ParsingContext): Partial<ReceiptScanResult> | null {
    try {
      const result: Partial<ReceiptScanResult> = {};
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const merchantName = this.extractMerchantName(lines);
      if (merchantName) result.merchantName = merchantName;

      const dateMatch = text.match(/(?:date|dt)\.?\s*:?\s*(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4})/i)
        || text.match(/\b(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4})\b/)
        || text.match(/(\d{1,2}\s*[|l]\s*\d{1,2}\s*[|l]\s*\d{2,4})/);
      if (dateMatch?.[1]) result.date = this.parseIndianDate(dateMatch[1].replace(/\s+/g, ''));

      const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM))\b/i);
      if (timeMatch?.[1]) result.time = timeMatch[1].toUpperCase();

      const billNoMatch = text.match(/Bill\s*No\.?\s*:?\s*([A-Z0-9\-/]+)/i)
        || text.match(/Invoice\s*(?:No\.?|#)?\s*:?\s*([A-Z0-9\-/]+)/i);
      if (billNoMatch?.[1]) result.invoiceNumber = billNoMatch[1];

      result.amount = this.extractTotalAmount(lines);

      const subtotalMatch = text.match(/Sub\s*[--]?\s*Total\s*:?\s*(?:[INRRs.]*\s*)?([\d,]+\.?\d*)/i)
        || text.match(/Food\s*Total\s*:?\s*(?:[INRRs.]*\s*)?([\d,]+\.?\d*)/i);
      if (subtotalMatch?.[1]) {
        result.subtotal = Number.parseFloat(subtotalMatch[1].replace(/,/g, ''));
      }

      // Flexible CGST/SGST/IGST patterns - handle with/without @, %, Rs, various OCR noise
      const taxComponentPattern = /(?:C\.?G\.?S\.?T|S\.?G\.?S\.?T|I\.?G\.?S\.?T)\s*(?:@\s*)?(?:[\d.]+\s*%?)?\s*:?\s*(?:[INRRs.]*\s*)?([\d,]+\.?\d*)/gi;
      const taxComponents: number[] = [];
      let taxMatch: RegExpExecArray | null;
      while ((taxMatch = taxComponentPattern.exec(text)) !== null) {
        const val = Number.parseFloat(taxMatch[1].replace(/,/g, ''));
        if (Number.isFinite(val) && val > 0) taxComponents.push(val);
      }

      if (taxComponents.length > 0) {
        result.taxAmount = Number(taxComponents.reduce((sum, v) => sum + v, 0).toFixed(2));
      } else {
        // Fallback: try plain GST / Tax Amount line
        const plainTaxMatch = text.match(/(?:gst|tax\s*(?:amount|amt))\s*:?\s*(?:[INRRs.]*\s*)?([\d,]+\.?\d*)/i);
        if (plainTaxMatch?.[1]) {
          const val = Number.parseFloat(plainTaxMatch[1].replace(/,/g, ''));
          if (Number.isFinite(val) && val > 0) result.taxAmount = val;
        }
      }

      // Derive tax from subtotal + total if still missing
      if (!result.taxAmount && result.subtotal && result.amount && result.amount > result.subtotal) {
        const derivedTax = result.amount - result.subtotal;
        if (derivedTax > 0 && derivedTax <= result.amount * 0.35) {
          result.taxAmount = Number(derivedTax.toFixed(2));
        }
      }

      if (/cash/i.test(text)) result.paymentMethod = 'Cash';
      else if (/upi|phonepe|gpay|paytm/i.test(text)) result.paymentMethod = 'UPI';
      else if (/card|credit|debit/i.test(text)) result.paymentMethod = 'Card';

      result.items = this.extractItems(text);
      result.category = this.determineCategory(text, result);
      const firstItemName = result.items?.[0]?.name;
      result.subcategory = (firstItemName && firstItemName.length >= 3 && /[a-z]{2,}/i.test(firstItemName))
        ? firstItemName
        : undefined;
      result.notes = this.extractNotes(text);
      result.confidence = this.calculateConfidence(result);

      return result;
    } catch (error) {
      console.error('Indian restaurant parsing failed:', error);
      return null;
    }
  }

  private extractMerchantName(lines: string[]): string | undefined {
    const candidate = lines
      .slice(0, 6)
      .find((line) => line.length >= 4
        && line.length <= 40
        && !/date|bill\s*no|invoice|gst|fssai|road|street|lane|address|table|w\.?\s*no/i.test(line)
        && !/\d{5,}/.test(line));

    return candidate;
  }

  private extractTotalAmount(lines: string[]): number | undefined {
    const prioritizedPatterns = [
      /food\s*total/i,
      /grand\s*total/i,
      /amount\s*payable/i,
      /net\s*total/i,
      /\btotal\b/i,
    ];

    for (const pattern of prioritizedPatterns) {
      const matchingLine = [...lines]
        .reverse()
        .find((line) => pattern.test(line) && !/sub\s*total|cgst|sgst|igst/i.test(line));

      if (!matchingLine) continue;

      const amounts = matchingLine.match(/\d[\d,]*(?:\.\d{1,2})?/g) || [];
      const parsedAmounts = amounts
        .map((value) => Number.parseFloat(value.replace(/,/g, '')))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (parsedAmounts.length > 0) {
        return Math.max(...parsedAmounts);
      }
    }

    return undefined;
  }

  private parseIndianDate(dateStr: string): Date | undefined {
    const parts = dateStr.split(/[/\-.|l]/);
    if (parts.length !== 3) return undefined;

    const day = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10) - 1;
    let year = Number.parseInt(parts[2], 10);
    if (year < 100) year += 2000;

    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return undefined;

    const now = new Date();
    const lower = new Date(now);
    lower.setFullYear(now.getFullYear() - 10);
    const upper = new Date(now);
    upper.setDate(now.getDate() + 3);

    if (date < lower || date > upper) return undefined;
    return date;
  }

  private extractItems(text: string): Array<{ name: string; amount: number }> | undefined {
    const items: Array<{ name: string; amount: number }> = [];
    const lines = text.split(/\r?\n/);
    const itemPattern = /^([A-Za-z0-9][A-Za-z0-9\s&()+\-/,.]{0,60}?)\s+(?:\d+\s+){1,3}(\d+\.?\d*)$/;
    const pendingNameLines: string[] = [];

    for (const line of lines) {
      const normalizedLine = line.trim().replace(/\s+/g, ' ');
      if (!normalizedLine) continue;

      if (/sub\s*total|cgst|sgst|igst|food\s*total|grand\s*total|visit\s*again|thank\s*you|gstin|fssai/i.test(normalizedLine)) {
        pendingNameLines.length = 0;
        continue;
      }

      const match = normalizedLine.match(itemPattern);
      if (!match?.[1] || !match?.[2]) {
        if (!/\d/.test(normalizedLine)
          && !/particulars|qty|rate|amount|date|bill\s*no|invoice|gst|fssai|visit\s*again|thank\s*you/i.test(normalizedLine)) {
          pendingNameLines.push(normalizedLine.replace(/[.,]+$/g, ''));
          if (pendingNameLines.length > 2) {
            pendingNameLines.shift();
          }
        }
        continue;
      }

      const amount = Number.parseFloat(match[2]);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      let name = match[1].trim().replace(/[.,]+$/g, '');
      if (pendingNameLines.length > 0 && (name.length <= 4 || /\b\w{1,2}\b/.test(name))) {
        name = [...pendingNameLines, name].join(' ');
      }

      if (name.length < 3 || /particulars|qty|rate|amount/i.test(name)) {
        pendingNameLines.length = 0;
        continue;
      }

      items.push({ name, amount });
      pendingNameLines.length = 0;
    }

    return items.length > 0 ? items : undefined;
  }

  private determineCategory(text: string, result: Partial<ReceiptScanResult>): string {
    const textLower = `${text} ${result.merchantName || ''}`.toLowerCase();

    if (/restaurant|cafe|hotel|food|dinner|lunch|breakfast|mojito|pizza|burger|spicy|mango|guava/i.test(textLower)) {
      return 'Food & Dining';
    }
    if (/grocery|supermarket|vegetables|fruits|milk|bread/i.test(textLower)) {
      return 'Groceries';
    }
    if (/shopping|mall|store|retail/i.test(textLower)) {
      return 'Shopping';
    }

    return 'Food & Dining';
  }

  private extractNotes(text: string): string | undefined {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      if (/total|amount/i.test(lines[index]) && index + 1 < lines.length) {
        const candidate = lines[index + 1];
        if (candidate && !/\d/.test(candidate) && candidate.length > 3) {
          return candidate;
        }
      }
    }
    return undefined;
  }

  private calculateConfidence(result: Partial<ReceiptScanResult>): number {
    let score = 0;
    if (result.merchantName) score += 0.2;
    if (result.amount && result.amount > 0) score += 0.3;
    if (result.date) score += 0.2;
    if (result.invoiceNumber) score += 0.1;
    if (result.items && result.items.length > 0) score += 0.2;
    return Math.min(score, 1);
  }
}
