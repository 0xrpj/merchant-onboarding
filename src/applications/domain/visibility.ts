import type { AuthUser } from '@/auth/auth-user';
import { UserRole } from '@/users/user-role.enum';

/** A condition added to every query on applications. */
export type VisibilityScope = {
  createdById?: string;
  assignedReviewerId?: string;
};

/**
 * Object-level authorization in one place: which applications a user may see.
 * - ADMIN: all of them
 * - SALES: only the ones they created
 * - REVIEWER: only the ones assigned to them
 *
 * Every read AND every action loads the application through this scope, so
 * an application outside it simply isn't found (404, never 403: we don't
 * reveal that the ID exists).
 */
export const visibilityScope = (
  user: Pick<AuthUser, 'id' | 'role'>,
): VisibilityScope => {
  switch (user.role) {
    case UserRole.ADMIN:
      return {};
    case UserRole.SALES:
      return { createdById: user.id };
    case UserRole.REVIEWER:
      return { assignedReviewerId: user.id };
    default: {
      // If a new role is added, TypeScript fails here until it's handled.
      // At runtime an unknown role sees nothing.
      const unknownRole: never = user.role;
      throw new Error(`No visibility rule for role ${String(unknownRole)}`);
    }
  }
};
