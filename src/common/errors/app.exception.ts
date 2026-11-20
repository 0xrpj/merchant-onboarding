import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/errors/error-codes';

export type ErrorDetail = { field: string; messages: string[] };

/**
 * The error our own code throws. It carries an HTTP status plus a stable `code`.
 * Example: throw new AppException(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Cannot approve a DRAFT');
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}
