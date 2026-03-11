import { Controller, Post, Get, Body, UseGuards, Request, Param, Res } from '@nestjs/common';
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

    const dbUser = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        displayName: true,
        firstName: true,
        lastName: true,
      },
    });

    const nameFromParts =
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(' ') || null;

    const displayName = dbUser?.displayName ?? nameFromParts ?? null;

    return {
      id: req.user.userId, // From JWT
      email: req.user.email, // From JWT
      displayName,
      firstName: dbUser?.firstName ?? null,
      lastName: dbUser?.lastName ?? null,
      orgId: req.user.orgId, // From membership lookup (may be empty)
      role: hasOrg ? req.user.role : null, // Null when no membership
      member: hasOrg,
    };
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
