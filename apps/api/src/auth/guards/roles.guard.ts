import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestUser } from '../jwt.strategy';

/**
 * RolesGuard checks if authenticated user has required role.
 * 
 * Works with @Roles() decorator to restrict access based on org membership role.
 * 
 * Guard checks:
 * 1. If @Roles() decorator is present on route
 * 2. If user is authenticated (has req.user)
 * 3. If user's role matches any of the required roles
 * 
 * Usage:
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('ADMIN')
 * @Delete(':id')
 * async delete() {
 *   // Only ADMIN can access
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Roles() decorator, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    // If no user, deny (should be handled by JwtAuthGuard first)
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if user's role matches any required role
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role(s): ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
