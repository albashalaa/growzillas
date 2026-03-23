import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Param,
  Res,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { SkipTenancy } from './decorators/skip-tenancy.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { join, extname } from 'path';
import * as fs from 'fs';

/**
 * Authentication Controller
 * 
 * ORG SCOPING: Auth endpoints are special cases:
 * - register/login: No org context (user doesn't have token yet)
 * - /me: Returns user's current org context from JWT
 * - /organizations: Lists user's org memberships (by userId)
 * - /switch-org: Changes active org (verifies membership first)
 * 
 * SECURITY:
 * - No orgId accepted from client in any endpoint
 * - All org info derived from JWT or database lookups by userId
 */
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /auth/check-email
   * Simple helper for email-first login flow.
   * PUBLIC, no org context, no auth required.
   */
  @Post('check-email')
  @SkipTenancy()
  async checkEmail(@Body() dto: CheckEmailDto) {
    // #region agent log
    fetch('http://127.0.0.1:7890/ingest/b6e00cf5-6b04-4adc-a623-2e57a4672fd0', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '61f0a9',
      },
      body: JSON.stringify({
        sessionId: '61f0a9',
        runId: 'auth-check-email',
        hypothesisId: 'H1',
        location: 'apps/api/src/auth/auth.controller.ts:checkEmail',
        message: 'check-email hit backend',
        data: {
          hasEmail: !!dto?.email,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return this.authService.checkEmail(dto.email);
  }

  /**
   * POST /auth/register
   * ORG SCOPING: Not applicable (public endpoint)
   * SECURITY: Creates user + org atomically, no org context needed
   */
  @Post('register')
  @SkipTenancy() // No org context needed for registration
  async register(@Body() registerDto: RegisterDto) {
    // ✅ SECURE: No orgId from client
    return this.authService.register(registerDto);
  }

  /**
   * POST /auth/login
   * ORG SCOPING: Not applicable (public endpoint)
   * SECURITY: Returns JWT with user's first org
   */
  @Post('login')
  @SkipTenancy() // No org context needed for login
  async login(@Body() loginDto: LoginDto) {
    // ✅ SECURE: No orgId from client
    return this.authService.login(loginDto);
  }

  /**
   * GET /auth/me
   * ORG SCOPING: Returns orgId from JWT
   * SECURITY: All data from JWT, nothing from client
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: { user: RequestUser }) {
    // ✅ SECURE: All data from JWT (populated by JwtStrategy and TenancyGuard)
    // orgId/role may be empty when the user has no org membership yet.
    const hasOrg = !!req.user.orgId;

    // Cast to any so this stays compatible even if Prisma types
    // haven’t been regenerated yet for new fields like bio/avatarUrl.
    const dbUser = (await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    } as any)) as any;

    const nameFromParts =
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(' ') || null;

    const displayName = dbUser?.displayName ?? nameFromParts ?? null;

    return {
      id: req.user.userId, // From JWT
      email: req.user.email, // From JWT
      displayName,
      firstName: dbUser?.firstName ?? null,
      lastName: dbUser?.lastName ?? null,
      bio: (dbUser as any)?.bio ?? null,
      avatarUrl: (dbUser as any)?.avatarUrl ?? null,
      orgId: req.user.orgId, // From membership lookup (may be empty)
      role: hasOrg ? req.user.role : null, // Null when no membership
      member: hasOrg,
    };
  }

  /**
   * PATCH /auth/me
   * Update basic profile fields for the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateProfile(
    @Request() req: { user: RequestUser },
    @Body()
    body: {
      firstName?: string | null;
      lastName?: string | null;
      bio?: string | null;
    },
  ) {
    const userId = req.user.userId;

    const data: any = {};
    if (body.firstName !== undefined) {
      data.firstName = body.firstName?.trim() || null;
    }
    if (body.lastName !== undefined) {
      data.lastName = body.lastName?.trim() || null;
    }
    if (body.bio !== undefined) {
      data.bio = body.bio?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getProfile({ user: req.user } as any);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.getProfile({ user: req.user } as any);
  }

  /**
   * POST /auth/me/change-password
   * Change password for the current user (requires current password).
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/change-password')
  async changePassword(
    @Request() req: { user: RequestUser },
    @Body()
    body: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    const { currentPassword, newPassword } = body;
    await this.authService.changePassword(req.user.userId, currentPassword, newPassword);
    return { success: true };
  }

  /**
   * POST /auth/me/avatar
   * Upload or replace the current user's avatar image.
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Request() req: { user: RequestUser },
    @UploadedFile() file: any,
  ) {
    const userId = req.user.userId;

    if (!file || !file.buffer) {
      return { success: false, message: 'File is required' };
    }

    const uploadsRoot = join(process.cwd(), 'uploads', 'avatars');
    fs.mkdirSync(uploadsRoot, { recursive: true });

    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetFileName = `${unique}${extname(file.originalname)}`;
    const targetPath = join(uploadsRoot, targetFileName);

    fs.writeFileSync(targetPath, file.buffer);

    const fileUrl = `/uploads/avatars/${targetFileName}`;

    const updated = (await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: fileUrl } as any,
    } as any)) as any;

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName ?? null,
      lastName: updated.lastName ?? null,
      bio: (updated as any).bio ?? null,
      avatarUrl: (updated as any).avatarUrl ?? null,
    };
  }

  /**
   * DELETE /auth/me/avatar
   * Remove the current user's avatar image.
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar/delete')
  async deleteAvatar(@Request() req: { user: RequestUser }) {
    const userId = req.user.userId;

    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
    } as any)) as any;

    if ((user as any)?.avatarUrl && (user as any).avatarUrl.startsWith('/uploads/avatars/')) {
      const path = join(process.cwd(), (user as any).avatarUrl);
      if (fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null } as any,
    } as any);

    return { success: true };
  }

  /**
   * GET /auth/organizations
   * ORG SCOPING: Queries by user.userId (not orgId)
   * SECURITY: User can only see their own org memberships
   */
  @UseGuards(JwtAuthGuard)
  @Get('organizations')
  async getUserOrganizations(@CurrentUser() user: RequestUser) {
    // ✅ SECURE: Filtered by user.userId from JWT
    return this.authService.getUserOrganizations(user.userId);
  }

  /**
   * POST /auth/switch-org/:orgId
   * ORG SCOPING: Special case - switching between user's orgs
   * SECURITY: Verifies user is member of target org before issuing token
   * 
   * NOTE: orgId in URL is acceptable here because:
   * 1. It's explicitly for org switching
   * 2. Backend verifies membership before allowing switch
   * 3. Returns new JWT with verified orgId
   */
  @UseGuards(JwtAuthGuard)
  @Post('switch-org/:orgId')
  @SkipTenancy() // Skip tenancy check since we're switching orgs
  async switchOrganization(
    @CurrentUser() user: RequestUser,
    @Param('orgId') orgId: string, // ✅ SECURE: Verified against user's memberships
  ) {
    // ✅ SECURE: Service verifies user is member of orgId before switching
    // See auth.service.ts switchOrganization() for membership verification
    return this.authService.switchOrganization(user.userId, orgId);
  }

  /**
   * GET /auth/google
   * Initiates Google OAuth flow
   * ORG SCOPING: Not applicable (OAuth flow)
   */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @SkipTenancy()
  async googleAuth() {
    // Guard redirects to Google
  }

  /**
   * GET /auth/google/callback
   * Google OAuth callback
   * ORG SCOPING: Creates org if first-time user
   * SECURITY: Email verified by Google
   */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @SkipTenancy()
  async googleAuthCallback(@Request() req, @Res() res: Response) {
    // User data from GoogleStrategy
    const googleUser = req.user;
    
    // Validate and get/create user
    const result = await this.authService.validateGoogleUser(googleUser);
    
    // Redirect to frontend with token
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/callback?token=${result.access_token}`);
  }
}
