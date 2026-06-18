import { z } from 'zod';

// Fields are `.optional()` so the handlers' existing presence checks (and their
// specific error codes like PIN_REQUIRED) are preserved for missing fields — these
// schemas add type + max-length enforcement (anti type-confusion / oversized input)
// without changing accept/reject behavior for valid requests. `.passthrough()`
// keeps any other fields the handlers read.

const pinField = z.string().min(1).max(64);

export const createPinSchema = z.object({ pin: pinField.optional() }).passthrough();

export const verifyPinSchema = z
  .object({ pin: pinField.optional(), deviceId: z.string().max(200).optional() })
  .passthrough();

export const verifySecuritySchema = z
  .object({ pin: z.string().max(64).optional(), freshAuthToken: z.string().max(5000).optional() })
  .passthrough();

export const updatePinSchema = z
  .object({ currentPin: pinField.optional(), newPin: pinField.optional() })
  .passthrough();

// PIN key backup is an encrypted blob — allow a generous max.
export const keyBackupSchema = z
  .object({ backup: z.string().min(1).max(100000).optional() })
  .passthrough();

export const resetPinSchema = z.object({ userId: z.string().min(1).max(100).optional() }).passthrough();
