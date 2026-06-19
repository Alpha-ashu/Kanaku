import { z } from '../../middleware/validate';
import { containsSqlInjection } from '../../utils/sanitize';

/**
 * Maximum values that still fit the database column types.
 * `User.salary` is Decimal(12, 2) → max 9,999,999,999.99.
 * We bound the ANNUAL figure to 1,000,000,000 (1 billion) which is far
 * beyond any realistic income while leaving headroom under the column
 * limit, preventing the numeric-overflow 500 seen during onboarding.
 */
export const MAX_ANNUAL_INCOME = 1_000_000_000; // 1 billion / year
export const MAX_MONTHLY_INCOME = Math.floor(MAX_ANNUAL_INCOME / 12); // ~83.3 million / month

/**
 * Short free-text field: trimmed, length-bounded, and rejected if it
 * contains SQL-injection signatures. Used for names, location, etc.
 */
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !containsSqlInjection(v), {
      message: 'Input contains disallowed characters',
    });

export const updateProfileSchema = z
  .object({
    firstName: safeText(80).optional(),
    lastName: safeText(80).optional(),
    name: safeText(160).optional(),
    fullName: safeText(160).optional(),
    gender: z
      .enum(['male', 'female', 'non-binary', 'prefer-not-to-say', ''])
      .optional(),
    country: safeText(80).optional(),
    state: safeText(80).optional(),
    city: safeText(80).optional(),
    language: safeText(40).optional(),
    jobType: safeText(80).optional(),
    avatarId: safeText(120).optional(),
    // Avatar URL may be absolute (DiceBear) or a relative asset path, so we
    // bound the length and strip injection rather than enforce a strict URL.
    avatarUrl: safeText(2048).optional(),
    phone: z.string().trim().max(20).optional(),
    mobile: z.string().trim().max(20).optional(),
    dateOfBirth: z
      .string()
      .trim()
      .max(40)
      .optional()
      .or(z.literal('')),
    // Monetary fields are server-authoritative: coerce, require finite,
    // non-negative, and clamp to the column-safe maximum.
    monthlyIncome: z.coerce
      .number()
      .finite()
      .min(0)
      .max(MAX_MONTHLY_INCOME, `Monthly income cannot exceed ${MAX_MONTHLY_INCOME}`)
      .optional(),
    salary: z.coerce
      .number()
      .finite()
      .min(0)
      .max(MAX_ANNUAL_INCOME, `Salary cannot exceed ${MAX_ANNUAL_INCOME}`)
      .optional(),
  })
  .strip();

