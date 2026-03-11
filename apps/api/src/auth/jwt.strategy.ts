import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OrgRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface RequestUser {
  userId: string;
  email: string;
  orgId: string;
  role: OrgRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          // No orgId in JWT payload; always pick first membership
          take: 1,
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // User may legitimately have zero org memberships (e.g. just registered
    // and will create their first org). In that case, allow authentication
    // and leave org context resolution to downstream logic (e.g. /orgs/my).
    if (!user.memberships || user.memberships.length === 0) {
      return {
        userId: user.id,
        email: user.email,
        // orgId/role are only meaningful when membership exists; TenancyGuard
        // enforces org access separately based on OrgMember.
        orgId: '' as any,
        role: OrgRole.MEMBER,
      };
    }

    const activeMembership = user.memberships[0];

    return {
      userId: user.id,
      email: user.email,
      orgId: activeMembership.orgId,
      role: activeMembership.role,
    };
  }
}
