import { z } from 'zod';

// Bill uploads are multipart (handled by the upload middleware + the controller's
// own transactionId sanitization), so only the path param is validated here.
export const billIdParamSchema = z.object({ id: z.string().min(1).max(100) }).passthrough();
