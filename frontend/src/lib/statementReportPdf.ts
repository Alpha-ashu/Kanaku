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

const PAGE = {
  width: 595,
  height: 842,
  marginX: 40,
  marginTop: 42,
  marginBottom: 56,
};

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

const createPieChartImage = (items: Array<{ label: string; value: number; color: string }>) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 460;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const centerX = 120;
  const centerY = 130;
  const radius = 78;

  let startAngle = -Math.PI / 2;
  items.forEach((item) => {
    const slice = total > 0 ? (item.value / total) * Math.PI * 2 : 0;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    startAngle += slice;
  });

  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(centerX, centerY, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#1f2937';
  ctx.fillText('Expense Mix', 64, 135);

  ctx.font = '12px Arial';
  items.forEach((item, index) => {
    const y = 46 + index * 34;
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
    ctx.fillStyle = item.color;
    ctx.fillRect(250, y - 8, 14, 14);
    ctx.fillStyle = '#111827';
    ctx.fillText(item.label, 272, y + 2);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`${pct}%`, 430, y + 2);
  });

  return canvas.toDataURL('image/jpeg', 0.82);
};

const createMonthlyBarChartImage = (rows: Array<{ month: string; income: number; expense: number }>) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const chartLeft = 52;
  const chartTop = 32;
  const chartWidth = 440;
  const chartHeight = 185;

  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.income, row.expense]));

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = chartTop + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
  }

  const groupWidth = chartWidth / Math.max(1, rows.length);
  rows.forEach((row, index) => {
    const xBase = chartLeft + index * groupWidth + 10;
    const incomeH = (row.income / maxValue) * chartHeight;
    const expenseH = (row.expense / maxValue) * chartHeight;

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(xBase, chartTop + chartHeight - incomeH, 16, incomeH);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(xBase + 20, chartTop + chartHeight - expenseH, 16, expenseH);

    ctx.fillStyle = '#374151';
    ctx.font = '11px Arial';
    ctx.fillText(row.month, xBase - 2, chartTop + chartHeight + 18);
  });

  ctx.fillStyle = '#22c55e';
  ctx.fillRect(360, 14, 10, 10);
  ctx.fillStyle = '#374151';
  ctx.font = '12px Arial';
  ctx.fillText('Income', 375, 23);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(430, 14, 10, 10);
  ctx.fillStyle = '#374151';
  ctx.fillText('Expense', 445, 23);

  return canvas.toDataURL('image/jpeg', 0.82);
};

