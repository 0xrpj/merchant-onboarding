import { HttpStatus } from '@nestjs/common';
import type { AuthUser } from '@/auth/auth-user';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';
import type { UserRole } from '@/users/user-role.enum';

/** 403 FORBIDDEN unless the user has one of the roles. */
export const assertRole = (
  user: Pick<AuthUser, 'role'> | undefined,
  allowed: readonly UserRole[],
): void => {
  if (!user || !allowed.includes(user.role)) {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Your role cannot perform this action',
    );
  }
};
