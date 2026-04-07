import { Injectable } from '@nestjs/common';
import { TaskMemberRole } from '@prisma/client';

import { NotificationTypes } from '../../../notifications/notification-types';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AutomationAction,
  AutomationActionType,
  AutomationEvent,
  AutomationEventType,
} from '../types/automation.types';
import {
  AutomationActionSkippedError,
  BaseActionExecutor,
} from './base-action-executor';

type NotifyTarget = 'USER' | 'ASSIGNEE' | 'REVIEWER';

@Injectable()
export class NotifyExecutor extends BaseActionExecutor {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  supports(type: AutomationActionType): boolean {
    return type === 'SEND_NOTIFICATION';
  }

  async execute(action: AutomationAction, event: AutomationEvent): Promise<void> {
    const { target, userId, notifyActor } = this.parseConfig(action.config);

    const taskId = this.resolveTaskId(event);
    if (!taskId) {
      throw new AutomationActionSkippedError(
        'Cannot resolve task for notification (missing task context)',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId: event.orgId },
      select: {
        id: true,
        projectId: true,
        reviewerId: true,
        title: true,
        priority: true,
        sectionId: true,
      },
    });

    if (!task) {
      throw new AutomationActionSkippedError('Task not found for notification');
    }

    const recipients = await this.resolveRecipients({
      target,
      userId,
      notifyActor,
      event,
      taskId: task.id,
      reviewerId: task.reviewerId,
    });

    if (recipients.length === 0) {
      throw new AutomationActionSkippedError('No notification recipients resolved');
    }

    const storyId = await this.resolveAnchorStoryId({
      event,
      task,
      target,
      userId,
      notifyActor,
    });

