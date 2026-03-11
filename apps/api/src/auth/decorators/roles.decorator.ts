import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Roles decorator for role-based access control.
 * 
 * Restricts access to routes based on user's role in their organization.
 * 
 * @example
 * ```typescript
 * @Roles('ADMIN')
 * @Delete(':id')
 * async deleteResource(@CurrentUser() user: RequestUser, @Param('id') id: string) {
 *   // Only users with ADMIN role can access this
 * }
 * ```
 * 
 * @example Multiple roles
 * ```typescript
 * @Roles('ADMIN', 'MEMBER')
 * @Get()
 * async list(@CurrentUser() user: RequestUser) {
 *   // Both ADMIN and MEMBER can access
 * }
 * ```
 */
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
