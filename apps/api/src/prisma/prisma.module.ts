import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OrgScopedPrismaService } from './org-scoped-prisma.service';

@Global()
@Module({
  providers: [PrismaService, OrgScopedPrismaService],
  exports: [PrismaService, OrgScopedPrismaService],
})
export class PrismaModule {}