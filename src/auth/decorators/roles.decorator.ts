import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@/users/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Which roles may call this route at all. Anyone else gets 403.
 * This is the role check only; whether the user may touch *this* application
 * (object-level authorization) is checked in the service.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
