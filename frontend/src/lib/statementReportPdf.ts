import { jsPDF } from 'jspdf';
import { Account, Goal, Investment, Loan, Transaction } from '@/lib/database';
import { formatLocalDate } from '@/lib/dateUtils';

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

import { getCurrencySymbol } from '@/lib/currencyUtils';

/* ─── Page Layout Constants ────────────────────────────────────────────────── */
const PAGE = {
  width: 595,
  height: 842,
  marginX: 40,
  marginTop: 42,
  marginBottom: 56,
};

/* ─── Color Palette ────────────────────────────────────────────────────────── */
const COLORS = {
  brand: [99, 102, 241] as [number, number, number],       // Indigo-500
  dark: [15, 23, 42] as [number, number, number],          // Slate-900
  text: [30, 41, 59] as [number, number, number],          // Slate-800
  secondary: [100, 116, 139] as [number, number, number],  // Slate-500
  light: [241, 245, 249] as [number, number, number],      // Slate-100
  white: [255, 255, 255] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],       // Emerald-500
  red: [239, 68, 68] as [number, number, number],          // Rose-500
  purple: [139, 92, 246] as [number, number, number],      // Violet-500
  amber: [245, 158, 11] as [number, number, number],       // Amber-500
  cyan: [6, 182, 212] as [number, number, number],         // Cyan-500
  pink: [236, 72, 153] as [number, number, number],        // Pink-500
};

const CATEGORY_COLORS: Array<[number, number, number]> = [
  COLORS.brand, COLORS.green, COLORS.amber, COLORS.red, COLORS.purple, COLORS.cyan, COLORS.pink,
  [249, 115, 22], // Orange-500
];

const pickCurrencySymbol = (currencyCode: string) => {
  return getCurrencySymbol(currencyCode);
};

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

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

