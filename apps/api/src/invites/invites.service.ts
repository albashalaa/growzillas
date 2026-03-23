import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrgRole } from '@prisma/client';
import type { RequestUser } from '../auth/jwt.strategy';
import * as crypto from 'crypto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getOrgId(user: RequestUser): string {
    if (!user.orgId) {
      throw new ForbiddenException('Organization context is required');
    }
    return user.orgId;
  }

  async getMembers(user: RequestUser) {
    const orgId = this.getOrgId(user);

    const members = await this.prisma.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      displayName: m.user.displayName,
      avatarUrl: (m.user as any).avatarUrl ?? null,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async createInvite(
    dto: { email: string; role?: OrgRole },
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);
    const email = dto.email.toLowerCase().trim();
    const role = dto.role ?? OrgRole.MEMBER;

    // Check if already a member
    const existingMember = await this.prisma.orgMember.findFirst({
      where: {
        orgId,
        user: {
          email,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingMember) {
      throw new ConflictException(
        'This user is already a member of this workspace.',
      );
    }

    // Check if there is already a pending invite for this email in this org
    const now = new Date();
    const existingPendingInvite = await this.prisma.orgInvite.findFirst({
      where: {
        orgId,
        email,
        acceptedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });

    if (existingPendingInvite) {
      throw new ConflictException(
        'An invite is already pending for this email.',
      );
    }

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.orgInvite.create({
      data: {
        orgId,
        email,
        role,
        token,
        expiresAt,
        createdByUserId: user.userId,
      },
      include: {
        organization: {
          select: {
            name: true,
          },
        },
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    const inviteLink = `${frontendUrl}/invite?token=${invite.token}`;

    return {
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      inviteLink,
      existingUser: !!existingUser,
    };
  }

  async validateInvite(token: string) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.acceptedAt) {
      throw new BadRequestException('Invite has already been accepted');
    }

    if (invite.expiresAt <= new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    return {
      valid: true,
      orgId: invite.organization.id,
      orgName: invite.organization.name,
      invitedEmail: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
    };
  }

  async acceptInvite(token: string, user: RequestUser) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.acceptedAt) {
      throw new BadRequestException('Invite has already been accepted');
    }

    if (invite.expiresAt <= new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        'Invite email does not match your account email',
      );
    }

    // If already a member, just mark accepted
    const existingMembership = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId: invite.orgId,
          userId: user.userId,
        },
      },
    });

    if (existingMembership) {
      await this.prisma.orgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return {
        orgId: invite.organization.id,
        orgName: invite.organization.name,
        role: existingMembership.role,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.orgMember.create({
        data: {
          orgId: invite.orgId,
          userId: user.userId,
          role: invite.role,
        },
      });

      await tx.orgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return {
        orgId: invite.organization.id,
        orgName: invite.organization.name,
        role: invite.role,
      };
    });

    return result;
  }

  async getPendingInvites(user: RequestUser) {
    const orgId = this.getOrgId(user);
    const now = new Date();

    const invites = await this.prisma.orgInvite.findMany({
      where: {
        orgId,
        acceptedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      createdByEmail: invite.createdBy.email,
      inviteLink: `${frontendUrl}/invite?token=${invite.token}`,
    }));
  }

  async resendInvite(inviteId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const invite = await this.prisma.orgInvite.findFirst({
      where: {
        id: inviteId,
        orgId,
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.acceptedAt) {
      throw new BadRequestException('Invite has already been accepted');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.orgInvite.update({
      where: { id: invite.id },
      data: {
        token,
        expiresAt,
        acceptedAt: null,
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    const inviteLink = `${frontendUrl}/invite?token=${updated.token}`;

    return {
      inviteId: updated.id,
      email: updated.email,
      role: updated.role,
      expiresAt: updated.expiresAt,
      inviteLink,
    };
  }

  async revokeInvite(inviteId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const invite = await this.prisma.orgInvite.findFirst({
      where: {
        id: inviteId,
        orgId,
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    await this.prisma.orgInvite.delete({
      where: { id: invite.id },
    });

    return { success: true };
  }

  async updateMemberRole(
    targetUserId: string,
    newRole: OrgRole,
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const target = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId: targetUserId,
        },
      },
    });

    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === OrgRole.ADMIN && newRole === OrgRole.MEMBER) {
      const adminCount = await this.prisma.orgMember.count({
        where: {
          orgId,
          role: OrgRole.ADMIN,
        },
      });

      if (adminCount <= 1) {
        throw new ConflictException(
          'Cannot demote the last admin of the organization',
        );
      }
    }

    const updated = await this.prisma.orgMember.update({
      where: {
        orgId_userId: {
          orgId,
          userId: targetUserId,
        },
      },
      data: {
        role: newRole,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return {
      userId: targetUserId,
      email: updated.user.email,
      role: updated.role,
    };
  }

  async removeMember(targetUserId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const target = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId: targetUserId,
        },
      },
    });

    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === OrgRole.ADMIN) {
      const adminCount = await this.prisma.orgMember.count({
        where: {
          orgId,
          role: OrgRole.ADMIN,
        },
      });

      if (adminCount <= 1) {
        throw new ConflictException(
          'Cannot remove the last admin of the organization',
        );
      }
    }

    await this.prisma.orgMember.delete({
      where: {
        orgId_userId: {
          orgId,
          userId: targetUserId,
        },
      },
    });

    return { success: true };
  }
}

