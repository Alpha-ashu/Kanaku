// -----------------------------------------------------------------------
// Tax component - one row from the bill's tax section
// (e.g. CGST 2.5% INR12.50, VAT 5% INR25.00)
// -----------------------------------------------------------------------
export interface TaxComponent {
  name: string;      // "CGST" | "SGST" | "VAT" | "Sales Tax" | ...
  rate?: number;     // percentage (optional)
  amount: number;    // currency amount
}

// -----------------------------------------------------------------------
// Individual line item with optional qty + rate
// -----------------------------------------------------------------------
export interface ReceiptLineItem {
  name: string;
  quantity?: number;
  rate?: number;
  amount: number;
}

// -----------------------------------------------------------------------
// Validation result - did items + taxes  total?
// -----------------------------------------------------------------------
export interface TotalValidationResult {
  isValid: boolean;
  calculated: number;   // what we computed from items + taxes
  detected: number;     // what was printed on the bill
}

// -----------------------------------------------------------------------
// Core scan result - all fields are optional (partial scans are normal)
// -----------------------------------------------------------------------
export interface ReceiptScanResult {
  // Core fields
  merchantName?: string;
  amount?: number;
  date?: Date;
  time?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;

  // Global intelligence
  location?: string;          // "INDIA" | "USA" | "EU" | "UAE" | "UK" | "UNKNOWN"
  taxBreakdown?: TaxComponent[];   // CGST/SGST/VAT/Sales Tax breakdown

  // Discount fields
  discountAmount?: number;     // discount value in currency units
  discountPercent?: number;    // discount rate as a percentage (e.g. 10 for 10%)

  // Validation
  validationResult?: TotalValidationResult;

  // Meta
  paymentMethod?: string;
  invoiceNumber?: string;
  category?: string;
  subcategory?: string;
  notes?: string;
  description?: string;        // AI-generated: "Mutton Curry INR350, Rice INR50"

  // Items - enriched with qty + rate
  items?: ReceiptLineItem[];

  confidence?: number;
  rawText?: string;

  // New Financial Total Validation Engine fields
  merchant?: {
    value: string;
    confidence: number;
  };
  final_amount?: {
    value: number;
    confidence: number;
  };
  amountMismatchDetected?: boolean;
  amountCandidates?: number[];
}

export interface ReceiptScanPayload extends ReceiptScanResult {
  accountId: number;
  scanDocumentId?: number | null;
}

export interface ReceiptScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onTransactionCreated?: (transactionId: number) => void;
  onApplyScan?: (scan: ReceiptScanPayload) => void;
  onAttachmentSaved?: (documentId: number) => void;
  expenseMode?: 'individual' | 'group';
  initialAccountId?: number | null;
  /** Force the scanner into a specific mode immediately */
  initialMode?: 'scan' | 'attachment' | null;
}

export interface OCRProgress {
  status: string;
  progress: number;
}
