import { z } from 'zod';

const id = z.string().trim().min(1).max(100);
const key = z.string().trim().min(8, 'A request key is required').max(200);

export const idParamSchema = z.object({ id }).passthrough();
export const userIdParamSchema = z.object({ userId: id }).passthrough();

export const ledgerQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  type: z.string().max(40).optional(),
}).passthrough();

export const createPurchaseSchema = z.object({
  packageId: id,
  provider: z.enum(['razorpay', 'phonepe', 'paytm', 'sandbox']).optional(),
  clientRequestId: key,
});

export const verifyPurchaseSchema = z.object({
  // The provider's checkout result, relayed by the browser. Only its signature
  // is trusted, and only after re-checking with the provider's API.
  payload: z.record(z.string(), z.union([z.string().max(500), z.number()])),
});

export const sandboxPaySchema = z.object({ outcome: z.enum(['paid', 'failed']).default('paid') });

// ─── Withdrawals ───────────────────────────────────────────────────────────────

/** name@bank — case-insensitive, so stored lower-case. */
const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;
/** 4 letters (bank), a zero, 6 letters/digits (branch). */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const payoutMethodSchema = z.object({
  details: z.discriminatedUnion('method', [
    z.object({
      method: z.literal('UPI'),
      upiId: z.string().trim().toLowerCase().max(300).regex(UPI_ID, 'Enter a valid UPI ID, like name@bank'),
    }),
    z.object({
      method: z.literal('BANK'),
      accountHolder: z.string().trim().min(2, 'Enter the account holder name').max(100).regex(/^[\p{L} .'-]+$/u, 'Use letters only for the account holder name'),
      accountNumber: z.string().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{9,18}$/, 'Account numbers have 9 to 18 digits')),
      ifsc: z.string().trim().toUpperCase().regex(IFSC, 'Enter a valid 11-character IFSC code'),
    }),
  ]),
  // Checked by verifyStepUp (password or a consumed email code).
  proof: z.unknown().optional(),
});

export const createWithdrawalSchema = z.object({
  coins: z.number().int('Whole coins only').min(1).max(10_000_000),
  clientRequestId: key,
});

// ─── Admin ─────────────────────────────────────────────────────────────────────

export const adminLedgerQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  userId: z.string().max(100).optional(),
  type: z.string().max(40).optional(),
  bookingId: z.string().max(100).optional(),
  paymentOrderId: z.string().max(100).optional(),
  reference: z.string().max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export const adminOrdersQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED']).optional(),
  provider: z.string().max(40).optional(),
  userId: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export const adminWalletsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).passthrough();

export const adjustSchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500),
  clientRequestId: key,
});

export const walletStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN']),
  reason: z.string().trim().min(5).max(500),
});

export const refundOrderSchema = z.object({ reason: z.string().trim().min(5).max(500) });

export const refundBookingSchema = z.object({
  percent: z.number().int().min(0).max(100).default(100),
  reason: z.string().trim().min(5).max(500),
});

export const packageCreateSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, 'Use 3–40 lowercase letters, digits or dashes'),
  name: z.string().trim().min(2).max(60),
  coins: z.number().int().min(1).max(1_000_000),
  bonusCoins: z.number().int().min(0).max(1_000_000).default(0),
  priceMinor: z.number().int().min(100).max(10_000_000),
  currency: z.literal('INR').default('INR'),
  isActive: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const packageUpdateSchema = packageCreateSchema.omit({ code: true }).partial();

export const webhookEventsQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['RECEIVED', 'PROCESSED', 'IGNORED', 'REJECTED', 'FAILED']).optional(),
  provider: z.string().max(40).optional(),
}).passthrough();

export const securityEventsQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().max(80).optional(),
  userId: z.string().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export const adminWithdrawalsQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED', 'OPEN']).optional(),
  userId: z.string().max(100).optional(),
}).passthrough();

export const withdrawalPaidSchema = z.object({
  payoutReference: z.string().trim().min(4, 'Enter the UTR / UPI reference').max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/, 'Use letters, digits, spaces, dots, dashes or slashes'),
  note: z.string().trim().max(500).optional(),
});

export const withdrawalRejectSchema = z.object({ reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500) });

export const staffPermissionsSchema = z.object({
  permissions: z.array(z.string().max(60)).max(30),
});

export const staffAssignmentSchema = z.object({ subjectUserId: id });

export const staffAssignmentParamSchema = z.object({ managerId: id, subjectUserId: id }).passthrough();
export const managerParamSchema = z.object({ managerId: id }).passthrough();
