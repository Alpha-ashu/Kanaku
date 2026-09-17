import { jsPDF } from 'jspdf';
import { Account, Goal, Investment, Loan, Transaction } from '@/lib/database';
import { getCurrencySymbol } from '@/lib/currencyUtils';

interface StatementReportInput {
  userName: string;
  reportPeriod: string;
  generatedAt: Date;
  currencyCode: string;
  transactions: Transaction[];
  accounts: Account[];
  loans: Loan[];
  goals: Goal[];
  investments: Investment[];
}

/* ─── Page Layout Constants ────────────────────────────────────────────────── */
const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 36,
  marginTop: 36,
  marginBottom: 44,
};

/* ─── Professional Color Palette (Modern Executive Theme) ─────────────────── */
const COLORS = {
  // Brand
  brand: [79, 70, 229] as [number, number, number],        // Indigo-600 #4F46E5
  brandDark: [67, 56, 202] as [number, number, number],    // Indigo-700
  brandLight: [238, 242, 255] as [number, number, number], // Indigo-50
  brandBorder: [199, 210, 254] as [number, number, number],// Indigo-200

  // Slate Neutral Hierarchy
  slate900: [15, 23, 42] as [number, number, number],      // Slate-900 (Main headings)
  slate800: [30, 41, 59] as [number, number, number],      // Slate-800 (Primary text)
  slate700: [51, 65, 85] as [number, number, number],      // Slate-700 (Body text)
  slate500: [100, 116, 139] as [number, number, number],   // Slate-500 (Labels/metadata)
  slate400: [148, 163, 184] as [number, number, number],   // Slate-400 (Muted)
  slate200: [226, 232, 240] as [number, number, number],   // Slate-200 (Borders/lines)
  slate100: [241, 245, 249] as [number, number, number],   // Slate-100 (Table headers/fills)
  slate50: [248, 250, 252] as [number, number, number],    // Slate-50 (Zebra rows)
  white: [255, 255, 255] as [number, number, number],

  // Semantic Financial Indicators
  green: [5, 150, 105] as [number, number, number],        // Emerald-600 (Income)
  greenBg: [236, 253, 245] as [number, number, number],   // Emerald-50
  greenBorder: [167, 243, 208] as [number, number, number],// Emerald-200

  red: [220, 38, 38] as [number, number, number],          // Rose-600 (Expense/Deficit)
  redBg: [254, 242, 242] as [number, number, number],      // Rose-50
  redBorder: [254, 205, 205] as [number, number, number],  // Rose-200

  purple: [124, 58, 237] as [number, number, number],      // Violet-600
  purpleBg: [245, 243, 255] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],        // Amber-600
  amberBg: [254, 243, 199] as [number, number, number],
  cyan: [8, 145, 178] as [number, number, number],         // Cyan-600
};

const CATEGORY_COLORS: Array<[number, number, number]> = [
  COLORS.brand,
  COLORS.green,
  COLORS.amber,
  COLORS.red,
  COLORS.purple,
  COLORS.cyan,
  [236, 72, 153], // Pink-500
  [249, 115, 22], // Orange-500
];

/* ─── Currency Symbol Resolver (Guaranteed PDF Compatibility) ─────────────── */
const pickCurrencySymbol = (currencyCode: string): string => {
  const sym = getCurrencySymbol(currencyCode);
  // Standard Type 1 PDF fonts do not support Indian Rupee sign U+20B9, which corrupts to '¹'
  if (sym === '₹' || currencyCode?.toUpperCase() === 'INR') {
    return 'Rs.';
  }
  return sym || '$';
};

const monthKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const formatTxDate = (dateVal: Date | string): string => {
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(dateVal);
  }
};

const getUserNameFromStorage = () => {
  if (typeof window === 'undefined') return 'User';
  try {
    const raw = localStorage.getItem('user_profile');
    if (!raw) return 'User';
    const parsed = JSON.parse(raw) as { name?: string; fullName?: string };
    return parsed.fullName || parsed.name || 'User';
  } catch {
    return 'User';
  }
};

