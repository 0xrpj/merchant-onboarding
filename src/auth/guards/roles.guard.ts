import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { assertRole } from '@/auth/assert-role';
import type { AuthenticatedRequest } from '@/auth/auth-user';
import { ROLES_KEY } from '@/auth/decorators/roles.decorator';
import type { UserRole } from '@/users/user-role.enum';

/** Global guard, runs after JwtAuthGuard: checks @Roles(...). 403 if the role can never do this. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    assertRole(user, roles);
    return true;
  }
}
