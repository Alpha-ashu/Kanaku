import { z } from '../../middleware/validate';

export const loanCreateSchema = z.object({
  type: z.string().trim().min(1, 'Loan type is required').max(60),
  name: z.string().trim().min(1, 'Loan name is required').max(120),
  principalAmount: z.coerce.number().positive('Principal amount must be positive'),
  interestRate: z.coerce.number().min(0, 'Interest rate must be non-negative').optional(),
  emiAmount: z.coerce.number().min(0, 'EMI amount must be non-negative').optional(),
  dueDate: z.coerce.date().optional(),
  frequency: z.string().trim().max(40).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  clientRequestId: z.string().trim().optional(),
});

export const loanUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(60).optional(),
    principalAmount: z.coerce.number().positive().optional(),
    outstandingBalance: z.coerce.number().min(0).optional(),
    interestRate: z.coerce.number().min(0).optional(),
    emiAmount: z.coerce.number().min(0).optional(),
    dueDate: z.coerce.date().optional(),
    frequency: z.string().trim().max(40).optional(),
    contactPerson: z.string().trim().max(120).optional(),
    status: z.enum(['active', 'completed', 'defaulted']).optional(),
    syncStatus: z.string().trim().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

export const loanPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be positive'),
  accountId: z.string().trim().optional(),
  notes: z.string().trim().max(200).optional(),
});

export const loanIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Loan ID is required'),
});

