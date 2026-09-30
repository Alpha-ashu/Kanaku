import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { sanitize } from '../../utils/sanitize';
import { ADVISOR_DOC_TYPES } from './advisorDocuments';

// `.passthrough()` preserves any fields the controller reads (the validate
// middleware overwrites req.* with the parsed result). Types are intentionally
// permissive (unions / optional) to enforce shape + length without rejecting
// currently-valid requests. The multipart /apply route has its own validator
// below, because it must run after multer has parsed the body.

const id = z.string().min(1).max(100);

export const advisorIdParamSchema = z.object({ id }).passthrough();

export const documentParamSchema = z
  .object({ id, docType: z.enum(ADVISOR_DOC_TYPES) })
  .passthrough();

// ─── Advisor application (multipart) ─────────────────────────────────────────
//
// Multipart fields arrive as strings and after app.ts's global JSON sanitiser
// has already run, so they are sanitised here. Every message is written for the
// applicant: these are the form's own fields, so naming the one that is wrong
// discloses nothing, and a generic "inputs look incorrect" left people guessing.

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .transform((value) => sanitize(value))
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`));

const optionalText = (label: string, max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform((value) => sanitize(value))
      .pipe(z.string().max(max, `${label} must be ${max} characters or fewer`))
      .optional(),
  );

export const applyAdvisorSchema = z.object({
  fullName: requiredText('Full name', 120),
  phone: z
    .string({ error: 'Mobile number is required' })
    .trim()
    .regex(/^\+?[\d\s()-]{7,20}$/, 'Enter a valid mobile number')
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }, 'Enter a valid mobile number'),
  experienceYears: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'Years of experience is required' })
      .int('Years of experience must be a whole number')
      .min(0, 'Years of experience cannot be negative')
      .max(70, 'Years of experience must be 70 or fewer'),
  ),
  expertise: requiredText('Area of expertise', 100),
  organizationName: optionalText('Organization name', 150),
  bio: requiredText('Professional bio', 5000),
  // Optional, and an empty field stays unset rather than becoming 0 — a free
  // consultation and an unstated rate are different things on the booking screen.
  hourlyRate: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'Consultation fee must be a number' })
      .min(0, 'Consultation fee cannot be negative')
      .max(1_000_000, 'Consultation fee must be 10,00,000 or less')
      .optional(),
  ),
});

export type ApplyAdvisorInput = z.infer<typeof applyAdvisorSchema>;

/** Validates the parsed multipart body; answers with the first field's own message. */
export const validateAdvisorApplication = (req: Request, res: Response, next: NextFunction) => {
  const result = applyAdvisorSchema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    return res.status(400).json({
      success: false,
      error: issue?.message ?? 'Please review your application and try again.',
      code: 'VALIDATION_ERROR',
      field: issue?.path.join('.') || undefined,
    });
  }
  req.body = result.data;
  return next();
};

export const setAvailabilitySchema = z
  .object({
    dayOfWeek: z.union([z.number().int(), z.string()]).optional(),
    startTime: z.string().max(20).optional(),
    endTime: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough();

export const availabilityStatusSchema = z
  .object({ available: z.union([z.boolean(), z.string()]).optional() })
  .passthrough();

export const onlineStatusSchema = z
  .object({ status: z.union([z.boolean(), z.string()]).optional() })
  .passthrough();

export const roleModeSchema = z.object({ mode: z.string().max(50).optional() }).passthrough();

export const rateSessionSchema = z
  .object({
    rating: z.union([z.number(), z.string()]).optional(),
    feedback: z.string().max(5000).optional(),
  })
  .passthrough();

export const rejectApplicationSchema = z
  .object({ reason: z.string().max(2000).optional() })
  .passthrough();

export const createPostSchema = z
  .object({
    category: z.string().trim().max(60).optional(),
    title: z.string().trim().min(1, 'Title is required').max(160),
    content: z.string().trim().min(1, 'Content is required').max(5000),
    // Survives .passthrough() either way; declared so it is typed and so the
    // dependency is visible to anyone who later tightens this schema.
    clientRequestId: z.string().trim().max(200).optional(),
  })
  .passthrough();
