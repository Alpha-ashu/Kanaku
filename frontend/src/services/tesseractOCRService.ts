// tesseract.js is heavy (~5MB), so we import it dynamically only when needed
// for OCR features to keep the main bundle light.
type TesseractModule = typeof import('tesseract.js');
type TesseractWorker = import('tesseract.js').Worker;


export interface OCRResult {
  text: string;
  confidence: number;
}

export interface ExpenseData {
  amount?: number;
  merchant?: string;
  date?: string;
  category?: string;
  confidence: number;
  rawText?: string;
}

class TesseractOCREngine {
  private worker: TesseractWorker | null = null;
  private initialized = false;
  private tesseract: any = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log(' Initializing Tesseract OCR Engine (Lazy Loading)...');
      
      const Tesseract = await import('tesseract.js');
      this.tesseract = Tesseract;

      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(` OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      // Optimize settings for receipt scanning
      await this.worker.setParameters({
        tessedit_char_whitelist: '0123456789.,INR$EURGBPABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
        tessedit_pageseg_mode: this.tesseract.PSM.SINGLE_COLUMN,
        preserve_interword_spaces: '1',
      });

      this.initialized = true;
      console.log(' Tesseract OCR Engine Ready');
    } catch (error) {
      console.error(' Failed to initialize Tesseract:', error);
      throw new Error('OCR Engine initialization failed');
    }
  }

  async extractText(imageFile: File): Promise<OCRResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.worker) {
      throw new Error('OCR Worker not initialized');
    }

    try {
      console.log(' Starting OCR extraction...');
      const startTime = performance.now();

      const { data } = await this.worker.recognize(imageFile);
      const endTime = performance.now();

      console.log(` OCR completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(` OCR Confidence: ${(data.confidence * 100).toFixed(1)}%`);

      return {
        text: data.text,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error(' OCR extraction failed:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  async extractExpenseData(imageFile: File): Promise<ExpenseData> {
    const ocrResult = await this.extractText(imageFile);
    return this.parseExpenseData(ocrResult.text, ocrResult.confidence);
  }

  private parseExpenseData(rawText: string, ocrConfidence: number): ExpenseData {
    console.log(' Parsing expense data from OCR text...');
    
    const lines = rawText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const result: ExpenseData = {
      confidence: ocrConfidence,
      rawText,
    };

    // Extract amount with multiple patterns
    result.amount = this.extractAmount(lines);
    
    // Extract merchant name
    result.merchant = this.extractMerchant(lines);
    
    // Extract date
    result.date = this.extractDate(lines);
    
    // Calculate overall confidence
    let dataPoints = 0;
    let totalConfidence = 0;
    
    if (result.amount) { dataPoints++; totalConfidence += 0.9; }
    if (result.merchant) { dataPoints++; totalConfidence += 0.8; }
    if (result.date) { dataPoints++; totalConfidence += 0.7; }
    
    result.confidence = ocrConfidence * (dataPoints > 0 ? totalConfidence / dataPoints : 1);

    console.log(' Parsed data:', result);
    return result;
  }

  private extractAmount(lines: string[]): number | undefined {
    const amountPatterns = [
      /(?:total|amount|sum|payable|due|bill|charge)\s*:?\s*INR?\s*([\d,]+(?:\.\d{2})?)/i,
      /INR?\s*([\d,]+(?:\.\d{2})?)\s*(?:total|amount|pay|paid)/i,
      /INR?\s*([\d,]+(?:\.\d{2})?)\s*$/i,
      /(?:rs|inr|rupees?)\s*([\d,]+(?:\.\d{2})?)/i,
    ];

    for (const line of lines) {
      for (const pattern of amountPatterns) {
        const match = line.match(pattern);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0) {
            console.log(` Amount found: INR${amount}`);
            return amount;
          }
        }
      }
    }

    return undefined;
  }

  private extractMerchant(lines: string[]): string | undefined {
    const merchantHints = [
      /dominos?|pizza hut|kfc|mcdonalds?|burger king|subway|starbucks/i,
      /amazon|flipkart|myntra|ajio|snapdeal/i,
      /swiggy|zomato|foodpanda|ubereats|doordash/i,
      /bigbasket|grofers|dmart|reliance fresh/i,
      /uber|ola|lyft|rapido/i,
    ];

    // Look for merchant in first few lines
    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const line = lines[i].toLowerCase();
      
      // Skip lines that are clearly not merchant names
      if (/date|time|invoice|bill|receipt|order|cash|card|payment|thank|visit/i.test(line)) {
        continue;
      }

      for (const hint of merchantHints) {
        const match = line.match(hint);
        if (match) {
          const merchant = match[0];
          console.log(` Merchant found: ${merchant}`);
          return this.capitalizeWords(merchant);
        }
      }
    }

    // Fallback: First line with reasonable length and no numbers
    for (const line of lines) {
      if (line.length >= 3 && line.length <= 40 && !/\d/.test(line)) {
        console.log(` Fallback merchant: ${line}`);
        return this.capitalizeWords(line);
      }
    }

    return undefined;
  }

  private extractDate(lines: string[]): string | undefined {
    const datePatterns = [
      /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/, // DD/MM/YYYY
      /(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})/, // YYYY/MM/DD
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i, // DD Month YYYY
    ];

    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          let date: Date;
          
          if (match.length === 4) {
            const [_, day, month, year] = match;
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            const [_, day, monthStr, year] = match;
            const month = new Date(`${monthStr} 1, 2000`).getMonth();
            date = new Date(parseInt(year), month, parseInt(day));
          }

          if (!isNaN(date.getTime())) {
            const formattedDate = date.toISOString().split('T')[0];
            console.log(` Date found: ${formattedDate}`);
            return formattedDate;
          }
        }
      }
    }

    return undefined;
  }

  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      console.log(' OCR Engine destroyed');
    }
  }
}

// Singleton instance
export const ocrEngine = new TesseractOCREngine();

// REMOVED: ocrEngine.initialize() auto-call.
// Initialization now happens lazily on the first extractText() call.
