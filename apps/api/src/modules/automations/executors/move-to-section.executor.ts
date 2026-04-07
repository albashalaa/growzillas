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
export class MoveToSectionExecutor extends BaseActionExecutor {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  supports(type: AutomationActionType): boolean {
    return type === 'MOVE_TO_SECTION';
  }

  async execute(action: AutomationAction, event: AutomationEvent): Promise<void> {
    const raw = action.config.sectionId;
    const sectionId =
      typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    if (!sectionId) {
      throw new AutomationActionSkippedError(
        'MOVE_TO_SECTION requires config.sectionId',
      );
    }

    const taskId = this.resolveTaskId(event);
    if (!taskId) {
      throw new AutomationActionSkippedError(
        'Cannot resolve task for MOVE_TO_SECTION (missing task context)',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId: event.orgId },
      select: { id: true, projectId: true, sectionId: true },
    });
    if (!task) {
      throw new AutomationActionSkippedError('Task not found for MOVE_TO_SECTION');
    }
    if (task.sectionId === sectionId) {
      throw new AutomationActionSkippedError('Task is already in target section');
    }

    const section = await this.prisma.projectSection.findFirst({
      where: { id: sectionId, orgId: event.orgId, projectId: task.projectId },
      select: { id: true },
    });
    if (!section) {
      throw new AutomationActionSkippedError(
        'Target section does not belong to task project',
      );
    }

    await this.prisma.task.update({
      where: { id: task.id },
      data: { sectionId },
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
