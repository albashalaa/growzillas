import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from '../jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * TenancyGuard now derives org context from each request instead of the JWT:
 *
 * - For org-scoped routes (e.g., /orgs/:orgId/*, /projects, /tasks):
 *   - Requires an authenticated user (JwtAuthGuard should run first)
 *   - Reads orgId from the x-org-id header; if missing, falls back to params.orgId
 *   - Verifies an OrgMember exists for (userId, orgId)
 *   - Attaches request.orgId (and mirrors it onto request.user.orgId for compatibility)
 *
 * - For non org-scoped routes, this guard is a no-op.
 *
 * Use @SkipTenancy() for public routes or those that do not require org context.
 */
@Injectable()
export class TenancyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipTenancy = this.reflector.getAllAndOverride<boolean>(
      'skipTenancy',
      [context.getHandler(), context.getClass()],
    );

    if (skipTenancy) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    const path: string = request.path || request.url || '';

    // If no user, let JwtAuthGuard handle auth; this guard only enforces
    // org context for authenticated org-scoped routes.
    if (!user) {
      return true;
    }

    // Determine if this route is org-scoped.
    const isOrgPathWithParam = /^\/orgs\/[^/]+\//.test(path);
    const isProjectsRoute = path.startsWith('/projects');
    const isTasksRoute = path.startsWith('/tasks');
    const isUsersRoute = path.startsWith('/users');
    const isNotificationsRoute = path.startsWith('/notifications');
    const isSearchRoute = path.startsWith('/search');
    const isDashboardRoute = path.startsWith('/dashboard');
    const isOrgScoped =
      isOrgPathWithParam ||
      isProjectsRoute ||
      isTasksRoute ||
      isUsersRoute ||
      isNotificationsRoute ||
      isSearchRoute ||
      isDashboardRoute;

    if (!isOrgScoped) {
      // Not an org-scoped route; no org context required.
      return true;
    }

    // Derive orgId from header or route params.
    const headerOrgId =
      (request.headers && request.headers['x-org-id']) || undefined;
    const paramOrgId = request.params?.orgId;

    const orgId = (headerOrgId || paramOrgId) as string | undefined;

    if (!orgId) {
      throw new ForbiddenException('Organization context (orgId) is required');
    }

    // Verify membership (userId, orgId) via OrgMember.
    const membership = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId: user.userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You do not belong to this organization or access is not allowed',
      );
    }

    // Attach orgId onto the request for downstream handlers.
    request.orgId = orgId;

    // Mirror onto request.user.orgId for compatibility with existing services
    // that still read org context from req.user.
    (request.user as any).orgId = orgId;

    return true;
  }
}
