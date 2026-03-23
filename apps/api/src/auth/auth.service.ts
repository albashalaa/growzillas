import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/**
 * Authentication Service
 * 
 * ORG SCOPING RULES:
 * - register(): Creates user + org atomically, no client orgId needed
 * - login(): Returns JWT, no client orgId involved
 * - getUserOrganizations(): Filtered by userId (from JWT)
 * - switchOrganization(): CRITICAL - Verifies membership before issuing token
 * 
 * SECURITY:
 * - All methods use userId from JWT (never from client)
 * - switchOrganization validates membership before creating token
 * - No orgId accepted from client in any method
 */
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Check if a user exists for the given email.
   * Used by email-first login flow.
   */
  async checkEmail(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    return { exists: !!existing };
  }

  /**
   * Register new user
   *
   * ORG SCOPING: Does NOT create any organization or membership.
   * SECURITY: Creates a User record only.
   */
  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName } = registerDto;

    // ✅ SECURE: Check existing user by email only
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const normalizedFirst = firstName?.trim() || null;
    const normalizedLast = lastName?.trim() || null;

    let displayName: string | null = null;
    if (normalizedFirst && normalizedLast) {
      displayName = `${normalizedFirst} ${normalizedLast}`;
    } else {
      // Fallback: use email local part
      displayName = email.split('@')[0];
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        provider: 'local',
        firstName: normalizedFirst,
        lastName: normalizedLast,
        displayName,
      },
    });

    // ✅ SECURE: JWT payload only contains user info
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      access_token,
    };
  }

  /**
   * Login existing user
   * 
   * ORG SCOPING: Not applicable (JWT will be enriched by JwtStrategy)
   * SECURITY: Validates credentials, no orgId from client
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // ✅ SECURE: Lookup by email only
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is OAuth user (no password set)
    if (!user.passwordHash) {
      throw new UnauthorizedException('Please use "Continue with Google" to login');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Backfill displayName for legacy users if missing
    if (!user.displayName) {
      const emailName = user.email.split('@')[0];
      const nameFromProfile =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
      const fallbackDisplay = nameFromProfile || emailName;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { displayName: fallbackDisplay },
      });
      user.displayName = fallbackDisplay;
    }

    // ✅ SECURE: JWT payload contains user info only
    // JwtStrategy will enrich with orgId during validation
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }

  /**
   * Get list of organizations user is a member of
   * 
   * ORG SCOPING: Filtered by userId (not orgId)
   * SECURITY: userId from JWT, can only see own memberships
   */
  async getUserOrganizations(userId: string) {
    // ✅ SECURE: userId from JWT (passed from controller)
    // User can only see their own org memberships
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId }, // ← From JWT, cannot be spoofed
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Normalized shape used across the app:
    // [{ orgId, name, role }]
    return memberships.map((membership) => ({
      orgId: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
    }));
  }

  /**
   * Change password for the given user.
   * Verifies current password and hashes the new password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { success: true };
  }

  /**
   * Switch to a different organization
   * 
   * DEPRECATED: JWT no longer carries orgId.
   * This method now only verifies membership and returns basic info,
   * but DOES NOT embed orgId into the token anymore.
   */
  async switchOrganization(userId: string, orgId: string) {
    // ✅ CRITICAL SECURITY CHECK: Verify membership
    // This prevents users from switching to orgs they don't belong to
    const membership = await this.prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          userId,  // ← From JWT
          orgId,   // ← From URL, but verified here
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    // ✅ SECURE: Reject if user is not a member
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of the specified organization',
      );
    }

    // JWT payload no longer includes orgId; return a fresh token that only
    // identifies the user. Org scoping is resolved server-side per request.
    const payload = {
      sub: membership.user.id,
      email: membership.user.email,
    };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        displayName: membership.user.displayName,
      },
      org: {
        id: membership.organization.id,
        name: membership.organization.name,
      },
      role: membership.role,
    };
  }

  /**
   * Validate or create user from Google OAuth
   *
   * ORG SCOPING: Does NOT create any organization or membership.
   * SECURITY: Email verified by Google, no password needed.
   */
  async validateGoogleUser(profile: {
    email: string;
    googleId: string;
    firstName?: string;
    lastName?: string;
  }) {
    const { email, googleId, firstName, lastName } = profile;

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email },
      // No memberships/orgs needed here; auth should not auto-create orgs.
    });

    // If user doesn't exist, create user ONLY (no organization)
    if (!user) {
      const normalizedFirst = firstName?.trim() || null;
      const normalizedLast = lastName?.trim() || null;
      const nameFromProfile =
        normalizedFirst && normalizedLast
          ? `${normalizedFirst} ${normalizedLast}`
          : null;
      const fallbackDisplay = nameFromProfile || email.split('@')[0];

      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: null,
          provider: 'google',
          providerId: googleId,
          firstName: normalizedFirst,
          lastName: normalizedLast,
          displayName: fallbackDisplay,
        },
      });
    } else if (!user.provider) {
      // User exists with email/password, link Google account
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          provider: 'google',
          providerId: googleId,
        },
      });
    } else if (!user.displayName) {
      // Backfill displayName for existing Google users
      const normalizedFirst = firstName?.trim() || null;
      const normalizedLast = lastName?.trim() || null;
      const nameFromProfile =
        normalizedFirst && normalizedLast
          ? `${normalizedFirst} ${normalizedLast}`
          : null;
      const fallbackDisplay = nameFromProfile || email.split('@')[0];
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: normalizedFirst ?? user.firstName,
          lastName: normalizedLast ?? user.lastName,
          displayName: fallbackDisplay,
        },
      });
      user.displayName = fallbackDisplay;
    }

    // Ensure user exists
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate JWT token
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }
}
