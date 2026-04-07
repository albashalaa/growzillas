import { Injectable } from '@nestjs/common';

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
export class SetReviewerExecutor extends BaseActionExecutor {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  supports(type: AutomationActionType): boolean {
    return type === 'SET_REVIEWER';
  }

  async execute(action: AutomationAction, event: AutomationEvent): Promise<void> {
    const raw = action.config.userId;
    const userId =
      typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    if (!userId) {
      throw new AutomationActionSkippedError('SET_REVIEWER requires config.userId');
    }

    const taskId = this.resolveTaskId(event);
    if (!taskId) {
      throw new AutomationActionSkippedError(
        'Cannot resolve task for SET_REVIEWER (missing task context)',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId: event.orgId },
      select: { id: true, reviewerId: true },
    });

    if (!task) {
      throw new AutomationActionSkippedError('Task not found for SET_REVIEWER');
    }

    if (task.reviewerId === userId) {
      throw new AutomationActionSkippedError('Reviewer is already set to this user');
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

    await this.prisma.task.update({
      where: { id: task.id },
      data: { reviewerId: userId },
    });
  }

  private resolveTaskId(event: AutomationEvent): string | null {
    if (event.entityType === 'TASK') {
      return event.entityId;
    }
    if (event.entityType === 'COMMENT') {
      const fromMeta = event.metadata?.taskId;
      const fromAfter = event.after?.taskId;
      const tid =
        typeof fromMeta === 'string'
          ? fromMeta
          : typeof fromAfter === 'string'
            ? fromAfter
            : null;
      return tid;
    }
    return null;
  }
}
