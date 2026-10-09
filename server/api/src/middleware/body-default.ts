import type { Request, Response, NextFunction } from 'express';

/**
 * Express 5 leaves `req.body` undefined when no parser ran (no body, or another
 * content type); Express 4 gave `{}`. Routes destructure it and `validate()`
 * parses it, so a body-less request turned a 400 into a 500 on three routes and
 * changed the answer of fourteen more. Mounted after the parsers, this keeps the
 * Express 4 contract. multer and express.raw still set their own body later.
 */
export function bodyDefault(req: Request, _res: Response, next: NextFunction): void {
  if (req.body === undefined) req.body = {};
  next();
}
