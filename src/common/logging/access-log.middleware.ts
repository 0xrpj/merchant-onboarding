import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '@/auth/auth-user';
import { REQUEST_ID_HEADER } from '@/common/request-id/request-id.middleware';

const logger = new Logger('HTTP');

/**
 * One line per request: method, path, status, duration, request ID and user ID.
 * Never headers, bodies or query strings: they can hold tokens, passwords or personal data.
 */
export const accessLogMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const started = performance.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    const ms = Math.round(performance.now() - started);
    const requestId = String(res.getHeader(REQUEST_ID_HEADER) ?? '-');
    const userId = req.user?.id ?? '-';
    logger.log(
      `${req.method} ${path} ${res.statusCode} ${ms}ms requestId=${requestId} userId=${userId}`,
    );
  });
  next();
};