export const buildStatementReportPdf = async (input: StatementReportInput): Promise<Blob> => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const symbol = pickCurrencySymbol(input.currencyCode);
  const formatMoney = (amount: number) => `${symbol} ${numberFormatter.format(Number.isFinite(amount) ? amount : 0)}`;

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
    .slice(0, 6);

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
        month: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        income: val.income,
        expense: val.expense,
      };
    });

  const pieColors = ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444'];
  const pieImage = createPieChartImage(
    expenseByCategory.map((item, index) => ({ label: item.category, value: item.amount, color: pieColors[index % pieColors.length] })),
  );
  const monthlyImage = createMonthlyBarChartImage(monthlyRows);

  let y = PAGE.marginTop;
  const bottomLimit = PAGE.height - PAGE.marginBottom;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage();
      y = PAGE.marginTop;
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(32);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(17, 24, 39);
    pdf.text(title, PAGE.marginX, y);
    y += 18;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    y += 14;
  };

  const drawKvRow = (label: string, value: string, rightAlign = false) => {
    ensureSpace(16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(55, 65, 81);
    pdf.text(label, PAGE.marginX, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(17, 24, 39);
    if (rightAlign) {
      pdf.text(value, PAGE.width - PAGE.marginX, y, { align: 'right' });
    } else {
      pdf.text(value, 210, y);
    }
    y += 16;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Finance Report Statement', PAGE.marginX, y);
  y += 24;

  drawKvRow('User:', input.userName);
  drawKvRow('Report Period:', input.reportPeriod);
  drawKvRow('Generated on:', input.generatedAt.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }));

  y += 8;
  drawSectionTitle('Financial Summary');

  const cardX = PAGE.marginX;
  const cardY = y;
  const cardW = PAGE.width - PAGE.marginX * 2;
  const cardH = 88;
  ensureSpace(cardH + 10);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(cardX, cardY, cardW, cardH, 8, 8, 'FD');

  const labels = ['Total Income', 'Total Expense', 'Total Savings', 'Savings Rate'];
  const values = [
    formatMoney(income),
    formatMoney(expense),
    formatMoney(savings),
    `${savingsRate.toFixed(1)}%`,
  ];

  labels.forEach((label, idx) => {
    const x = cardX + 14 + idx * (cardW / 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x, cardY + 24);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(values[idx], x, cardY + 46);
  });
  y += cardH + 16;

  drawSectionTitle('Expense Category Chart');
  ensureSpace(190);
  if (pieImage) {
    pdf.addImage(pieImage, 'JPEG', PAGE.marginX, y, 510, 180);
    y += 190;
  }

  drawSectionTitle('Monthly Income vs Expense');
  ensureSpace(200);
  if (monthlyImage) {
    pdf.addImage(monthlyImage, 'JPEG', PAGE.marginX, y, 510, 188);
    y += 198;
  }

  drawSectionTitle('Detailed Transaction Statement');
  const colX = [PAGE.marginX, 110, 198, 338, 406];
  const colW = [70, 88, 140, 62, 150];
  const rowHeight = 20;

  const drawTxHeader = () => {
    ensureSpace(26);
    pdf.setFillColor(243, 244, 246);
    pdf.rect(PAGE.marginX, y - 12, PAGE.width - PAGE.marginX * 2, rowHeight, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(31, 41, 55);
    ['Date', 'Category', 'Description', 'Type', 'Amount'].forEach((header, idx) => {
      const alignRight = idx === 4;
      const textX = alignRight ? colX[idx] + colW[idx] - 6 : colX[idx] + 4;
      pdf.text(header, textX, y + 1, { align: alignRight ? 'right' : 'left' });
    });
    y += rowHeight;
  };

  drawTxHeader();
  tx.slice(0, 45).forEach((item, index) => {
    ensureSpace(rowHeight + 4);
    if (index % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(PAGE.marginX, y - 12, PAGE.width - PAGE.marginX * 2, rowHeight, 'F');
    }

    const amountSign = item.type === 'expense' ? '-' : '+';
    const amountText = `${amountSign}${symbol} ${Math.abs(item.amount).toFixed(2)}`;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(17, 24, 39);
    pdf.text(formatLocalDate(item.date, 'en-US'), colX[0] + 4, y + 1);
    pdf.text(item.category || '-', colX[1] + 4, y + 1);
    pdf.text((item.description || '-').slice(0, 30), colX[2] + 4, y + 1);
    pdf.text(item.type, colX[3] + 4, y + 1);
    pdf.setFont('helvetica', 'bold');
    pdf.text(amountText, colX[4] + colW[4] - 6, y + 1, { align: 'right' });
    y += rowHeight;

    if (y + rowHeight > bottomLimit) {
      pdf.addPage();
      y = PAGE.marginTop;
      drawTxHeader();
    }
  });

  y += 10;
  drawSectionTitle('Category Spending Summary');

  ensureSpace(26);
  pdf.setFillColor(243, 244, 246);
  pdf.rect(PAGE.marginX, y - 12, PAGE.width - PAGE.marginX * 2, rowHeight, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Category', PAGE.marginX + 4, y + 1);
  pdf.text('Amount', PAGE.marginX + 340, y + 1);
  pdf.text('Percentage', PAGE.width - PAGE.marginX - 6, y + 1, { align: 'right' });
  y += rowHeight;

  expenseByCategory.forEach((item, idx) => {
    ensureSpace(rowHeight + 4);
    if (idx % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(PAGE.marginX, y - 12, PAGE.width - PAGE.marginX * 2, rowHeight, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(item.category, PAGE.marginX + 4, y + 1);
    pdf.text(formatMoney(item.amount), PAGE.marginX + 340, y + 1);
    pdf.text(`${item.percent.toFixed(1)}%`, PAGE.width - PAGE.marginX - 6, y + 1, { align: 'right' });
    y += rowHeight;
  });

  y += 10;
  drawSectionTitle('Goals Progress');
  const goals = input.goals.slice(0, 8);
  goals.forEach((goal) => {
    ensureSpace(42);
    const progress = goal.targetAmount > 0 ? clampPercent((goal.currentAmount / goal.targetAmount) * 100) : 0;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(17, 24, 39);
    pdf.text(`Goal: ${goal.name}`, PAGE.marginX, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Target: ${formatMoney(goal.targetAmount)}`, PAGE.marginX + 190, y);
    pdf.text(`Saved: ${formatMoney(goal.currentAmount)}`, PAGE.marginX + 340, y);
    y += 12;

    pdf.setDrawColor(229, 231, 235);
    pdf.setFillColor(243, 244, 246);
    pdf.roundedRect(PAGE.marginX, y, 360, 9, 4, 4, 'FD');
    pdf.setFillColor(37, 99, 235);
    pdf.roundedRect(PAGE.marginX, y, (360 * progress) / 100, 9, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(`${progress.toFixed(0)}%`, PAGE.marginX + 370, y + 7);
    y += 20;
  });

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(229, 231, 235);
    pdf.line(PAGE.marginX, PAGE.height - 40, PAGE.width - PAGE.marginX, PAGE.height - 40);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Generated by Finance Management App', PAGE.marginX, PAGE.height - 26);
    pdf.text('Confidential Financial Report', PAGE.width / 2, PAGE.height - 26, { align: 'center' });
    pdf.text(`Page ${i} of ${pages}`, PAGE.width - PAGE.marginX, PAGE.height - 26, { align: 'right' });
  }

  return pdf.output('blob');
};

export const buildStatementReportInput = (params: Omit<StatementReportInput, 'userName'> & { userName?: string }): StatementReportInput => ({
  ...params,
  userName: params.userName || getUserNameFromStorage(),
});
