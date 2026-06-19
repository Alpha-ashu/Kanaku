import { z } from '../../middleware/validate';

const TransactionTypeSchema = z.enum(['income', 'expense', 'transfer', 'withdrawal']);

const AmountSchema = z
  .coerce
  .number()
  .positive({ message: 'Amount must be greater than 0' })
  .max(999999999, { message: 'Amount exceeds maximum limit' })
  .transform((value) => Number(value.toFixed(2)));

const DateSchema = z.coerce.date();

export const transactionCreateSchema = z.object({
  accountId: z.string().trim().min(1, 'Account is required'),
  type: TransactionTypeSchema,
  amount: AmountSchema,
  category: z.string().trim().min(1, 'Category is required').max(80),
  subcategory: z.string().trim().max(80).optional(),
  description: z.string().trim().max(200).optional(),
  merchant: z.string().trim().max(120).optional(),
  date: DateSchema,
  tags: z.array(z.string().trim().max(40)).optional(),
  transferToAccountId: z.string().trim().min(1).optional(),
  transferType: z.enum(['self-transfer', 'other-transfer']).optional(),
  // Expense sub-feature fields
  expenseMode: z.enum(['individual', 'group', 'loan']).optional(),
  groupExpenseId: z.string().trim().min(1).optional(),
  groupName: z.string().trim().max(100).optional(),
  splitType: z.enum(['equal', 'custom']).optional(),
  // Loan sub-feature fields on transaction
  loanType: z.enum(['borrowed', 'lent']).optional(),
  contactName: z.string().trim().max(100).optional(),
  interestRate: z.coerce.number().min(0).max(100).optional(),
  loanCategory: z.string().trim().max(80).optional(),
  bankName: z.string().trim().max(100).optional(),
  tenureMonths: z.coerce.number().int().min(1).max(600).optional(),
  emiAmount: z.coerce.number().min(0).optional(),
  downPayment: z.coerce.number().min(0).optional(),
  receivedAccount: z.string().trim().optional(),
  emiDeductionAccountId: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const transactionCreateValidatedSchema = transactionCreateSchema.superRefine((data, ctx) => {
  if (data.type === 'transfer' && !data.transferToAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'transferToAccountId is required for transfer transactions',
      path: ['transferToAccountId'],
    });
  }
});

export const transactionUpdateSchema = transactionCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

// Accept ISO date strings (YYYY-MM-DD) or ISO datetimes for filter params
const DateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format. Use YYYY-MM-DD or ISO 8601' }
);

export const transactionQuerySchema = z.object({
  accountId: z.string().trim().min(1).optional(),
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
  category: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const transactionIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const transactionAccountParamSchema = z.object({
  accountId: z.string().trim().min(1),
});

/**
 * Bulk-create schema — used by the voice multi-intent flow (G.4) and
 * CSV/SMS import. Capped at 100 items per request to bound transactional
 * work and prevent abusive payloads.
 */
export const transactionBulkCreateSchema = z.object({
  transactions: z
    .array(transactionCreateValidatedSchema)
    .min(1, 'At least one transaction is required')
    .max(100, 'Bulk create accepts at most 100 transactions per request'),
});

