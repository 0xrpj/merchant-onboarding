import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, throwError, timeout } from 'rxjs';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

/**
 * Answers 503 if a handler takes longer than `ms`, instead of letting the
 * client hang. (The database also cancels slow queries: statement_timeout.)
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly ms: number) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout({
        first: this.ms,
        with: () =>
          throwError(
            () =>
              new AppException(
                HttpStatus.SERVICE_UNAVAILABLE,
                ErrorCode.SERVICE_UNAVAILABLE,
                'The request took too long',
              ),
          ),
      }),
    );
  }
}
