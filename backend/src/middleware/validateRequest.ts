import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import logger from 'jet-logger';

/**
 * Validation middleware factory
 * Validates request body against a Zod schema
 * Returns 400 with validation errors if validation fails
 * Passes validated data to req.validatedBody if successful
 */
export function validateRequest(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query params for GET; validate body for all mutating methods.
      const dataToValidate = req.method === 'GET' ? req.query : req.body ?? {};
      
      const validated = schema.parse(dataToValidate);
      
      // Attach validated data to request object for use in controllers
      (req as any).validatedBody = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format validation errors for client response
        const formattedErrors = error.issues.map((err: ZodIssue) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn(`Validation error on ${req.method} ${req.path}: ${JSON.stringify(formattedErrors)}`);

        return res.status(400).json({
          error: 'Validation failed',
          details: formattedErrors,
        });
      }

      // If it's not a Zod error, pass to error handler
      next(error);
    }
  };
}

/**
 * Query parameter validation middleware
 */
export function validateQueryParams(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      (req as any).validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((err: ZodIssue) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Invalid query parameters',
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
}

/**
 * URL parameter validation middleware
 */
export function validateUrlParams(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      (req as any).validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((err: ZodIssue) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Invalid URL parameters',
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
}
