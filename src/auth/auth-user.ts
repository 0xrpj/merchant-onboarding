import type { Request } from 'express';
import type { UserRole } from '@/users/user-role.enum';

/**
 * The logged-in user, as loaded from the database on every request.
 * The role comes from the database, never from the token, so a role change
 * or deactivation takes effect immediately.
 */
export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** What the access token (JWT) carries. */
export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
};
