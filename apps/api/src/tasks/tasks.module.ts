import { Module } from '@nestjs/common';
import { AutomationsModule } from '../modules/automations/automations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [PrismaModule, AutomationsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}

