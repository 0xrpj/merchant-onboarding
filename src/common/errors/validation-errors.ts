import { HttpStatus, type ValidationError } from '@nestjs/common';
import { AppException, type ErrorDetail } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

/**
 * class-validator returns a tree (an owner inside an application inside a body).
 * This flattens it to one entry per field, with dotted paths like "owners.0.fullName".
 */
export const flattenValidationErrors = (
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] =>
  errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];

    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });

/** Plugged into ValidationPipe so invalid input becomes our standard 400. */
export const validationExceptionFactory = (
  errors: ValidationError[],
): AppException =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed',
    flattenValidationErrors(errors),
  );
