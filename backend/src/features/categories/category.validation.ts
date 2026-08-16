import { z } from '../../middleware/validate';

/**
 * Categories are user-owned taxonomy, not financial records: a name, a type, and
 * presentation (icon + colour). The DB enforces `@@unique([userId, name, type])`,
 * so "Groceries" can exist once as an expense and once as income.
 */
const categoryName = z.string().trim().min(1, 'Category name is required').max(60);
const categoryType = z.enum(['expense', 'income']);

// Hex colour, 3 or 6 digits. Kept permissive on case so #FFF and #fff both pass.
const categoryColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colour must be a hex value like #4F46E5');

// Icon is a client-side lookup key (lucide name or app icon id), not a URL.
const categoryIcon = z.string().trim().min(1).max(60);

export const categoryCreateSchema = z.object({
  name: categoryName,
  type: categoryType,
  color: categoryColor,
  icon: categoryIcon,
  /** Set by the import pipeline so the UI can offer "review imported categories". */
  createdFromImport: z.boolean().optional(),
  clientRequestId: z.string().trim().max(100).optional(),
});

export const categoryUpdateSchema = z
  .object({
    name: categoryName.optional(),
    color: categoryColor.optional(),
    icon: categoryIcon.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

export const categoryIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const categoryQuerySchema = z.object({
  type: categoryType.optional(),
  createdFromImport: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

/**
 * Bulk create, used by the third-party importer: a single file can introduce
 * dozens of unseen categories, and one round trip per category would both hammer
 * the API and leave a half-built taxonomy behind if the run were interrupted.
 * Existing names are returned rather than rejected so the import can link to them.
 */
export const categoryBulkCreateSchema = z.object({
  categories: z
    .array(
      z.object({
        name: categoryName,
        type: categoryType,
        color: categoryColor.optional(),
        icon: categoryIcon.optional(),
      }),
    )
    .min(1, 'At least one category is required')
    .max(200, 'At most 200 categories per request'),
  createdFromImport: z.boolean().optional(),
});
