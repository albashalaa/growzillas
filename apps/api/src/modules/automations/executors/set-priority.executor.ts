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

const ALLOWED_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

@Injectable()
export class SetPriorityExecutor extends BaseActionExecutor {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  supports(type: AutomationActionType): boolean {
    return type === 'SET_PRIORITY';
  }

  async execute(action: AutomationAction, event: AutomationEvent): Promise<void> {
    const raw = action.config.priority;
    const priority = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (!priority || !ALLOWED_PRIORITIES.has(priority)) {
      throw new AutomationActionSkippedError(
        'SET_PRIORITY requires config.priority (LOW|MEDIUM|HIGH|URGENT)',
      );
    }

    const taskId = this.resolveTaskId(event);
    if (!taskId) {
      throw new AutomationActionSkippedError(
        'Cannot resolve task for SET_PRIORITY (missing task context)',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId: event.orgId },
      select: { id: true, priority: true },
    });
    if (!task) {
      throw new AutomationActionSkippedError('Task not found for SET_PRIORITY');
    }
    if (task.priority === priority) {
      throw new AutomationActionSkippedError('Priority is already set to this value');
    }

    await this.prisma.task.update({
      where: { id: task.id },
      data: { priority },
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
