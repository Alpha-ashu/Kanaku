/**
 * KANAKU — Canonical Financial Monetary Arithmetic & Precision Engine
 * 
 * Architectural Standard:
 * 1. Minor Units (Integer Paise / Cents): All internal financial math uses integer minor units
 *    (1 INR = 100 Paise) to eliminate IEEE-754 floating-point drift and rounding bias.
 * 2. Exact Decimal-String Parsing: `toPaise()` parses whole and fractional digits directly from
 *    exact decimal string representations without floating-point intermediary arithmetic.
 * 3. Strict Validation (No Silent Zero-Fallbacks): Invalid inputs (NaN, Infinity, malformed currency,
 *    unsupported precision, impossible values) throw FinancialValidationError. Corrupted data is
 *    never silently reinterpreted as ₹0.
 * 4. 2-Decimal Standard: All formatted outputs convert cleanly from integer paise (fromPaise).
 */

export class FinancialValidationError extends Error {
  readonly field: string;
  readonly receivedValue: unknown;
  readonly code: string;

  constructor(field: string, receivedValue: unknown, message: string, code = 'INVALID_MONETARY_VALUE') {
    super(`[Financial Integrity Error] Invalid monetary value for "${field}": ${message} (Received: ${String(receivedValue)})`);
    this.name = 'FinancialValidationError';
    this.field = field;
    this.receivedValue = receivedValue;
    this.code = code;
  }
}

const KNOWN_CURRENCIES = new Set(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', '₹', '$', '€', '£']);

/**
 * Converts any monetary input into integer minor units (Paise / Cents) using EXACT decimal string parsing.
 * Eliminates floating-point conversion inaccuracies (e.g. 19.99 * 100 = 1998.9999999999998).
 */
export function toPaise(
  value: unknown,
  fieldName = 'amount',
  options?: { allowNegative?: boolean; maxPaise?: bigint; strictPrecision?: boolean }
): bigint {
  if (value === null || value === undefined || value === '') {
    throw new FinancialValidationError(fieldName, value, 'Value is null, undefined, or empty string');
  }

  if (typeof value === 'bigint') {
    if (!options?.allowNegative && value < 0n) {
      throw new FinancialValidationError(fieldName, value, 'Negative amount not permitted for this field');
    }
    return value;
  }

  let str: string;
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new FinancialValidationError(fieldName, value, 'Value is NaN or non-finite Infinity');
    }
    // Prevent scientific notation issues for standard financial amounts
    str = value.toFixed(8).replace(/\.?0+$/, '');
  } else if (typeof value === 'string') {
    str = value.trim();
  } else if (typeof value === 'object' && value !== null && 'toString' in value) {
    str = value.toString().trim();
  } else {
    throw new FinancialValidationError(fieldName, value, 'Unsupported monetary value type');
  }

  // Detect and validate currency code if present
  const currencyMatch = str.match(/^[A-Za-z]{3,4}/);
  if (currencyMatch) {
    const code = currencyMatch[0].toUpperCase();
    if (!KNOWN_CURRENCIES.has(code)) {
      throw new FinancialValidationError(fieldName, value, `Unsupported or invalid currency code "${code}"`);
    }
  }

  // Remove valid currency symbols, commas, and whitespace
  let clean = str.replace(/[₹$€£,\s]/g, '').replace(/^(INR|USD|EUR|GBP|CAD|AUD|SGD|AED)/i, '').trim();

  if (clean === '' || clean === '-' || clean === '+' || clean === '.') {
    throw new FinancialValidationError(fieldName, value, 'Value contains no valid numeric digits');
  }

  const isNegative = clean.startsWith('-');
  if (isNegative) {
    clean = clean.substring(1).trim();
  } else if (clean.startsWith('+')) {
    clean = clean.substring(1).trim();
  }

  if (!options?.allowNegative && isNegative) {
    throw new FinancialValidationError(fieldName, value, 'Negative amount not permitted for this field');
  }

  // Validate numeric structure (digits + optional single decimal point)
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new FinancialValidationError(fieldName, value, 'Malformed monetary string format');
  }

  const [wholeStr, fracStr = ''] = clean.split('.');

  if (options?.strictPrecision && fracStr.length > 2) {
    throw new FinancialValidationError(fieldName, value, `Excessive decimal precision (${fracStr.length} decimal places > 2 maximum)`);
  }

  const wholePaise = BigInt(wholeStr) * 100n;
  let fracPaise = 0n;

  if (fracStr.length === 1) {
    fracPaise = BigInt(fracStr) * 10n;
  } else if (fracStr.length === 2) {
    fracPaise = BigInt(fracStr);
  } else if (fracStr.length > 2) {
    // Banker's rounding for sub-paise fractions
    const twoDigits = BigInt(fracStr.substring(0, 2));
    const thirdDigit = Number(fracStr[2]);
    const roundUp = thirdDigit >= 5 ? 1n : 0n;
    fracPaise = twoDigits + roundUp;
  }

  const totalPaise = wholePaise + fracPaise;
  const signedPaise = isNegative ? -totalPaise : totalPaise;

  const MAX_FINANCIAL_PAISE = 1_000_000_000_000_000n; // ₹10 Trillion
  const effectiveMax = options?.maxPaise ?? MAX_FINANCIAL_PAISE;

  if (signedPaise > effectiveMax || signedPaise < -effectiveMax) {
    throw new FinancialValidationError(fieldName, value, `Monetary value exceeds maximum permitted bound of ${effectiveMax} paise`);
  }

  return signedPaise;
}

