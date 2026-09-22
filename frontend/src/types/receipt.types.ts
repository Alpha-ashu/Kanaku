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
// A non-tax addition to the bill: service charge, packaging, delivery,
// convenience/handling fee, tip. Kept separate from TaxComponent because
// folding a 10% service charge into "tax" overstates GST paid and breaks the
// bill's own arithmetic.
// -----------------------------------------------------------------------
export interface ReceiptCharge {
  type: string;    // SERVICE | PACKAGING | DELIVERY | CONVENIENCE | HANDLING | TIP | OTHER
  label: string;   // as printed on the bill
  amount: number;
  rate?: number;
}

/** Whether the printed total already contains the tax. */
export type ReceiptTaxModel = 'exclusive' | 'inclusive';

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

  // --- Structured extraction -------------------------------------------
  /** Service / packaging / delivery / convenience / handling / tip. */
  additionalCharges?: ReceiptCharge[];
  totalCharges?: number;
  /** Signed rounding adjustment as printed (-0.48 stays negative). */
  roundOff?: number;
  /** Whether tax is already inside the printed total. */
  taxModel?: ReceiptTaxModel;

  merchantBrand?: string;
  merchantAddress?: string;
  gstin?: string;
  billNumber?: string;

  /** True when the printed total was unreadable and this is the sum of the parts. */
  totalWasDerived?: boolean;
  /** Human-readable reasons the reading did not reconcile. */
  reviewIssues?: string[];
  /** True when the arithmetic did not add up and a person should check. */
  requiresReview?: boolean;
  /** Which extractor produced this: gemini-vision | fallback-vision | gemini-text | fallback-text | ocr-heuristic. */
  engine?: string;

  /** Canonical backend bill attachment ID for cross-device cloud sync */
  billId?: string;
  /** Direct or signed download URL */
  downloadUrl?: string | null;
  /**
   * Whether the receipt image itself reached the server.
   *
   * A scan can return perfectly good extracted figures while the bill failed to
   * persist — the server treats storing the image as non-fatal so a storage
   * hiccup does not throw away a reading the user waited for. But that outcome
   * LOOKS like success: the amounts appear, the user moves on, and the receipt
   * is simply missing from their bills list later, with nothing having said so.
   *
   * `billId` being undefined already implied this; this says it outright so the
   * UI has something unambiguous to branch on.
   */
  billStored?: boolean;
  /**
   * Things that went wrong without failing the scan, phrased for the user.
   *
   * Populated by the server. Surfaced next to the result rather than swallowed,
   * so a partial success is visibly partial.
   */
  warnings?: string[];
}

export interface ReceiptScanPayload extends ReceiptScanResult {
  accountId: number;
  scanDocumentId?: number | null;
  documentId?: number | null;
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
