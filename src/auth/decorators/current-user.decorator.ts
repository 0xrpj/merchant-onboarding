import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '@/auth/auth-user';

/** Injects the logged-in user (set by JwtAuthGuard) into a controller method. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      // Only reachable if a @Public() route asks for the user: a programming error.
      throw new Error('CurrentUser used on a route without authentication');
    }
    return user;
  },
);