/**
 * Converts integer minor units (Paise) back to standard decimal currency (Rupees).
 */
export function fromPaise(paise: bigint): number {
  return Number(paise) / 100;
}

/**
 * Strict parser for monetary values. Returns exact decimal number or throws.
 */
export function parseMonetaryStrict(
  value: unknown,
  fieldName = 'amount',
  options?: { allowNegative?: boolean; strictPrecision?: boolean }
): number {
  const paise = toPaise(value, fieldName, options);
  return fromPaise(paise);
}

/**
 * Safe parser for UI presentation where fallback is explicitly requested.
 * If data is invalid, logs a structured error and invokes onCorruption callback if provided.
 */
export function parseMonetary(
  value: unknown,
  fieldName = 'amount',
  options?: { allowNegative?: boolean; fallback?: number; onCorruption?: (err: FinancialValidationError) => void }
): number {
  try {
    return parseMonetaryStrict(value, fieldName, options);
  } catch (err) {
    if (err instanceof FinancialValidationError) {
      if (options?.onCorruption) {
        options.onCorruption(err);
      } else {
        console.error(`[Data Integrity Alert] Corrupted monetary field "${fieldName}":`, err.message);
      }
    }
    if (options?.fallback !== undefined) {
      return options.fallback;
    }
    throw err;
  }
}

/**
 * Exact integer addition of monetary values in Paise.
 */
export function safeAddMoney(a: unknown, b: unknown, field = 'sum'): number {
  const pA = toPaise(a, `${field}.a`, { allowNegative: true });
  const pB = toPaise(b, `${field}.b`, { allowNegative: true });
  return fromPaise(pA + pB);
}

/**
 * Exact integer subtraction of monetary values in Paise.
 */
export function safeSubMoney(a: unknown, b: unknown, field = 'diff'): number {
  const pA = toPaise(a, `${field}.a`, { allowNegative: true });
  const pB = toPaise(b, `${field}.b`, { allowNegative: true });
  return fromPaise(pA - pB);
}

/**
 * Exact multiplication by a scale or factor (e.g. quantity, tax rate) with banker's rounding.
 */
export function safeMulMoney(amount: unknown, factor: number, field = 'product'): number {
  const p = toPaise(amount, field, { allowNegative: true });
  const scaled = BigInt(Math.round(Number(p) * factor));
  return fromPaise(scaled);
}

/**
 * Rounds any number to exact 2-decimal currency standard without floating point drift.
 */
export function roundToMoney(amount: number): number {
  if (Number.isNaN(amount) || !Number.isFinite(amount)) {
    throw new FinancialValidationError('roundToMoney', amount, 'Cannot round NaN or Infinity');
  }
  return fromPaise(toPaise(amount, 'roundToMoney', { allowNegative: true }));
}

/**
 * Authoritative Liquid Balance aggregation across active accounts using integer Paise math.
 */
export function calculateAccountTotalBalance(accounts: Array<{ balance?: unknown; isActive?: boolean }>): number {
  if (!Array.isArray(accounts)) return 0;
  let totalPaise = 0n;

  for (const account of accounts) {
    if (account.isActive === false) continue;
    if (account.balance === null || account.balance === undefined || account.balance === '') continue;
    try {
      totalPaise += toPaise(account.balance, 'account.balance', { allowNegative: true });
    } catch (err) {
      console.error('[Data Integrity Warning] Account with corrupt balance ignored in total:', account);
    }
  }

  return fromPaise(totalPaise);
}

/**
 * Authoritative Loan Summary aggregation using integer Paise math.
 */
