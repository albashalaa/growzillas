# 🔒 Growzillas API - Multi-Tenant NestJS Backend

> **Security Notice:** This API implements bulletproof multi-tenancy with org-scoped authentication.  
> **Last Security Audit:** March 2, 2026 ✅

---

## 🚨 IMPORTANT: Multi-Tenancy Security

This API enforces strict organization scoping. **ALL controllers must follow these rules:**

1. ✅ Always filter queries by `user.orgId` from JWT (never from client)
2. ❌ Never accept `orgId` in `@Body()`, `@Query()`, or `@Param()`
3. ✅ TenancyGuard automatically strips any client-provided `orgId`
4. ✅ Use `deleteMany()` with orgId filter, never `delete()`

**📚 Before creating new controllers, read:**
- `ORG_SCOPING_QUICK_REFERENCE.md` - Quick reference guide
- `ORG_SCOPING_CHECKLIST.md` - Step-by-step checklist
- `SECURITY_AUDIT.md` - Full security audit report

---

## 🎯 Features

- ✅ JWT Authentication with auto-refresh
- ✅ Multi-tenancy with Organization context
- ✅ Role-Based Access Control (RBAC)
- ✅ Bulletproof org scoping (TenancyGuard)
- ✅ Organization switching
- ✅ Prisma ORM with PostgreSQL
- ✅ Comprehensive security documentation

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Setup Database
```bash
# Create .env file with DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN
# See .env.example

# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### 3. Run Development Server
```bash
pnpm run start:dev
```

Server runs on `http://localhost:3002`

---

## 🔐 Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Create user + org | No |
| POST | `/auth/login` | Login user | No |
| GET | `/auth/me` | Get current user context | Yes |
| GET | `/auth/organizations` | List user's orgs | Yes |
| POST | `/auth/switch-org/:orgId` | Switch active org | Yes |

### Example: Register & Login
```bash
# Register
curl -X POST http://localhost:3002/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Login
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Get current user (requires JWT)
curl -X GET http://localhost:3002/auth/me \
  -H "Authorization: Bearer <your-jwt-token>"
```

---

## 🏢 Organization Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/orgs/my` | List user's organizations | Yes |
| POST | `/orgs` | Create new organization | Yes |

---

## 🔒 Security Architecture

### Guard Execution Order
```
Request
  ↓
JwtAuthGuard (validates JWT, sets req.user)
  ↓
JwtStrategy (looks up org membership, enriches req.user)
  ↓
TenancyGuard (enforces orgId, strips client orgId)
  ↓
RolesGuard (checks @Roles() if present)
  ↓
Controller Handler
```

### What's in `req.user`
```typescript
interface RequestUser {
  userId: string;   // From JWT
  email: string;    // From JWT
  orgId: string;    // From database lookup
  role: OrgRole;    // From database lookup (ADMIN or MEMBER)
}
```

---

## 📖 Documentation

### Security Documentation
- **`SECURITY_AUDIT_COMPLETE.md`** - Visual audit summary
- **`SECURITY_AUDIT.md`** - Comprehensive audit report
- **`ORG_SCOPING_QUICK_REFERENCE.md`** - Developer quick reference
- **`ORG_SCOPING_CHECKLIST.md`** - New controller checklist
- **`AUDIT_SUMMARY.md`** - Executive summary

### Implementation Guides
- **`TENANCY_GUARD_GUIDE.md`** - TenancyGuard documentation
- **`ORG_CONTEXT_GUIDE.md`** - Org context usage
- **`RBAC_GUIDE.md`** - Role-based access control
- **`ORG_SWITCHING_GUIDE.md`** - Organization switching

### Example Code
- **`src/examples/todos.controller.example.ts`** - Org scoping patterns
- **`src/examples/rbac.controller.example.ts`** - RBAC patterns

---

## 🛠️ Creating New Controllers

### Step 1: Setup
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';

@Controller('your-resource')
@UseGuards(JwtAuthGuard)
export class YourController {
  constructor(private prisma: PrismaService) {}
}
```

### Step 2: List Resources (org-scoped)
```typescript
@Get()
async list(@CurrentUser() user: RequestUser) {
  return this.prisma.yourModel.findMany({
    where: { orgId: user.orgId } // ← From JWT
  });
}
```

### Step 3: Create Resource (org-scoped)
```typescript
@Post()
async create(
  @CurrentUser() user: RequestUser,
  @Body() dto: CreateDto
) {
  return this.prisma.yourModel.create({
    data: {
      ...dto,
      orgId: user.orgId // ← Force from JWT
    }
  });
}
```

### Step 4: Delete Resource (prevent cross-org)
```typescript
@Delete(':id')
async delete(
  @CurrentUser() user: RequestUser,
  @Param('id') id: string
) {
  return this.prisma.yourModel.deleteMany({
    where: {
      id,
      orgId: user.orgId // ← Prevents cross-org deletion
    }
  });
}
```

**⚠️ Important:** See `ORG_SCOPING_CHECKLIST.md` for complete guidelines.

---

## 🧪 Testing

### Run Tests
```bash
# unit tests
pnpm run test

# e2e tests
pnpm run test:e2e

# test coverage
pnpm run test:cov
```

### Manual Security Testing
```bash
# Test 1: Try to spoof orgId (should be stripped)
curl -X POST http://localhost:3002/resources \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Test", "orgId": "spoofed-id"}'
# Result: Created in user's actual org, not spoofed org

# Test 2: Try to access another org's data
curl -X GET http://localhost:3002/resources \
  -H "Authorization: Bearer <user-a-token>"
# Result: Only returns org 1's data

# Test 3: Try to switch to org you don't belong to
curl -X POST http://localhost:3002/auth/switch-org/other-org-id \
  -H "Authorization: Bearer <token>"
# Result: 403 Forbidden
```

---

## 📊 Project Status

```
✅ Authentication: Complete
✅ Multi-tenancy: Complete
✅ RBAC: Complete
✅ Org Switching: Complete
✅ Security Audit: Complete (March 2, 2026)
✅ Documentation: Complete
```

---

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
