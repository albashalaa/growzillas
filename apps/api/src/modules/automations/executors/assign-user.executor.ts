import { Injectable } from '@nestjs/common';
import { TaskMemberRole } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AutomationAction,
  AutomationActionType,
  AutomationEvent,
} from '../types/automation.types';
import {
  AutomationActionSkippedError,
  BaseActionExecutor,
} from './base-action-executor';

@Injectable()
export class AssignUserExecutor extends BaseActionExecutor {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  supports(type: AutomationActionType): boolean {
    return type === 'ASSIGN_USER';
  }

  async execute(action: AutomationAction, event: AutomationEvent): Promise<void> {
    const raw = action.config.userId;
    const userId =
      typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    if (!userId) {
      throw new AutomationActionSkippedError('ASSIGN_USER requires config.userId');
    }

    const taskId = this.resolveTaskId(event);
    if (!taskId) {
      throw new AutomationActionSkippedError(
        'Cannot resolve task for ASSIGN_USER (missing task context)',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId: event.orgId },
      select: { id: true },
    });
    if (!task) {
      throw new AutomationActionSkippedError('Task not found for ASSIGN_USER');
    }

    const member = await this.prisma.orgMember.findFirst({
      where: { orgId: event.orgId, userId },
      select: { userId: true },
    });
    if (!member) {
      throw new AutomationActionSkippedError(
        'Target user is not a member of this organization',
      );
    }

    await this.prisma.taskMembership.deleteMany({
      where: {
        orgId: event.orgId,
        taskId: task.id,
        role: TaskMemberRole.ASSIGNEE,
      },
    });

    await this.prisma.taskMembership.create({
      data: {
        orgId: event.orgId,
        taskId: task.id,
        userId,
        role: TaskMemberRole.ASSIGNEE,
      },
    });
  }

  private resolveTaskId(event: AutomationEvent): string | null {
    if (event.entityType === 'TASK') {
      return event.entityId;
    }
    if (event.entityType === 'COMMENT') {
      const fromMeta = event.metadata?.taskId;
      const fromAfter = event.after?.taskId;
      return typeof fromMeta === 'string'
        ? fromMeta
        : typeof fromAfter === 'string'
          ? fromAfter
          : null;
    }
    return null;
  }
}
