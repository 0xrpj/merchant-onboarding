import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

/**
 * The same 404 for "doesn't exist" and "you can't see it", so nobody can
 * find out which application IDs exist.
 */
export const applicationNotFound = (): AppException =>
  new AppException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    'Application not found',
  );