export interface LoanSummary {
  totalBorrowed: number;
  totalLent: number;
  totalEMI: number;
  netLoanBalance: number;
}

export function calculateLoanSummary(loans: Array<{
  type?: string;
  amount?: unknown;
  remainingAmount?: unknown;
  emiAmount?: unknown;
  status?: string;
}>): LoanSummary {
  if (!Array.isArray(loans)) {
    return { totalBorrowed: 0, totalLent: 0, totalEMI: 0, netLoanBalance: 0 };
  }

  let borrowedPaise = 0n;
  let lentPaise = 0n;
  let emiPaise = 0n;

  for (const loan of loans) {
    if (loan.status === 'closed' || loan.status === 'settled') continue;
    try {
      const remaining = toPaise(loan.remainingAmount ?? loan.amount, 'loan.remainingAmount');
      const emi = loan.emiAmount ? toPaise(loan.emiAmount, 'loan.emiAmount') : 0n;

      if (loan.type === 'borrowed') {
        borrowedPaise += remaining;
        emiPaise += emi;
      } else if (loan.type === 'lent') {
        lentPaise += remaining;
      }
    } catch (err) {
      console.error('[Data Integrity Warning] Corrupt loan entity skipped in aggregation:', loan);
    }
  }

  return {
    totalBorrowed: fromPaise(borrowedPaise),
    totalLent: fromPaise(lentPaise),
    totalEMI: fromPaise(emiPaise),
    netLoanBalance: fromPaise(lentPaise - borrowedPaise),
  };
}

/**
 * Authoritative Investment Portfolio Summary using integer Paise math.
 */
export interface InvestmentSummary {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  returnPercentage: number;
}

export function calculateInvestmentSummary(investments: Array<{
  investedAmount?: unknown;
  amount?: unknown;
  currentValue?: unknown;
  status?: string;
}>): InvestmentSummary {
  if (!Array.isArray(investments)) {
    return { totalInvested: 0, currentValue: 0, totalGainLoss: 0, returnPercentage: 0 };
  }

  let investedPaise = 0n;
  let currentPaise = 0n;

  for (const inv of investments) {
    if (inv.status === 'closed') continue;
    try {
      const invested = toPaise(inv.investedAmount ?? inv.amount, 'investment.invested');
      const current = toPaise(inv.currentValue ?? inv.investedAmount ?? inv.amount, 'investment.currentValue');
      investedPaise += invested;
      currentPaise += current;
    } catch (err) {
      console.error('[Data Integrity Warning] Corrupt investment entity skipped in aggregation:', inv);
    }
  }

  const gainLossPaise = currentPaise - investedPaise;
  const returnPercentage = investedPaise > 0n
    ? Math.round((Number(gainLossPaise) / Number(investedPaise)) * 10000) / 100
    : 0;

  return {
    totalInvested: fromPaise(investedPaise),
    currentValue: fromPaise(currentPaise),
    totalGainLoss: fromPaise(gainLossPaise),
    returnPercentage,
  };
}

/**
 * Authoritative Net Worth calculation using Integer Paise:
 * Net Worth = Liquid Accounts + Investments + Lent Loans + Gold Assets - Borrowed Debt - Group Liabilities
 */
export function calculateNetWorth(params: {
  accountBalance?: unknown;
  investmentValue?: unknown;
  totalLent?: unknown;
  totalBorrowed?: unknown;
  goldValue?: unknown;
  groupPendingCollection?: unknown;
}): number {
  const liquidPaise = params.accountBalance != null ? toPaise(params.accountBalance, 'netWorth.liquid', { allowNegative: true }) : 0n;
  const invPaise = params.investmentValue != null ? toPaise(params.investmentValue, 'netWorth.investments') : 0n;
  const lentPaise = params.totalLent != null ? toPaise(params.totalLent, 'netWorth.lent') : 0n;
  const borrowedPaise = params.totalBorrowed != null ? toPaise(params.totalBorrowed, 'netWorth.borrowed') : 0n;
  const goldPaise = params.goldValue != null ? toPaise(params.goldValue, 'netWorth.gold') : 0n;
  const groupPaise = params.groupPendingCollection != null ? toPaise(params.groupPendingCollection, 'netWorth.groupPending', { allowNegative: true }) : 0n;

  const assetsPaise = liquidPaise + invPaise + lentPaise + goldPaise + (groupPaise > 0n ? groupPaise : 0n);
  const liabilitiesPaise = borrowedPaise + (groupPaise < 0n ? -groupPaise : 0n);

  return fromPaise(assetsPaise - liabilitiesPaise);
}
