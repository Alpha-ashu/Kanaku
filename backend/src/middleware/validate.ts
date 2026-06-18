import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';
import { logger } from '../config/logger';

const mapValidationError = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

const validate = (schema: ZodTypeAny, source: 'body' | 'query' | 'params') =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const issues = mapValidationError(result.error);

      // Full technical detail goes to the server logs only — never to the
      // client — so an attacker cannot enumerate the schema by probing.
      logger.warn('[Validation] request rejected', {
        path: req.path,
        method: req.method,
        source,
        requestId: (req as { id?: string }).id,
        issues,
      });

      // Generic, user-safe response. Mirrors the global error handler shape.
      return res.status(400).json({
        success: false,
        error: 'Some of your inputs look incorrect. Please review and try again.',
        code: 'VALIDATION_ERROR',
        requestId: (req as { id?: string }).id,
      });
    }

    req[source] = result.data;
    return next();
  };

export const validateBody = (schema: ZodTypeAny) => validate(schema, 'body');
export const validateQuery = (schema: ZodTypeAny) => validate(schema, 'query');
export const validateParams = (schema: ZodTypeAny) => validate(schema, 'params');

export { z };
