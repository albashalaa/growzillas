import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrgsController],
})
export class OrgsModule {}
