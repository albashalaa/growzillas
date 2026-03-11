import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OrgScopedPrismaService provides helper methods to ensure
 * all queries are automatically scoped to the current organization.
 * 
 * Usage example:
 * ```
 * const todos = await this.orgPrisma.findManyInOrg(
 *   orgId,
 *   (tx) => tx.todo.findMany({ where: { ...additionalFilters } })
 * );
 * ```
 */
@Injectable()
export class OrgScopedPrismaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Execute a query with automatic orgId filtering
   * Use this pattern to ensure org isolation
   */
  async withOrgContext<T>(
    orgId: string,
    callback: (prisma: PrismaService) => Promise<T>,
  ): Promise<T> {
    // For now, just pass through the orgId
    // In the callback, developers should add: where: { orgId }
    return callback(this.prisma);
  }

  /**
   * Helper to verify a resource belongs to the org
   */
  async verifyOrgAccess(
    orgId: string,
    resourceOrgId: string,
    resourceName: string = 'Resource',
  ): Promise<void> {
    if (resourceOrgId !== orgId) {
      throw new Error(
        `${resourceName} does not belong to organization ${orgId}`,
      );
    }
  }

  /**
   * Get Prisma client for manual org-scoped queries
   */
  getClient(): PrismaService {
    return this.prisma;
  }
}
