import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

class CreateOrgDto {
  @IsString()
  @MaxLength(255)
  name: string;
}

/**
 * Organizations Controller
 * 
 * ORG SCOPING: This controller does NOT use req.user.orgId because it manages
 * the user's list of organizations. User can belong to multiple orgs.
 * 
 * SECURITY:
 * - All queries filtered by user.userId (from JWT)
 * - No orgId accepted from client
 * - TenancyGuard is applied globally but doesn't block these endpoints
 */
@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrgsController {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  /**
   * GET /orgs/my
   * Returns list of organizations current user belongs to
   * 
   * ORG SCOPING: Queries by user.userId from JWT (not orgId)
   * SECURITY: User can only see their own org memberships
   */
  @Get('my')
  async getMyOrgs(@CurrentUser() user: RequestUser) {
    // Delegate to AuthService so both /orgs/my and /auth/organizations share shape:
    // [{ orgId, name, role }]
    return this.authService.getUserOrganizations(user.userId);
  }

  /**
   * POST /orgs
   * Create new organization with current user as ADMIN
   * 
   * ORG SCOPING: Not applicable (creating new org)
   * SECURITY: User becomes ADMIN of created org automatically
   * NOTE: No orgId from client - new org is created and user is linked
   */
  @Post()
  async createOrg(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrgDto, // ✅ Only contains 'name', no orgId
  ) {
    // Temporary log to confirm that organization creation only happens here.
    // eslint-disable-next-line no-console
    console.log('[OrgsController.createOrg] creating organization for user', user.userId, 'with name', dto.name);

    // ✅ SECURE: Transaction ensures atomic creation
    const result = await this.prisma.$transaction(async (tx) => {
      // Create organization (no client-provided orgId)
      const org = await tx.organization.create({
        data: {
          name: dto.name, // ✅ Only accepts name from client
        },
      });

      // Link current user as ADMIN
      // ✅ SECURE: userId from JWT, orgId from newly created org
      await tx.orgMember.create({
        data: {
          userId: user.userId, // ← From JWT
          orgId: org.id,        // ← From newly created org
          role: 'ADMIN',
        },
      });

      return org;
    });

    return {
      id: result.id,
      name: result.name,
    };
  }

  /**
   * GET /orgs/:orgId
   * Return basic organization details (id, name) for orgs
   * the current user belongs to.
   *
   * SECURITY: Verifies membership via orgMember(orgId, userId) before
   * returning any data.
   */
  @Get(':orgId')
  async getOrgById(
    @CurrentUser() user: RequestUser,
    @Param('orgId') orgId: string,
  ) {
    const membership = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId: user.userId,
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of the specified organization',
      );
    }

    return {
      id: membership.organization.id,
      name: membership.organization.name,
    };
  }
}
