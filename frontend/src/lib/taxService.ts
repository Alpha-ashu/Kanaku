/**
 * KANAKU — Canonical Tax Calculation Service
 * Single source of truth for all tax metrics across Dashboard, Transactions, and Receipt Scanner.
 */

import { toLocalDateKey } from '@/lib/dateUtils';
import type { Transaction, DocumentRecord } from '@/lib/database';

export interface TaxComponentBreakdown {
  name: string;
  amount: number;
}

export interface TaxSummaryMetrics {
  totalTax: number;
  weeklyTax: number;
  monthlyTax: number;
  yearlyTax: number;
  billCount: number;
  topCategories: Array<[string, number]>;
  topTaxTypes: Array<[string, number]>;
  hasTaxData: boolean;
}

export function parseMetadataNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function parseTaxBreakdown(value: unknown): TaxComponentBreakdown[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        name: String(item.name || item.type || item.taxType || 'Tax').trim(),
        amount: parseMetadataNumber(item.amount || item.taxAmount || item.value),
      }))
      .filter((item) => item.amount > 0);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => ({
        name: k.trim(),
        amount: parseMetadataNumber(v),
      }))
      .filter((item) => item.amount > 0);
  }
  return [];
}

/**
 * Calculates authoritative Tax Summary across all transactions and receipts.
 */
export function calculateTaxSummary(
  transactions: Transaction[] = [],
  documents: DocumentRecord[] = []
): TaxSummaryMetrics {
  const now = new Date();
  
  // Start of current week (Monday)
  const currentWeekStart = new Date(now);
  const day = currentWeekStart.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Adjust for Sunday
  currentWeekStart.setDate(currentWeekStart.getDate() + diff);
  currentWeekStart.setHours(0, 0, 0, 0);
  const weekStartKey = toLocalDateKey(currentWeekStart) || '';

  // Start of current month
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartKey = toLocalDateKey(currentMonthStart) || '';

  // Start of current year
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  const yearStartKey = toLocalDateKey(currentYearStart) || '';

  let totalTax = 0;
  let weeklyTax = 0;
  let monthlyTax = 0;
  let yearlyTax = 0;
  let billCount = 0;

  const byCategory: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const seenDocumentIds = new Set<number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;

    const taxAmount = parseMetadataNumber(
      tx.importMetadata?.['Tax Amount'] ?? tx.importMetadata?.taxAmount ?? (tx as any).metadata?.taxAmount
    );
    const taxBreakdown = parseTaxBreakdown(
      tx.importMetadata?.['Tax Breakdown'] ?? tx.importMetadata?.taxBreakdown ?? (tx as any).metadata?.taxBreakdown
    );
    const documentId = (tx as any).documentId ?? (tx as any).metadata?.documentId;

    if (documentId) {
      billCount += 1;
      seenDocumentIds.add(Number(documentId));
    }

    if (taxAmount > 0) {
      totalTax += taxAmount;

      const txDateKey = toLocalDateKey(tx.date) || '';
      if (txDateKey >= weekStartKey) {
        weeklyTax += taxAmount;
      }
      if (txDateKey >= monthStartKey) {
        monthlyTax += taxAmount;
      }
      if (txDateKey >= yearStartKey) {
        yearlyTax += taxAmount;
      }

      const category = tx.category || 'Other';
      byCategory[category] = (byCategory[category] ?? 0) + taxAmount;
    }

    for (const comp of taxBreakdown) {
      byType[comp.name] = (byType[comp.name] ?? 0) + comp.amount;
    }
  }

  // Also include scanned documents not yet attached to a transaction
  for (const doc of documents) {
    if (doc.id && seenDocumentIds.has(doc.id)) continue;
    if (doc.documentType !== 'receipt') continue;

    const docTax = parseMetadataNumber(doc.metadata?.taxAmount ?? doc.metadata?.tax);
    if (docTax > 0) {
      totalTax += docTax;
      billCount += 1;

      const docDate = doc.uploadDate || doc.createdAt;
      const docDateKey = toLocalDateKey(docDate) || '';
      if (docDateKey >= weekStartKey) {
        weeklyTax += docTax;
      }
      if (docDateKey >= monthStartKey) {
        monthlyTax += docTax;
      }
      if (docDateKey >= yearStartKey) {
        yearlyTax += docTax;
      }

      const category = doc.metadata?.category || 'Receipts';
      byCategory[category] = (byCategory[category] ?? 0) + docTax;
    }
  }

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topTaxTypes = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return {
    totalTax: Math.round(totalTax * 100) / 100,
    weeklyTax: Math.round(weeklyTax * 100) / 100,
    monthlyTax: Math.round(monthlyTax * 100) / 100,
    yearlyTax: Math.round(yearlyTax * 100) / 100,
    billCount,
    topCategories,
    topTaxTypes,
    hasTaxData: totalTax > 0 || billCount > 0,
  };
}
