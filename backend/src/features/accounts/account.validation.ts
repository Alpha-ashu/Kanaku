import { z } from '../../middleware/validate';
import { containsSqlInjection } from '../../utils/sanitize';

/** Short label that must not contain SQL-injection signatures. */
const safeLabel = (max: number, min = 0) => {
  let base = z.string().trim().max(max);
  if (min > 0) base = base.min(min);
  return base.refine((v) => !containsSqlInjection(v), {
    message: 'Input contains disallowed characters',
  });
};

export const accountCreateSchema = z.object({
  name: safeLabel(120, 1),
  type: safeLabel(60, 1),
  provider: safeLabel(120).optional(),
  country: safeLabel(60).optional(),
  balance: z.coerce.number().finite().optional(),
  currency: z.string().trim().length(3, 'Currency must be a 3-letter ISO code').optional(),
  clientRequestId: z.string().trim().optional(),
});

export const accountUpdateSchema = accountCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const accountIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Account ID is required'),
});