/* ─── PDF Builder ──────────────────────────────────────────────────────────── */
export const buildStatementReportPdf = async (input: StatementReportInput): Promise<Blob> => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const symbol = pickCurrencySymbol(input.currencyCode);
  const formatMoney = (amount: number) => `${symbol} ${numberFormatter.format(Number.isFinite(amount) ? amount : 0)}`;
  const contentWidth = PAGE.width - PAGE.marginX * 2;

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
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
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
      y = PAGE.marginTop;
    }
  };

  /* ─── Helper: Section Title ──────────────────────────────────────────── */
  const drawSectionTitle = (title: string) => {
    ensureSpace(38);
    y += 8;
    // Indigo accent bar
    pdf.setFillColor(...COLORS.brand);
    pdf.rect(PAGE.marginX, y, 3, 16, 'F');
    // Title text
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...COLORS.dark);
    pdf.text(title, PAGE.marginX + 12, y + 12);
    y += 28;
    // Separator line
    pdf.setDrawColor(...COLORS.light);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    y += 10;
  };

  /* ─── Helper: Key-Value Row ──────────────────────────────────────────── */
  const drawKvRow = (label: string, value: string) => {
    ensureSpace(16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text(label, PAGE.marginX + 12, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.text);
    pdf.text(value, 210, y);
    y += 16;
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* PAGE 1: BRANDED HEADER                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  // Brand bar
  pdf.setFillColor(...COLORS.dark);
  pdf.rect(0, 0, PAGE.width, 80, 'F');

  // Brand name
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(...COLORS.white);
  pdf.text('KANAKU', PAGE.marginX, 36);

  // Subtitle
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(148, 163, 184); // Slate-400
  pdf.text('Financial Statement Report', PAGE.marginX, 54);

  // Right-side metadata
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  pdf.text(input.generatedAt.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }), PAGE.width - PAGE.marginX, 36, { align: 'right' });
  pdf.text(`${input.currencyCode} · ${input.reportPeriod}`, PAGE.width - PAGE.marginX, 50, { align: 'right' });

  y = 100;

  // Report metadata
  drawKvRow('Prepared for:', input.userName);
  drawKvRow('Report Period:', input.reportPeriod);
  drawKvRow('Generated on:', input.generatedAt.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }) + ' at ' + input.generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));

  y += 10;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* FINANCIAL SUMMARY CARD                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Financial Summary');

  const summaryItems = [
    { label: 'Total Income', value: formatMoney(income), color: COLORS.green },
    { label: 'Total Expenses', value: formatMoney(expense), color: COLORS.red },
    { label: 'Net Savings', value: formatMoney(savings), color: savings >= 0 ? COLORS.green : COLORS.red },
    { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, color: COLORS.brand },
  ];

  const cardWidth = (contentWidth - 18) / 4;
  const cardHeight = 62;
  ensureSpace(cardHeight + 10);

  summaryItems.forEach((item, idx) => {
    const x = PAGE.marginX + idx * (cardWidth + 6);

    // Card background
    pdf.setFillColor(...COLORS.light);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 6, 6, 'FD');

    // Color accent dot
    pdf.setFillColor(...item.color);
    pdf.circle(x + 12, y + 16, 3, 'F');

    // Label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text(item.label, x + 20, y + 18);

    // Value
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...COLORS.dark);
    pdf.text(item.value, x + 10, y + 42);
  });
  y += cardHeight + 16;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* EXPENSE CATEGORY TABLE WITH PROGRESS BARS                             */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Expense Category Breakdown');

  // Table Header
  const catColX = [PAGE.marginX, PAGE.marginX + 22, PAGE.marginX + 180, PAGE.marginX + 310, PAGE.marginX + 420];
  const rowH = 24;

  ensureSpace(rowH + 4);
  pdf.setFillColor(...COLORS.dark);
  pdf.roundedRect(PAGE.marginX, y - 2, contentWidth, rowH, 4, 4, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.white);
  pdf.text('#', catColX[0] + 6, y + 12);
  pdf.text('Category', catColX[1], y + 12);
  pdf.text('Amount', catColX[2], y + 12);
  pdf.text('Share', catColX[3], y + 12);
  pdf.text('Distribution', catColX[4], y + 12);
  y += rowH + 2;

  expenseByCategory.forEach((item, idx) => {
    ensureSpace(rowH + 4);
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    // Alternating row background
    if (idx % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(PAGE.marginX, y - 4, contentWidth, rowH, 'F');
    }

    // Color dot
    pdf.setFillColor(...color);
    pdf.circle(catColX[0] + 8, y + 8, 4, 'F');

    // Category name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.text);
    pdf.text(item.category.slice(0, 22), catColX[1], y + 11);

    // Amount
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(formatMoney(item.amount), catColX[2], y + 11);

    // Percentage
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text(`${item.percent.toFixed(1)}%`, catColX[3], y + 11);

    // Progress bar
    const barX = catColX[4];
    const barWidth = 80;
    const barHeight = 6;
    const barY = y + 5;

    pdf.setFillColor(226, 232, 240);
    pdf.roundedRect(barX, barY, barWidth, barHeight, 3, 3, 'F');
    const filledWidth = Math.max(2, (item.percent / 100) * barWidth);
    pdf.setFillColor(...color);
    pdf.roundedRect(barX, barY, filledWidth, barHeight, 3, 3, 'F');

    y += rowH;
  });

  y += 8;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* MONTHLY INCOME VS EXPENSE TABLE                                       */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Monthly Income vs Expense');

  const monColX = [PAGE.marginX, PAGE.marginX + 160, PAGE.marginX + 280, PAGE.marginX + 400];

  ensureSpace(rowH + 4);
  pdf.setFillColor(...COLORS.dark);
  pdf.roundedRect(PAGE.marginX, y - 2, contentWidth, rowH, 4, 4, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.white);
  pdf.text('Month', monColX[0] + 10, y + 12);
  pdf.text('Income', monColX[1], y + 12);
  pdf.text('Expense', monColX[2], y + 12);
  pdf.text('Net', monColX[3], y + 12);
  y += rowH + 2;

  let totalMonIncome = 0;
  let totalMonExpense = 0;

  monthlyRows.forEach((row, idx) => {
    ensureSpace(rowH + 4);
    totalMonIncome += row.income;
    totalMonExpense += row.expense;

    if (idx % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(PAGE.marginX, y - 4, contentWidth, rowH, 'F');
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.text);
    pdf.text(row.label, monColX[0] + 10, y + 11);

    pdf.setTextColor(...COLORS.green);
    pdf.text(formatMoney(row.income), monColX[1], y + 11);

    pdf.setTextColor(...COLORS.red);
    pdf.text(formatMoney(row.expense), monColX[2], y + 11);

    const netColor = row.net >= 0 ? COLORS.green : COLORS.red;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...netColor);
    pdf.text(`${row.net >= 0 ? '+' : ''}${formatMoney(row.net)}`, monColX[3], y + 11);

    y += rowH;
  });

  // Totals row
  if (monthlyRows.length > 0) {
    ensureSpace(rowH + 4);
    pdf.setFillColor(...COLORS.dark);
    pdf.rect(PAGE.marginX, y - 4, contentWidth, rowH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.white);
    pdf.text('TOTAL', monColX[0] + 10, y + 11);
    pdf.text(formatMoney(totalMonIncome), monColX[1], y + 11);
    pdf.text(formatMoney(totalMonExpense), monColX[2], y + 11);
    const totalNet = totalMonIncome - totalMonExpense;
    pdf.text(`${totalNet >= 0 ? '+' : ''}${formatMoney(totalNet)}`, monColX[3], y + 11);
    y += rowH + 8;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* DETAILED TRANSACTION STATEMENT — FULLY PAGINATED                      */
  /* ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle('Detailed Transaction Statement');

  const txColX = [PAGE.marginX, PAGE.marginX + 70, PAGE.marginX + 172, PAGE.marginX + 330, PAGE.marginX + 396];
  const txColW = [70, 102, 158, 66, contentWidth - 396];

  const drawTxHeader = () => {
    ensureSpace(rowH + 4);
    pdf.setFillColor(...COLORS.dark);
    pdf.roundedRect(PAGE.marginX, y - 2, contentWidth, rowH, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.white);
    const headers = ['Date', 'Category', 'Description', 'Type', 'Amount'];
    headers.forEach((header, idx) => {
      const alignRight = idx === 4;
      const textX = alignRight ? txColX[idx] + txColW[idx] - 10 : txColX[idx] + 6;
      pdf.text(header, textX, y + 12, { align: alignRight ? 'right' : 'left' });
    });
    y += rowH + 2;
  };

  drawTxHeader();

  // Render ALL transactions (paginated)
  tx.forEach((item, index) => {
    ensureSpace(rowH + 4);

    if (index % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(PAGE.marginX, y - 4, contentWidth, rowH, 'F');
    }

    const isExpense = item.type === 'expense';
    const amountSign = isExpense ? '-' : '+';
    const amountText = `${amountSign}${symbol} ${Math.abs(item.amount).toFixed(2)}`;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.text);
    pdf.text(formatLocalDate(item.date, 'en-US'), txColX[0] + 6, y + 11);
    pdf.text((item.category || '-').slice(0, 16), txColX[1] + 6, y + 11);
    pdf.text((item.description || '-').slice(0, 28), txColX[2] + 6, y + 11);

    // Type badge
    const badgeColor = isExpense ? COLORS.red : COLORS.green;
    pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2], 0.1);
    const typeText = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    const typeWidth = pdf.getTextWidth(typeText) + 10;
    pdf.roundedRect(txColX[3] + 2, y - 1, typeWidth, 16, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...badgeColor);
    pdf.text(typeText, txColX[3] + 7, y + 10);

    // Amount (right-aligned)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...(isExpense ? COLORS.red : COLORS.green));
    pdf.text(amountText, txColX[4] + txColW[4] - 10, y + 11, { align: 'right' });

    y += rowH;

    // Page break with repeated header
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      y = PAGE.marginTop;
      drawTxHeader();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* GOALS PROGRESS                                                        */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.goals.length > 0) {
    y += 10;
    drawSectionTitle('Goals Progress');
    const goals = input.goals.slice(0, 8);
    goals.forEach((goal) => {
      ensureSpace(50);
      const progress = goal.targetAmount > 0 ? clampPercent((goal.currentAmount / goal.targetAmount) * 100) : 0;

      // Goal name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...COLORS.dark);
      pdf.text(goal.name, PAGE.marginX, y);

      // Target & saved info
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.secondary);
      pdf.text(`Target: ${formatMoney(goal.targetAmount)}`, PAGE.marginX + 200, y);
      pdf.text(`Saved: ${formatMoney(goal.currentAmount)}`, PAGE.marginX + 360, y);
      y += 14;

      // Progress bar background
      const barWidth = 380;
      pdf.setFillColor(...COLORS.light);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(PAGE.marginX, y, barWidth, 10, 5, 5, 'FD');

      // Progress bar fill
      const fillWidth = Math.max(2, (barWidth * progress) / 100);
      const progressColor = progress >= 80 ? COLORS.green : progress >= 40 ? COLORS.brand : COLORS.amber;
      pdf.setFillColor(...progressColor);
      pdf.roundedRect(PAGE.marginX, y, fillWidth, 10, 5, 5, 'F');

      // Percentage text
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.text);
      pdf.text(`${progress.toFixed(0)}%`, PAGE.marginX + barWidth + 10, y + 8);
      y += 24;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ACCOUNTS SUMMARY                                                      */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (input.accounts.length > 0) {
    y += 10;
    drawSectionTitle('Account Balances');

    ensureSpace(rowH + 4);
    pdf.setFillColor(...COLORS.dark);
    pdf.roundedRect(PAGE.marginX, y - 2, contentWidth, rowH, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.white);
    pdf.text('Account Name', PAGE.marginX + 10, y + 12);
    pdf.text('Type', PAGE.marginX + 250, y + 12);
    pdf.text('Balance', PAGE.width - PAGE.marginX - 10, y + 12, { align: 'right' });
    y += rowH + 2;

    input.accounts.forEach((acct, idx) => {
      ensureSpace(rowH + 4);
      if (idx % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(PAGE.marginX, y - 4, contentWidth, rowH, 'F');
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...COLORS.text);
      pdf.text(acct.name || '-', PAGE.marginX + 10, y + 11);
      pdf.text(acct.type || '-', PAGE.marginX + 250, y + 11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatMoney(Number(acct.balance) || 0), PAGE.width - PAGE.marginX - 10, y + 11, { align: 'right' });

      y += rowH;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* FOOTER ON ALL PAGES                                                   */
  /* ═══════════════════════════════════════════════════════════════════════ */
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);

    // Footer separator
    pdf.setDrawColor(...COLORS.light);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, PAGE.height - 42, PAGE.width - PAGE.marginX, PAGE.height - 42);

    // Footer text
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text('Generated by KANAKU · Financial Operating System', PAGE.marginX, PAGE.height - 28);
    pdf.text('Confidential Financial Report', PAGE.width / 2, PAGE.height - 28, { align: 'center' });
    pdf.text(`Page ${i} of ${pages}`, PAGE.width - PAGE.marginX, PAGE.height - 28, { align: 'right' });
  }

  return pdf.output('blob');
};

export const buildStatementReportInput = (params: Omit<StatementReportInput, 'userName'> & { userName?: string }): StatementReportInput => ({
  ...params,
  userName: params.userName || getUserNameFromStorage(),
});
