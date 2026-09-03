import { type Request, type Response, type NextFunction } from 'express';
import { type ZodSchema } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Zod-based request validation middleware factory (NFR-1).
 *
 * Parses `req.body`, `req.query`, and `req.params` against the provided schema.
 * On success, replaces them with the parsed (and coerced/defaulted) values.
 * On failure, throws a ValidationError with structured field-level details.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      throw new ValidationError('Validation failed', fieldErrors as Record<string, unknown>);
    }

    // Replace raw input with validated + coerced data
    const data = result.data as { body?: unknown; query?: unknown; params?: unknown };
    if (data.body !== undefined) {
      req.body = data.body;
    }
    if (data.query !== undefined) {
      Object.defineProperty(req, 'query', {
        value: data.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (data.params !== undefined) {
      Object.defineProperty(req, 'params', {
        value: data.params,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}
