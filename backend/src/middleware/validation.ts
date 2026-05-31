import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

/**
 * validation.ts — middleware/validation shim
 *
 * Provides `validateRequest`, the named export expected by device.controller.ts,
 * as a thin wrapper around zod schema validation on req.body.
 *
 * The existing validate.ts provides `validateBody / validateQuery / validateParams`
 * middleware factories; this file adds the function-based `validateRequest` variant.
 */

/**
 * Validates `req.body` against the given Zod schema and throws a 400 response on failure.
 * Can be called inline inside a controller (not as middleware), e.g.:
 *   const data = validateRequest(registerDeviceSchema, req.body);
 */
export function validateRequest<T>(schema: ZodTypeAny, data: unknown): T {
  try {
    return schema.parse(data) as T;
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }));
      const err = Object.assign(new Error('Validation failed'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details,
      });
      throw err;
    }
    throw error;
  }
}

/**
 * Express middleware factory — validates req.body and attaches parsed data.
 */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    return next();
  };
}
