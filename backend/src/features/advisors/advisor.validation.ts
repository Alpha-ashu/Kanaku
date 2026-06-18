import { z } from 'zod';

// `.passthrough()` preserves any fields the controller reads (the validate
// middleware overwrites req.* with the parsed result). Types are intentionally
// permissive (unions / optional) to enforce shape + length without rejecting
// currently-valid requests. The /apply route is multipart and is not validated
// here.

const id = z.string().min(1).max(100);

export const advisorIdParamSchema = z.object({ id }).passthrough();

export const documentParamSchema = z
  .object({ id, docType: z.string().min(1).max(50) })
  .passthrough();

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