    await this.prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: event.orgId,
        userId: uid,
        storyId,
        taskId: task.id,
        type: NotificationTypes.AUTOMATION,
      })),
      skipDuplicates: true,
    });
  }

  private parseConfig(config: AutomationAction['config']): {
    target: NotifyTarget;
    userId?: string;
    notifyActor: boolean;
  } {
    const rawTarget = String(config.target ?? '')
      .trim()
      .toUpperCase();
    if (rawTarget !== 'USER' && rawTarget !== 'ASSIGNEE' && rawTarget !== 'REVIEWER') {
      throw new AutomationActionSkippedError(
        'config.target must be USER, ASSIGNEE, or REVIEWER',
      );
    }
    const target = rawTarget as NotifyTarget;

    const userId =
      typeof config.userId === 'string' && config.userId.trim().length > 0
        ? config.userId.trim()
        : undefined;

    const notifyActor =
      config.notifyActor === true || String(config.notifyActor).toLowerCase() === 'true';

    return { target, userId, notifyActor };
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

  private async resolveRecipients(params: {
    target: NotifyTarget;
    userId?: string;
    notifyActor: boolean;
    event: AutomationEvent;
    taskId: string;
    reviewerId: string | null;
  }): Promise<string[]> {
    const { target, userId, notifyActor, event, taskId, reviewerId } = params;
    const actorId = event.actorUserId ?? null;

    let ids: string[] = [];

    if (target === 'USER') {
      if (!userId) {
        return [];
      }
      const member = await this.prisma.orgMember.findFirst({
        where: { orgId: event.orgId, userId },
        select: { userId: true },
      });
      if (!member) {
        return [];
      }
      ids = [userId];
    } else if (target === 'ASSIGNEE') {
      const rows = await this.prisma.taskMembership.findMany({
        where: {
          orgId: event.orgId,
          taskId,
          role: TaskMemberRole.ASSIGNEE,
        },
        select: { userId: true },
      });
      ids = rows.map((r) => r.userId);
    } else {
      if (reviewerId) {
        ids = [reviewerId];
      }
    }

    const unique = Array.from(new Set(ids));

    // By default, do not notify the user who triggered the automation (reduces noise).
    // For REVIEWER / USER targets, set config.notifyActor=true when the recipient may be the
    // same as the actor (e.g. moved task to Review and you are the reviewer).
    if (!notifyActor && actorId) {
      return unique.filter((id) => id !== actorId);
    }

    return unique;
  }
  /**
   * Notifications require a Story row.
   *
   * We reuse the comment story for COMMENT events and create a lightweight ACTIVITY story
   * for TASK events. The UI reads `story.body` via NotificationsService -> `commentBody`.
   */
  private async resolveAnchorStoryId(params: {
    event: AutomationEvent;
    task: {
      id: string;
      title: string;
      priority: string;
      sectionId: string;
      reviewerId: string | null;
    };
    target: NotifyTarget;
    userId?: string;
    notifyActor: boolean;
  }): Promise<string> {
    const { event, task, target } = params;

    if (event.entityType === 'COMMENT') {
      const story = await (this.prisma as any).story.findFirst({
        where: {
          id: event.entityId,
          orgId: event.orgId,
          taskId: task.id,
          type: 'COMMENT',
        },
        select: { id: true },
      });
      if (!story) {
        throw new AutomationActionSkippedError('Comment story not found');
      }
      return story.id;
    }

    const sectionName = await this.resolveSectionName(event.orgId, task.sectionId);
    const message = this.buildAutomationNotificationMessage({
      target,
      taskTitle: task.title,
      taskPriority: task.priority,
      taskSectionName: sectionName ?? 'the selected section',
      event,
    });

    const copy = this.buildAutomationCopy(event);

    const story = await (this.prisma as any).story.create({
      data: {
        orgId: event.orgId,
        taskId: task.id,
        type: 'ACTIVITY',
        createdById: event.actorUserId ?? undefined,
        // The notifications UI uses this as the human-readable message.
        body: message,
        metadata: {
          action: 'AUTOMATION_NOTIFICATION',
          eventType: event.type,
          entityType: event.entityType,
          entityId: event.entityId,
          projectId: event.projectId ?? null,
          actorUserId: event.actorUserId ?? null,
          // Keep debug fields too (useful in future).
          title: copy.title,
          body: message,
        } as Record<string, unknown>,
      },
      select: { id: true },
    });

    return story.id;
  }

  private async resolveSectionName(orgId: string, sectionId: string): Promise<string | null> {
    if (!sectionId) return null;
    const section = await this.prisma.projectSection.findFirst({
      where: { id: sectionId, orgId },
      select: { name: true },
    });
    return section?.name ?? null;
  }

  private buildAutomationNotificationMessage(params: {
    target: NotifyTarget;
    taskTitle: string;
    taskSectionName: string;
    taskPriority: string;
    event: AutomationEvent;
  }): string {
    const { target, taskTitle, taskSectionName, taskPriority, event } = params;

    if (!taskTitle) return 'An automation updated a task';

    // Target-based messages provide the most reliable UX signal because the notification recipient
    // is chosen based on this target.
    if (target === 'REVIEWER') return `You were assigned as reviewer for ${taskTitle}`;
    if (target === 'ASSIGNEE') return `You were assigned to ${taskTitle}`;

    // USER target: best-effort context from trigger payload.
    const after = event.after ?? {};
    const before = event.before ?? {};
    const afterPriority =
      typeof (after as any).priority === 'string' ? ((after as any).priority as string) : null;
    const afterSectionId =
      typeof (after as any).sectionId === 'string' ? ((after as any).sectionId as string) : null;
    const beforeSectionId =
      typeof (before as any).sectionId === 'string' ? ((before as any).sectionId as string) : null;

    // If the trigger changed the section, show that.
    // NOTE: For non-section-change triggers (e.g. TASK_CREATED), payloads may still include
    // `after.sectionId`, but the section wasn't necessarily "moved" as part of the trigger.
    if (event.type === 'TASK_SECTION_CHANGED') {
      // Prefer "moved to ..." even when section changes come from automation actions.
      // We only have the recipient-side view, so "You were notified that" isn't necessary.
      if (afterSectionId || beforeSectionId) {
        return `${taskTitle} was moved to ${taskSectionName}`;
      }
    }

    // If we can detect a priority change vs trigger snapshot, use the more specific message.
    if (afterPriority && afterPriority !== taskPriority) {
      return `Priority for ${taskTitle} was set to ${taskPriority}`;
    }

    if (afterPriority && event.type === 'TASK_CREATED') {
      return `Priority for ${taskTitle} was set to ${taskPriority}`;
    }

    return `An automation updated ${taskTitle}`;
  }

  private buildAutomationCopy(event: AutomationEvent): {
    title: string;
    body: string;
  } {
    const title = this.titleForEventType(event.type);
    const lines = [
      title,
      '',
      `Event: ${event.type}`,
      `Entity: ${event.entityType} ${event.entityId}`,
    ];
    if (event.projectId) {
      lines.push(`Project: ${event.projectId}`);
    }
    if (event.actorUserId) {
      lines.push(`Actor: ${event.actorUserId}`);
    }
    return { title, body: lines.join('\n') };
  }

  private titleForEventType(type: AutomationEventType): string {
    switch (type) {
      case 'TASK_CREATED':
        return 'Automation: task created';
      case 'TASK_SECTION_CHANGED':
        return 'Automation: task moved';
      case 'TASK_ASSIGNED':
        return 'Automation: assignment updated';
      case 'COMMENT_CREATED':
        return 'Automation: new comment';
      default:
        return 'Automation notification';
    }
  }
}