/* ─── Professional PDF Statement Generator ─────────────────────────────────── */
export const buildStatementReportPdf = async (input: StatementReportInput): Promise<Blob> => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const symbol = pickCurrencySymbol(input.currencyCode);
  const contentWidth = PAGE.width - PAGE.marginX * 2;

  // Professional Currency Formatter with proper spacing & no character glitching
  const formatMoney = (amount: number, options?: { showSign?: boolean; abs?: boolean }) => {
    const num = Number.isFinite(amount) ? amount : 0;
    const isNeg = num < 0;
    const val = options?.abs ? Math.abs(num) : Math.abs(num);
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

    if (options?.showSign) {
      const sign = num > 0 ? '+ ' : num < 0 ? '- ' : '';
      return `${sign}${symbol} ${formatted}`.trim();
    }
    if (isNeg && !options?.abs) {
      return `- ${symbol} ${formatted}`;
    }
    return `${symbol} ${formatted}`;
  };

  const tx = [...input.transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const income = tx.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expense = tx.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const savings = income - expense;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const expenseByCategoryMap = new Map<string, number>();
  tx.filter((item) => item.type === 'expense').forEach((item) => {
    expenseByCategoryMap.set(item.category, (expenseByCategoryMap.get(item.category) || 0) + item.amount);
  });

  const expenseByCategory = Array.from(expenseByCategoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: expense > 0 ? (amount / expense) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const monthMap = new Map<string, { income: number; expense: number }>();
  tx.forEach((item) => {
    const key = monthKey(item.date);
    const bucket = monthMap.get(key) || { income: 0, expense: 0 };
    if (item.type === 'income') bucket.income += item.amount;
    if (item.type === 'expense') bucket.expense += item.amount;
    monthMap.set(key, bucket);
  });

  const monthlyRows = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, val]) => {
      const [year, month] = key.split('-').map(Number);
      return {
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: val.income,
        expense: val.expense,
        net: val.income - val.expense,
      };
    });

  let y = PAGE.marginTop;
  const bottomLimit = PAGE.height - PAGE.marginBottom;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage();
      y = PAGE.marginTop + 16;
    }
  };

  /* ─── Helper: Modern Section Title ─────────────────────────────────────── */
  const drawSectionTitle = (title: string, subtitle?: string, minNextRowsHeight = 60) => {
    // Prevent orphan headers by requiring enough room for the title + initial rows
    ensureSpace(32 + minNextRowsHeight);
    y += 10;

    // Indigo accent indicator bar
    pdf.setFillColor(...COLORS.brand);
    pdf.roundedRect(PAGE.marginX, y + 1, 3.5, 13, 1.5, 1.5, 'F');

    // Title text (Left-aligned)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...COLORS.slate900);
    pdf.text(title, PAGE.marginX + 10, y + 11);

    // Subtitle / context badge (Right-aligned, zero collision guarantee)
    if (subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.slate500);
      pdf.text(subtitle, PAGE.width - PAGE.marginX, y + 11, { align: 'right' });
    }

    y += 18;
    // Delicate divider line
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    y += 8;
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 1. EXECUTIVE HEADER & BRAND LETTERHEAD                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  // Top vibrant brand accent stripe
  pdf.setFillColor(...COLORS.brand);
  pdf.rect(0, 0, PAGE.width, 4, 'F');

  // Brand Name & Tagline
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(...COLORS.slate900);
  pdf.text('KANAKU', PAGE.marginX, y + 16);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.brand);
  pdf.text('FINANCIAL STATEMENT REPORT', PAGE.marginX, y + 28);

  // Right-side Period Badge & Generation Meta
  const periodText = `Period: ${input.reportPeriod}`;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const periodBadgeWidth = pdf.getTextWidth(periodText) + 16;
  const periodBadgeX = PAGE.width - PAGE.marginX - periodBadgeWidth;

  pdf.setFillColor(...COLORS.slate100);
  pdf.setDrawColor(...COLORS.slate200);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(periodBadgeX, y + 2, periodBadgeWidth, 18, 9, 9, 'FD');

  pdf.setTextColor(...COLORS.slate800);
  pdf.text(periodText, periodBadgeX + 8, y + 14);

  // Secondary right-side timestamp
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORS.slate500);
  const genDateStr = input.generatedAt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTimeStr = input.generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  pdf.text(`Generated on ${genDateStr} at ${genTimeStr} · Currency: ${input.currencyCode}`, PAGE.width - PAGE.marginX, y + 32, { align: 'right' });

  y += 44;

  // Header separator line
  pdf.setDrawColor(...COLORS.slate200);
  pdf.setLineWidth(0.75);
  pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
  y += 10;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 2. STATEMENT METADATA RIBBON CARD                                      */
  /* ═══════════════════════════════════════════════════════════════════════ */
  const metaHeight = 36;
  pdf.setFillColor(...COLORS.slate50);
  pdf.setDrawColor(...COLORS.slate200);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(PAGE.marginX, y, contentWidth, metaHeight, 6, 6, 'FD');

  const metaColW = contentWidth / 4;
  const metaItems = [
    { label: 'PREPARED FOR', value: input.userName || 'Account Holder' },
    { label: 'STATEMENT HORIZON', value: input.reportPeriod },
    { label: 'TRANSACTIONS', value: `${tx.length} Records` },
    { label: 'FINANCIAL STATUS', value: savings >= 0 ? 'Surplus (+)' : 'Deficit (-)', isStatus: true },
  ];

  metaItems.forEach((item, idx) => {
    const colX = PAGE.marginX + idx * metaColW + 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.slate500);
    pdf.text(item.label, colX, y + 13);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    if (item.isStatus) {
      pdf.setTextColor(...(savings >= 0 ? COLORS.green : COLORS.red));
    } else {
      pdf.setTextColor(...COLORS.slate800);
    }
    pdf.text(item.value, colX, y + 26);

    // Subtle column divider
    if (idx < 3) {
      pdf.setDrawColor(...COLORS.slate200);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX + (idx + 1) * metaColW, y + 6, PAGE.marginX + (idx + 1) * metaColW, y + metaHeight - 6);
    }
  });

  y += metaHeight + 8;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 3. FINANCIAL SUMMARY EXECUTIVE KPI CARDS                               */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Executive Financial Summary', 'Core Cash Flow & Efficiency', 70);

  const summaryItems = [
    {
      label: 'TOTAL INFLOW',
      value: formatMoney(income),
      subtext: 'Recorded period income',
      color: COLORS.green,
      bgColor: COLORS.greenBg,
      borderColor: COLORS.greenBorder,
    },
    {
      label: 'TOTAL OUTFLOW',
      value: formatMoney(expense),
      subtext: 'Recorded period expenses',
      color: COLORS.red,
      bgColor: COLORS.redBg,
      borderColor: COLORS.redBorder,
    },
    {
      label: 'NET CASH FLOW',
      value: formatMoney(savings, { showSign: true }),
      subtext: savings >= 0 ? 'Net period surplus' : 'Net period deficit',
      color: savings >= 0 ? COLORS.green : COLORS.red,
      bgColor: savings >= 0 ? COLORS.greenBg : COLORS.redBg,
      borderColor: savings >= 0 ? COLORS.greenBorder : COLORS.redBorder,
    },
    {
      label: 'SAVINGS RATE',
      value: `${savingsRate.toFixed(1)}%`,
      subtext: 'Income retention rate',
      color: COLORS.brand,
      bgColor: COLORS.brandLight,
      borderColor: COLORS.brandBorder,
    },
  ];

  const cardWidth = (contentWidth - 18) / 4;
  const cardHeight = 64;
  ensureSpace(cardHeight + 10);

  summaryItems.forEach((item, idx) => {
    const cardX = PAGE.marginX + idx * (cardWidth + 6);

    // Card background with rounded contour
    pdf.setFillColor(...item.bgColor);
    pdf.setDrawColor(...item.borderColor);
    pdf.setLineWidth(0.6);
    pdf.roundedRect(cardX, y, cardWidth, cardHeight, 6, 6, 'FD');

    // Indicator Dot
    pdf.setFillColor(...item.color);
    pdf.circle(cardX + 10, y + 13, 2.5, 'F');

    // Header Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate500);
    pdf.text(item.label, cardX + 17, y + 15);

    // Main Amount Value
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.setTextColor(...item.color);
    pdf.text(item.value, cardX + 10, y + 36);

    // Subtitle Note
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.slate500);
    pdf.text(item.subtext, cardX + 10, y + 51);
  });

  y += cardHeight + 12;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 4. EXPENSE CATEGORY BREAKDOWN TABLE                                   */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (expenseByCategory.length > 0) {
    drawSectionTitle('Expense Category Breakdown', `Top ${expenseByCategory.length} spend categories`, 65);

    const catColX = [
      PAGE.marginX,
      PAGE.marginX + 24,
      PAGE.marginX + 190,
      PAGE.marginX + 320,
      PAGE.marginX + 410,
    ];
    const catColW = [24, 166, 130, 90, contentWidth - 410];
    const tableHeaderH = 20;
    const tableRowH = 22;

    ensureSpace(tableHeaderH + tableRowH * 2);

    // Professional Soft Slate Header
    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, tableHeaderH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('#', catColX[0] + 8, y + 13);
    pdf.text('CATEGORY', catColX[1], y + 13);
    pdf.text('AMOUNT SPENT', catColX[2] + catColW[2] - 12, y + 13, { align: 'right' });
    pdf.text('SHARE (%)', catColX[3] + catColW[3] - 12, y + 13, { align: 'right' });
    pdf.text('DISTRIBUTION', catColX[4] + 4, y + 13);

    y += tableHeaderH + 2;

    expenseByCategory.forEach((item, idx) => {
      ensureSpace(tableRowH);
      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

      // Alternating row zebra styling
      if (idx % 2 === 1) {
        pdf.setFillColor(...COLORS.slate50);
        pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
      }

      // Rank & Color Dot
      pdf.setFillColor(...color);
      pdf.circle(catColX[0] + 10, y + tableRowH / 2, 3, 'F');

      // Category Name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate800);
      pdf.text(item.category.slice(0, 24), catColX[1], y + 14);

      // Amount (Right-aligned)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate900);
      pdf.text(formatMoney(item.amount), catColX[2] + catColW[2] - 12, y + 14, { align: 'right' });

      // Share Percentage (Right-aligned)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.slate500);
      pdf.text(`${item.percent.toFixed(1)}%`, catColX[3] + catColW[3] - 12, y + 14, { align: 'right' });

      // Progress Bar with rounded track
      const barTrackX = catColX[4] + 4;
      const barTrackW = 90;
      const barH = 5;
      const barY = y + (tableRowH - barH) / 2;

      pdf.setFillColor(226, 232, 240);
      pdf.roundedRect(barTrackX, barY, barTrackW, barH, 2.5, 2.5, 'F');

      const filledW = Math.max(3, (item.percent / 100) * barTrackW);
      pdf.setFillColor(...color);
      pdf.roundedRect(barTrackX, barY, filledW, barH, 2.5, 2.5, 'F');

      // Thin bottom row border
      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX, y + tableRowH, PAGE.width - PAGE.marginX, y + tableRowH);

      y += tableRowH;
    });

    // Subtotal Row
    ensureSpace(tableRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('TOTAL CATEGORIZED EXPENSE', catColX[1], y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.red);
    pdf.text(formatMoney(expense), catColX[2] + catColW[2] - 12, y + 14, { align: 'right' });

    pdf.setTextColor(...COLORS.slate500);
    pdf.text('100.0%', catColX[3] + catColW[3] - 12, y + 14, { align: 'right' });

    y += tableRowH + 10;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 5. MONTHLY INCOME VS EXPENSE COMPARISON TABLE                          */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (monthlyRows.length > 0) {
    drawSectionTitle('Monthly Income vs Expense Trend', 'Historical Monthly Performance', 65);

    const monColX = [
      PAGE.marginX,
      PAGE.marginX + 150,
      PAGE.marginX + 270,
      PAGE.marginX + 390,
    ];
    const monColW = [150, 120, 120, contentWidth - 390];
    const tableHeaderH = 20;
    const tableRowH = 22;

    ensureSpace(tableHeaderH + tableRowH * 2);

    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, tableHeaderH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('MONTH / HORIZON', monColX[0] + 10, y + 13);
    pdf.text('TOTAL INCOME', monColX[1] + monColW[1] - 12, y + 13, { align: 'right' });
    pdf.text('TOTAL EXPENSE', monColX[2] + monColW[2] - 12, y + 13, { align: 'right' });
    pdf.text('NET CASH FLOW', monColX[3] + monColW[3] - 12, y + 13, { align: 'right' });

    y += tableHeaderH + 2;

    let totalMonIncome = 0;
    let totalMonExpense = 0;

    monthlyRows.forEach((row, idx) => {
      ensureSpace(tableRowH);
      totalMonIncome += row.income;
      totalMonExpense += row.expense;

      if (idx % 2 === 1) {
        pdf.setFillColor(...COLORS.slate50);
        pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate800);
      pdf.text(row.label, monColX[0] + 10, y + 14);

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.green);
      pdf.text(formatMoney(row.income), monColX[1] + monColW[1] - 12, y + 14, { align: 'right' });

      pdf.setTextColor(...COLORS.red);
      pdf.text(formatMoney(row.expense), monColX[2] + monColW[2] - 12, y + 14, { align: 'right' });

      pdf.setTextColor(...(row.net >= 0 ? COLORS.green : COLORS.red));
      pdf.text(formatMoney(row.net, { showSign: true }), monColX[3] + monColW[3] - 12, y + 14, { align: 'right' });

      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX, y + tableRowH, PAGE.width - PAGE.marginX, y + tableRowH);

      y += tableRowH;
    });

    // Summary Row
    ensureSpace(tableRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('CUMULATIVE TOTAL', monColX[0] + 10, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.green);
    pdf.text(formatMoney(totalMonIncome), monColX[1] + monColW[1] - 12, y + 14, { align: 'right' });

    pdf.setTextColor(...COLORS.red);
    pdf.text(formatMoney(totalMonExpense), monColX[2] + monColW[2] - 12, y + 14, { align: 'right' });

    const totalNet = totalMonIncome - totalMonExpense;
    pdf.setTextColor(...(totalNet >= 0 ? COLORS.green : COLORS.red));
    pdf.text(formatMoney(totalNet, { showSign: true }), monColX[3] + monColW[3] - 12, y + 14, { align: 'right' });

    y += tableRowH + 10;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 6. DETAILED TRANSACTION STATEMENT (PAGINATED WITH REPEATED HEADERS)    */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Detailed Transaction Statement', `${tx.length} Audited Entries`, 65);

  const txColX = [
    PAGE.marginX,
    PAGE.marginX + 76,
    PAGE.marginX + 184,
    PAGE.marginX + 360,
    PAGE.marginX + 430,
  ];
  const txColW = [76, 108, 176, 70, contentWidth - 430];
  const txHeaderH = 20;
  const txRowH = 22;

  const drawTxHeader = () => {
    ensureSpace(txHeaderH + txRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, txHeaderH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('DATE', txColX[0] + 8, y + 13);
    pdf.text('CATEGORY', txColX[1] + 4, y + 13);
    pdf.text('DESCRIPTION / NOTE', txColX[2] + 4, y + 13);
    pdf.text('TYPE', txColX[3] + 4, y + 13);
    pdf.text('AMOUNT', txColX[4] + txColW[4] - 8, y + 13, { align: 'right' });

    y += txHeaderH + 2;
  };

  drawTxHeader();

  tx.forEach((item, index) => {
    ensureSpace(txRowH);

    // Alternating zebra row
    if (index % 2 === 1) {
      pdf.setFillColor(...COLORS.slate50);
      pdf.rect(PAGE.marginX, y, contentWidth, txRowH, 'F');
    }

    const isExpense = item.type === 'expense';
    const displayAmount = (isExpense ? '- ' : '+ ') + formatMoney(item.amount, { abs: true });

    // Date (Formatted nicely as DD MMM YYYY)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate800);
    pdf.text(formatTxDate(item.date), txColX[0] + 8, y + 14);

    // Category
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate800);
    pdf.text((item.category || 'General').slice(0, 18), txColX[1] + 4, y + 14);

    // Description
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate500);
    pdf.text((item.description || '—').slice(0, 34), txColX[2] + 4, y + 14);

    // Type Badge Pill
    const badgeBg = isExpense ? COLORS.redBg : COLORS.greenBg;
    const badgeTextCol = isExpense ? COLORS.red : COLORS.green;
    const badgeBorderCol = isExpense ? COLORS.redBorder : COLORS.greenBorder;
    const typeLabel = isExpense ? 'Expense' : 'Income';

    pdf.setFillColor(...badgeBg);
    pdf.setDrawColor(...badgeBorderCol);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(txColX[3] + 2, y + 4, 46, 14, 3, 3, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...badgeTextCol);
    pdf.text(typeLabel, txColX[3] + 25, y + 13.5, { align: 'center' });

    // Amount (Right-aligned)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...(isExpense ? COLORS.red : COLORS.green));
    pdf.text(displayAmount, txColX[4] + txColW[4] - 8, y + 14, { align: 'right' });

    // Hairline bottom border
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, y + txRowH, PAGE.width - PAGE.marginX, y + txRowH);

    y += txRowH;

    // Automatic page break with header repetition
    if (y + txRowH > bottomLimit) {
      pdf.addPage();
      y = PAGE.marginTop + 16;
      drawTxHeader();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 7. ACCOUNT BALANCES SUMMARY (IF PRESENT)                              */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.accounts.length > 0) {
    y += 10;
    drawSectionTitle('Account Balances Summary', `${input.accounts.length} Authoritative Accounts`, 65);

    const acctRowH = 22;
    ensureSpace(22 + acctRowH * 2);

    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, 20, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('ACCOUNT NAME', PAGE.marginX + 10, y + 13);
    pdf.text('TYPE', PAGE.marginX + 260, y + 13);
    pdf.text('CURRENT BALANCE', PAGE.width - PAGE.marginX - 10, y + 13, { align: 'right' });

    y += 22;

    let totalLiquidBalance = 0;
    input.accounts.forEach((acct, idx) => {
      ensureSpace(acctRowH);
      const bal = Number(acct.balance) || 0;
      totalLiquidBalance += bal;

      if (idx % 2 === 1) {
        pdf.setFillColor(...COLORS.slate50);
        pdf.rect(PAGE.marginX, y, contentWidth, acctRowH, 'F');
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate800);
      pdf.text(acct.name || 'Account', PAGE.marginX + 10, y + 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.slate500);
      pdf.text((acct.type || 'Bank').toUpperCase(), PAGE.marginX + 260, y + 14);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...(bal >= 0 ? COLORS.slate900 : COLORS.red));
      pdf.text(formatMoney(bal), PAGE.width - PAGE.marginX - 10, y + 14, { align: 'right' });

      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX, y + acctRowH, PAGE.width - PAGE.marginX, y + acctRowH);

      y += acctRowH;
    });

    // Subtotal Row
    ensureSpace(acctRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.rect(PAGE.marginX, y, contentWidth, acctRowH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('TOTAL AUTHORITATIVE BALANCE', PAGE.marginX + 10, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.slate900);
    pdf.text(formatMoney(totalLiquidBalance), PAGE.width - PAGE.marginX - 10, y + 14, { align: 'right' });

    y += acctRowH + 10;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 8. GOALS PROGRESS TRACKER (IF PRESENT)                                */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.goals.length > 0) {
    y += 10;
    drawSectionTitle('Financial Goals Tracking', `${input.goals.length} Active Targets`, 40);

    const goals = input.goals.slice(0, 8);
    goals.forEach((goal) => {
      ensureSpace(38);
      const progress = goal.targetAmount > 0 ? clampPercent((goal.currentAmount / goal.targetAmount) * 100) : 0;
      const progressCol = progress >= 80 ? COLORS.green : progress >= 40 ? COLORS.brand : COLORS.amber;
      const progressBg = progress >= 80 ? COLORS.greenBg : progress >= 40 ? COLORS.brandLight : COLORS.amberBg;

      // Goal Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate900);
      pdf.text(goal.name, PAGE.marginX, y + 10);

      // Percentage Pill Badge
      const progressText = `${progress.toFixed(0)}%`;
      const nameW = pdf.getTextWidth(goal.name);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      const badgeW = pdf.getTextWidth(progressText) + 10;
      const badgeX = PAGE.marginX + nameW + 8;
      pdf.setFillColor(...progressBg);
      pdf.roundedRect(badgeX, y + 1, badgeW, 11, 2.5, 2.5, 'F');
      pdf.setTextColor(...progressCol);
      pdf.text(progressText, badgeX + 5, y + 8.5);

      // Target & Saved Amounts (Right-aligned)
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.slate500);
      const amountsStr = `Saved: ${formatMoney(goal.currentAmount)} of ${formatMoney(goal.targetAmount)}`;
      pdf.text(amountsStr, PAGE.width - PAGE.marginX, y + 10, { align: 'right' });

      // Sleek Full-Width Progress bar
      const barTrackW = contentWidth;
      const barH = 5;
      const barY = y + 16;

      pdf.setFillColor(226, 232, 240);
      pdf.roundedRect(PAGE.marginX, barY, barTrackW, barH, 2.5, 2.5, 'F');

      const filledW = Math.max(3, (progress / 100) * barTrackW);
      pdf.setFillColor(...progressCol);
      pdf.roundedRect(PAGE.marginX, barY, filledW, barH, 2.5, 2.5, 'F');

      y += 28;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 9. LOANS & LIABILITIES OVERVIEW (IF PRESENT)                          */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.loans && input.loans.length > 0) {
    y += 10;
    drawSectionTitle('Loans & Liabilities Overview', `${input.loans.length} Recorded Portfolios`, 65);

    const loanColX = [
      PAGE.marginX,
      PAGE.marginX + 160,
      PAGE.marginX + 250,
      PAGE.marginX + 370,
    ];
    const loanColW = [160, 90, 120, contentWidth - 370];
    const tableHeaderH = 20;
    const tableRowH = 22;

    ensureSpace(tableHeaderH + tableRowH * 2);

    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, tableHeaderH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('LOAN / LIABILITY', loanColX[0] + 10, y + 13);
    pdf.text('TYPE', loanColX[1], y + 13);
    pdf.text('PRINCIPAL', loanColX[2] + loanColW[2] - 12, y + 13, { align: 'right' });
    pdf.text('OUTSTANDING', loanColX[3] + loanColW[3] - 12, y + 13, { align: 'right' });

    y += tableHeaderH + 2;

    let totalOutstanding = 0;
    input.loans.slice(0, 8).forEach((loan, idx) => {
      ensureSpace(tableRowH);
      const outBal = Number(loan.outstandingBalance) || 0;
      totalOutstanding += outBal;

      if (idx % 2 === 1) {
        pdf.setFillColor(...COLORS.slate50);
        pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate800);
      pdf.text((loan.name || 'Loan').slice(0, 24), loanColX[0] + 10, y + 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COLORS.slate500);
      pdf.text((loan.type || 'Loan').toUpperCase(), loanColX[1], y + 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate700);
      pdf.text(formatMoney(loan.principalAmount || 0), loanColX[2] + loanColW[2] - 12, y + 14, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.red);
      pdf.text(formatMoney(outBal), loanColX[3] + loanColW[3] - 12, y + 14, { align: 'right' });

      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX, y + tableRowH, PAGE.width - PAGE.marginX, y + tableRowH);

      y += tableRowH;
    });

    // Subtotal Row
    ensureSpace(tableRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('TOTAL OUTSTANDING BALANCE', loanColX[0] + 10, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.red);
    pdf.text(formatMoney(totalOutstanding), loanColX[3] + loanColW[3] - 12, y + 14, { align: 'right' });

    y += tableRowH + 10;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 10. INVESTMENT PORTFOLIO SUMMARY (IF PRESENT)                         */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.investments && input.investments.length > 0) {
    y += 10;
    drawSectionTitle('Investment Portfolio Summary', `${input.investments.length} Assets Held`, 65);

    const invColX = [
      PAGE.marginX,
      PAGE.marginX + 150,
      PAGE.marginX + 240,
      PAGE.marginX + 350,
      PAGE.marginX + 440,
    ];
    const invColW = [150, 90, 110, 90, contentWidth - 440];
    const tableHeaderH = 20;
    const tableRowH = 22;

    ensureSpace(tableHeaderH + tableRowH * 2);

    pdf.setFillColor(...COLORS.slate100);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(PAGE.marginX, y, contentWidth, tableHeaderH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('ASSET NAME', invColX[0] + 10, y + 13);
    pdf.text('TYPE', invColX[1], y + 13);
    pdf.text('INVESTED', invColX[2] + invColW[2] - 12, y + 13, { align: 'right' });
    pdf.text('CURRENT VALUE', invColX[3] + invColW[3] - 12, y + 13, { align: 'right' });
    pdf.text('GAIN / LOSS', invColX[4] + invColW[4] - 8, y + 13, { align: 'right' });

    y += tableHeaderH + 2;

    let totalInvested = 0;
    let totalCurVal = 0;
    input.investments.slice(0, 8).forEach((inv, idx) => {
      ensureSpace(tableRowH);
      const invested = Number(inv.totalInvested) || 0;
      const curVal = Number(inv.currentValue) || 0;
      const gainLoss = curVal - invested;
      totalInvested += invested;
      totalCurVal += curVal;

      if (idx % 2 === 1) {
        pdf.setFillColor(...COLORS.slate50);
        pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate800);
      pdf.text((inv.assetName || 'Asset').slice(0, 22), invColX[0] + 10, y + 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COLORS.slate500);
      pdf.text((inv.assetType || 'Other').toUpperCase(), invColX[1], y + 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.slate700);
      pdf.text(formatMoney(invested), invColX[2] + invColW[2] - 12, y + 14, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.slate900);
      pdf.text(formatMoney(curVal), invColX[3] + invColW[3] - 12, y + 14, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...(gainLoss >= 0 ? COLORS.green : COLORS.red));
      pdf.text(formatMoney(gainLoss, { showSign: true }), invColX[4] + invColW[4] - 8, y + 14, { align: 'right' });

      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.5);
      pdf.line(PAGE.marginX, y + tableRowH, PAGE.width - PAGE.marginX, y + tableRowH);

      y += tableRowH;
    });

    // Subtotal Row
    ensureSpace(tableRowH);
    pdf.setFillColor(...COLORS.slate100);
    pdf.rect(PAGE.marginX, y, contentWidth, tableRowH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.slate700);
    pdf.text('TOTAL PORTFOLIO VALUATION', invColX[0] + 10, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.slate900);
    pdf.text(formatMoney(totalCurVal), invColX[3] + invColW[3] - 12, y + 14, { align: 'right' });

    const totalGainLoss = totalCurVal - totalInvested;
    pdf.setTextColor(...(totalGainLoss >= 0 ? COLORS.green : COLORS.red));
    pdf.text(formatMoney(totalGainLoss, { showSign: true }), invColX[4] + invColW[4] - 8, y + 14, { align: 'right' });

    y += tableRowH + 10;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* 9. GLOBAL FOOTER ON ALL PAGES                                         */
  /* ═══════════════════════════════════════════════════════════════════════ */
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    // Hairline rule above footer
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, PAGE.height - 28, PAGE.width - PAGE.marginX, PAGE.height - 28);

    // Footer Text (Left: Brand & Confidential, Right: Page X of Y - zero collision)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.slate400);
    pdf.text('KANAKU Financial Operating System · Confidential Financial Statement', PAGE.marginX, PAGE.height - 16);
    pdf.text(`Page ${i} of ${totalPages}`, PAGE.width - PAGE.marginX, PAGE.height - 16, { align: 'right' });
  }

  return pdf.output('blob');
};

export const buildStatementReportInput = (params: Omit<StatementReportInput, 'userName'> & { userName?: string }): StatementReportInput => ({
  ...params,
  userName: params.userName || getUserNameFromStorage(),
});
