import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import { AppException, type ErrorDetail } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';
import { getRequestId } from '@/common/request-id/request-context';

export type ErrorBody = {
  statusCode: number;
  error: string;
  code: ErrorCode;
  message: string;
  requestId?: string;
  timestamp: string;
  details?: ErrorDetail[];
};

// Used when an exception has no code of its own (e.g. Nest's built-in NotFoundException).
const DEFAULT_CODES: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.INVALID_STATE_TRANSITION,
  429: ErrorCode.RATE_LIMITED,
  // e.g. the health check when Postgres is down.
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

const GENERIC_SERVER_MESSAGE = 'An unexpected error occurred';

/**
 * Turns every error into the same JSON shape:
 * { statusCode, error, code, message, requestId, timestamp, details? }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toErrorBody(exception);

    if (body.statusCode >= 500) {
      // The full error goes to the logs only, never to the client.
      this.logger.error(
        `[${body.requestId ?? '-'}] ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ErrorBody {
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const isServerError = statusCode >= 500;

    let code: ErrorCode =
      DEFAULT_CODES[statusCode] ??
      (isServerError ? ErrorCode.INTERNAL_ERROR : ErrorCode.HTTP_ERROR);
    let details: ErrorDetail[] | undefined;
    if (exception instanceof AppException) {
      code = exception.code;
      details = exception.details;
    }

    return {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      code,
      // Server errors get a generic message: stack traces and SQL must not leak.
      message:
        !isServerError && exception instanceof HttpException
          ? exception.message
          : GENERIC_SERVER_MESSAGE,
      requestId: getRequestId(),
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    };
  }
}

const describe = (exception: unknown): string =>
  exception instanceof Error ? exception.message : String(exception);
