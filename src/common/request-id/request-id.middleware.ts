import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '@/common/request-id/request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// A caller may send its own ID to trace a request across services.
// Only short, plain IDs are accepted, so nobody can inject text into our logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId =
    incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestContext({ requestId }, next);
};
