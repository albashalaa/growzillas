import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { SkipTenancy } from '../auth/decorators/skip-tenancy.decorator';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

/**
 * Organization members & invites endpoints.
 * 
 * ORG SCOPING:
 * - Always uses req.user.orgId from JWT (TenancyGuard enforces presence).
 * - Ignores orgId from route params for security; params are only for URL shape.
 */
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * GET /orgs/:orgId/members
   * View members in current organization.
   * 
   * Allowed for both ADMIN and MEMBER.
   */
  @UseGuards(JwtAuthGuard)
  @Get('orgs/:orgId/members')
  async getMembers(@CurrentUser() user: RequestUser) {
    return this.invitesService.getMembers(user);
  }

  /**
   * POST /orgs/:orgId/invites
   * Create invitation (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('orgs/:orgId/invites')
  async createInvite(
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.createInvite(dto, user);
  }

  /**
   * GET /orgs/:orgId/invites
   * List pending (active) invites in current org (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('orgs/:orgId/invites')
  async listInvites(@CurrentUser() user: RequestUser) {
    return this.invitesService.getPendingInvites(user);
  }

  /**
   * GET /invites/validate?token=...
   * Public endpoint to validate invite token.
   */
  @Get('invites/validate')
  @SkipTenancy()
  async validateInvite(@Query('token') token: string) {
    return this.invitesService.validateInvite(token);
  }

  /**
   * POST /invites/accept
   * Accept invite (requires authentication).
   */
  @UseGuards(JwtAuthGuard)
  @SkipTenancy()
  @Post('invites/accept')
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.acceptInvite(dto.token, user);
  }

  /**
   * PATCH /orgs/:orgId/members/:userId
   * Update role for a member (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('orgs/:orgId/members/:userId')
  async updateMemberRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.updateMemberRole(userId, dto.role, user);
  }

  /**
   * POST /orgs/:orgId/invites/:inviteId/resend
   * Resend an invite by regenerating token and extending expiry (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('orgs/:orgId/invites/:inviteId/resend')
  async resendInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.resendInvite(inviteId, user);
  }

  /**
   * DELETE /orgs/:orgId/invites/:inviteId
   * Revoke an invite (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('orgs/:orgId/invites/:inviteId')
  async deleteInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.revokeInvite(inviteId, user);
  }

  /**
   * DELETE /orgs/:orgId/members/:userId
   * Remove member from organization (ADMIN only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('orgs/:orgId/members/:userId')
  async removeMember(
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitesService.removeMember(userId, user);
  }
}

