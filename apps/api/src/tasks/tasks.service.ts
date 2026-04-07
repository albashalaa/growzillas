import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AutomationEngineService } from '../modules/automations/automation-engine.service';
import type { AutomationEvent } from '../modules/automations/types/automation.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTypes } from '../notifications/notification-types';
import type { RequestUser } from '../auth/jwt.strategy';
import { join, extname } from 'path';
import * as fs from 'fs';

const ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automationEngine: AutomationEngineService,
  ) {}

  private async emitAutomationEvent(event: AutomationEvent): Promise<void> {
    try {
      await this.automationEngine.handleEvent(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Automation handling failed for ${event.type} (entity ${event.entityId}): ${message}`,
      );
    }
  }

  private getOrgId(user: RequestUser): string {
    if (!user.orgId) {
      throw new BadRequestException('Organization context is required');
    }
    return user.orgId;
  }

  private parseOptionalDateOrThrow(
    raw: string | null | undefined,
    fieldName: string,
  ): Date | undefined {
    if (raw == null) {
      return undefined;
    }
    if (String(raw).trim().length === 0) {
      return undefined;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO date`);
    }
    return parsed;
  }

  async getTaskById(id: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id,
        orgId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        section: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      projectId: task.projectId,
      project: task.project,
      projectName: task.project?.name ?? null,
      parentId: task.parentId,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
      reviewerId: task.reviewerId,
      reviewer: task.reviewer,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async listTasks(projectId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const tasks = await this.prisma.task.findMany({
      where: {
        orgId,
        projectId,
      },
      orderBy: [
        { section: { order: 'asc' } },
        { createdAt: 'asc' },
      ],
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        section: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Done column should show most recently completed items first.
    // We apply a Done-only re-ordering here (frontend relies on API order).
    // completedAt is not present in the current Prisma model; we still code
    // defensively to prefer it if it exists in future schema revisions.
    const tasksWithIndex = tasks.map((task, idx) => ({ task, idx }));
    const isDone = (t: typeof tasksWithIndex[number]['task']) =>
      t.section?.name?.toLowerCase() === 'done';

    const doneTasks = tasksWithIndex
      .filter(({ task }) => isDone(task))
      .sort((a, b) => {
        const completedA = (a.task as any).completedAt as Date | null | undefined;
        const completedB = (b.task as any).completedAt as Date | null | undefined;

        const keyA = completedA ? completedA.getTime() : a.task.updatedAt.getTime();
        const keyB = completedB ? completedB.getTime() : b.task.updatedAt.getTime();

        // DESC: newest first
        if (keyA !== keyB) return keyB - keyA;
        // Stable ordering within same timestamp
        return a.idx - b.idx;
      });

    let donePtr = 0;
    const orderedTasks = tasksWithIndex.map(({ task }) =>
      isDone(task) ? doneTasks[donePtr++].task : task,
    );

    return orderedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      project: task.project,
      projectName: task.project?.name ?? null,
      parentId: task.parentId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
      reviewerId: task.reviewerId,
      reviewer: task.reviewer,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  }

  async createTask(
    input: {
      projectId: string;
      title: string;
      description?: string;
      dueDate?: string | null;
      sectionId?: string;
      assigneeUserId?: string;
      assigneeId?: string | null;
      priority?: string;
    },
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);
    const normalizedProjectId = input.projectId?.trim();
    if (!normalizedProjectId) {
      throw new BadRequestException('Project is required');
    }

    // Org-scoped: project must belong to current org
    const project = await this.prisma.project.findFirst({
      where: {
        id: normalizedProjectId,
        orgId,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    let sectionId = input.sectionId;

    if (sectionId) {
      // Validate section belongs to the given projectId AND same org
      const section = await this.prisma.projectSection.findFirst({
        where: {
          id: sectionId,
          orgId,
          projectId: project.id,
        },
        select: { id: true },
      });

      if (!section) {
        throw new BadRequestException(
          'Section does not belong to this project or organization',
        );
      }
    } else {
      // Auto-pick first section by order, then createdAt
      const firstSection = await this.prisma.projectSection.findFirst({
        where: {
          orgId,
          projectId: project.id,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
        },
      });

      if (!firstSection) {
        throw new BadRequestException(
          'Project has no sections to add tasks into',
        );
      }

      sectionId = firstSection.id;
    }

    const dueDate = this.parseOptionalDateOrThrow(input.dueDate, 'dueDate');

    const task = await this.prisma.task.create({
      data: {
        orgId,
        projectId: project.id,
        sectionId,
        title: input.title,
        description: input.description,
        priority: input.priority || 'MEDIUM',
        dueDate,
      },
    });

    const createdStory = await (this.prisma as any).story.create({
      data: {
        orgId,
        taskId: task.id,
        createdById: user.userId,
        type: 'ACTIVITY',
        metadata: {
          action: 'TASK_CREATED',
          title: task.title,
        },
      },
    });

    const assigneeId = input.assigneeUserId ?? input.assigneeId ?? undefined;
    if (assigneeId) {
      const member = await this.prisma.orgMember.findFirst({
        where: {
          orgId,
          userId: assigneeId,
        },
        select: {
          id: true,
        },
      });

      if (!member) {
        throw new BadRequestException(
          'Assignee must be a member of this organization',
        );
      }

      await this.prisma.taskMembership.create({
        data: {
          orgId,
          taskId: task.id,
          userId: assigneeId,
        },
      });

      // Notify the new assignee (personal) + due-soon if applicable.
      const now = Date.now();
      const dueSoonWindowMs = 48 * 60 * 60 * 1000;
      const dueTime =
        dueDate instanceof Date ? dueDate.getTime() : undefined;
      const isDueSoon =
        typeof dueTime === 'number' && dueTime >= now && dueTime <= now + dueSoonWindowMs;

      const recipients = [assigneeId].filter((id) => id !== user.userId);
      if (recipients.length > 0) {
        await this.prisma.notification.createMany({
          data: [
            ...recipients.map((userId) => ({
              orgId,
              userId,
              storyId: createdStory.id,
              taskId: task.id,
              type: NotificationTypes.TASK_ASSIGNED,
            })),
            ...(isDueSoon
              ? recipients.map((userId) => ({
                  orgId,
                  userId,
                  storyId: createdStory.id,
                  taskId: task.id,
                  type: NotificationTypes.TASK_DUE_SOON,
                }))
              : []),
          ],
          skipDuplicates: true,
        });
      }
    }

    const membershipsAfterCreate = await this.prisma.taskMembership.findMany({
      where: { orgId, taskId: task.id, role: 'ASSIGNEE' },
      select: { userId: true },
    });
    const assigneeUserIds = membershipsAfterCreate
      .map((m) => m.userId)
      .sort();

    await this.emitAutomationEvent({
      type: 'TASK_CREATED',
      orgId,
      projectId: task.projectId,
      actorUserId: user.userId,
      entityType: 'TASK',
      entityId: task.id,
      timestamp: new Date().toISOString(),
      before: {},
      after: {
        title: task.title,
        sectionId: task.sectionId,
        priority: task.priority,
        assigneeUserIds,
      },
      metadata: { projectId: task.projectId },
    });

    return task;
  }

  async updateTask(
    id: string,
    input: {
      title?: string;
      description?: string;
      dueDate?: string | null;
      sectionId?: string;
      assigneeUserId?: string;
      reviewerUserId?: string;
      priority?: string;
    },
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const existing = await this.prisma.task.findFirst({
      where: {
        id,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        title: true,
        dueDate: true,
        sectionId: true,
        priority: true,
        reviewerId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data: {
      title?: string;
      description?: string;
      dueDate?: Date | null;
      sectionId?: string;
      priority?: string;
      reviewerId?: string | null;
    } = {};

    if (typeof input.title === 'string') {
      data.title = input.title;
    }

    if (typeof input.description === 'string') {
      data.description = input.description;
    }

    if (input.priority !== undefined) {
      data.priority = input.priority || 'MEDIUM';
    }

    if (input.dueDate !== undefined) {
      if (input.dueDate === null || input.dueDate.trim().length === 0) {
        data.dueDate = null;
      } else {
        const parsedDueDate = this.parseOptionalDateOrThrow(
          input.dueDate,
          'dueDate',
        );
        data.dueDate = parsedDueDate ?? null;
      }
    }

    if (input.sectionId) {
      const section = await this.prisma.projectSection.findFirst({
        where: {
          id: input.sectionId,
          orgId,
          projectId: existing.projectId,
        },
        select: { id: true },
      });

      if (!section) {
        throw new BadRequestException(
          'Section does not belong to this project or organization',
        );
      }

      data.sectionId = input.sectionId;
    }

    if (input.reviewerUserId !== undefined) {
      const reviewerId = input.reviewerUserId.trim();
      if (!reviewerId) {
        data.reviewerId = null;
      } else {
        const member = await this.prisma.orgMember.findFirst({
          where: {
            orgId,
            userId: reviewerId,
          },
          select: { id: true },
        });

        if (!member) {
          throw new BadRequestException(
            'Reviewer must be a member of this organization',
          );
        }

        data.reviewerId = reviewerId;
      }
    }

    const updated = await this.prisma.task.update({
      where: {
        id: existing.id,
      },
      data,
    });

    if (
      existing.sectionId !== undefined &&
      updated.sectionId !== undefined &&
      existing.sectionId !== updated.sectionId
    ) {
      const assigneeRows = await this.prisma.taskMembership.findMany({
        where: { orgId, taskId: existing.id, role: 'ASSIGNEE' },
        select: { userId: true },
      });
      const assigneeUserIds = assigneeRows.map((m) => m.userId).sort();

      await this.emitAutomationEvent({
        type: 'TASK_SECTION_CHANGED',
        orgId,
        projectId: existing.projectId,
        actorUserId: user.userId,
        entityType: 'TASK',
        entityId: existing.id,
        timestamp: new Date().toISOString(),
        before: {
          sectionId: existing.sectionId,
          priority: existing.priority,
          assigneeUserIds,
        },
        after: {
          sectionId: updated.sectionId,
          priority: updated.priority,
          assigneeUserIds,
        },
        metadata: { taskId: existing.id, projectId: existing.projectId },
      });
    }

    // Log field-level changes as activity stories
    const oldTitle = existing.title;
    const newTitle = updated.title;
    if (oldTitle !== undefined && newTitle !== undefined && oldTitle !== newTitle) {
      await (this.prisma as any).story.create({
        data: {
          orgId,
          taskId: existing.id,
          createdById: user.userId,
          type: 'ACTIVITY',
          metadata: {
            action: 'TASK_TITLE_CHANGED',
            from: oldTitle,
            to: newTitle,
          },
        },
      });
    }

    const oldDue =
      existing.dueDate instanceof Date ? existing.dueDate.toISOString() : null;
    const newDue =
      updated.dueDate instanceof Date ? updated.dueDate.toISOString() : null;
    let dueDateStoryId: string | null = null;
    if (oldDue !== newDue) {
      const dueStory = await (this.prisma as any).story.create({
        data: {
          orgId,
          taskId: existing.id,
          createdById: user.userId,
          type: 'ACTIVITY',
          metadata: {
            action: 'TASK_DUE_DATE_CHANGED',
            from: oldDue,
            to: newDue,
          },
        },
      });
      dueDateStoryId = dueStory.id;
    }

    const oldSectionId = existing.sectionId;
    const newSectionId = updated.sectionId;
    if (oldSectionId !== undefined && newSectionId !== undefined && oldSectionId !== newSectionId) {
      await (this.prisma as any).story.create({
        data: {
          orgId,
          taskId: existing.id,
          createdById: user.userId,
          type: 'ACTIVITY',
          metadata: {
            action: 'TASK_MOVED',
            fromSectionId: oldSectionId,
            toSectionId: newSectionId,
          },
        },
      });
    }

    // Handle assignee change: single-assignee semantics for UI
    if (input.assigneeUserId !== undefined) {
      const beforeMemberships = await this.prisma.taskMembership.findMany({
        where: {
          orgId,
          taskId: existing.id,
          role: 'ASSIGNEE',
        },
        select: { userId: true },
      });

      // Clear existing memberships
      await this.prisma.taskMembership.deleteMany({
        where: {
          orgId,
          taskId: existing.id,
        },
      });

      const assigneeId = input.assigneeUserId.trim();
      if (assigneeId.length > 0) {
        const member = await this.prisma.orgMember.findFirst({
          where: {
            orgId,
            userId: assigneeId,
          },
          select: { id: true },
        });

        if (!member) {
          throw new BadRequestException(
            'Assignee must be a member of this organization',
          );
        }

        await this.prisma.taskMembership.create({
          data: {
            orgId,
            taskId: existing.id,
            userId: assigneeId,
          },
        });
      }

      const afterMemberships = await this.prisma.taskMembership.findMany({
        where: {
          orgId,
          taskId: existing.id,
          role: 'ASSIGNEE',
        },
        select: { userId: true },
      });

      const beforeIds = beforeMemberships.map((m) => m.userId).sort();
      const afterIds = afterMemberships.map((m) => m.userId).sort();

      const changed =
        beforeIds.length !== afterIds.length ||
        beforeIds.some((id, idx) => id !== afterIds[idx]);

      if (changed) {
        await this.emitAutomationEvent({
          type: 'TASK_ASSIGNED',
          orgId,
          projectId: existing.projectId,
          actorUserId: user.userId,
          entityType: 'TASK',
          entityId: existing.id,
          timestamp: new Date().toISOString(),
          before: {
            assigneeUserIds: beforeIds,
            sectionId: updated.sectionId,
            priority: updated.priority,
          },
          after: {
            assigneeUserIds: afterIds,
            sectionId: updated.sectionId,
            priority: updated.priority,
          },
          metadata: { taskId: existing.id, projectId: existing.projectId },
        });

        const assigneeStory = await (this.prisma as any).story.create({
          data: {
            orgId,
            taskId: existing.id,
            createdById: user.userId,
            type: 'ACTIVITY',
            metadata: {
              action: 'TASK_ASSIGNEE_CHANGED',
              fromUserIds: beforeIds,
              toUserIds: afterIds,
            },
          },
        });

        const assigneeStoryId: string | undefined =
          (assigneeStory as any)?.id;

        if (assigneeStoryId) {
          // Notify newly added assignees only (personal only).
          const newAssigneeIds = afterIds.filter(
            (id) => !beforeIds.includes(id),
          );
          const recipients = newAssigneeIds.filter(
            (id) => id && id !== user.userId,
          );

          if (recipients.length > 0) {
            const notificationType = existing.parentId
              ? NotificationTypes.SUBTASK_ASSIGNED
              : NotificationTypes.TASK_ASSIGNED;

            await this.prisma.notification.createMany({
              data: recipients.map((userId) => ({
                orgId,
                userId,
                storyId: assigneeStoryId,
                taskId: existing.id,
                type: notificationType,
              })),
              skipDuplicates: true,
            });
          }

          // Also notify due-soon for newly added assignees (if due date is within window).
          const dueSoonWindowMs = 48 * 60 * 60 * 1000;
          const dueTime =
            updated.dueDate instanceof Date
              ? updated.dueDate.getTime()
              : undefined;
          const isDueSoon =
            typeof dueTime === 'number' &&
            dueTime >= Date.now() &&
            dueTime <= Date.now() + dueSoonWindowMs;

          if (recipients.length > 0 && isDueSoon) {
            await this.prisma.notification.createMany({
              data: recipients.map((userId) => ({
                orgId,
                userId,
                storyId: assigneeStoryId,
                taskId: existing.id,
                type: NotificationTypes.TASK_DUE_SOON,
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    }

    // Personal due-soon notifications when the due date changes.
    if (dueDateStoryId) {
      const dueSoonWindowMs = 48 * 60 * 60 * 1000;
      const dueTime =
        updated.dueDate instanceof Date
          ? updated.dueDate.getTime()
          : undefined;
      const isDueSoon =
        typeof dueTime === 'number' &&
        dueTime >= Date.now() &&
        dueTime <= Date.now() + dueSoonWindowMs;

      if (isDueSoon) {
        const memberships = await this.prisma.taskMembership.findMany({
          where: { orgId, taskId: existing.id },
          select: { userId: true },
        });

        const recipients = memberships
          .map((m) => m.userId)
          .filter((id) => id !== user.userId);

        if (recipients.length > 0) {
          await this.prisma.notification.createMany({
            data: recipients.map((userId) => ({
              orgId,
              userId,
              storyId: dueDateStoryId,
              taskId: existing.id,
              type: NotificationTypes.TASK_DUE_SOON,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    const full = await this.prisma.task.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        section: { select: { id: true, name: true } },
        memberships: {
          include: {
            user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    return {
      id: full.id,
      title: full.title,
      description: full.description,
      priority: full.priority,
      dueDate: full.dueDate,
      projectId: full.projectId,
      project: full.project,
      projectName: full.project?.name ?? null,
      parentId: full.parentId,
      sectionId: full.sectionId,
      section: full.section,
      assignees: full.memberships.map((m) => m.user),
      reviewerId: full.reviewerId,
      reviewer: full.reviewer,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
    };
  }

  async deleteTask(id: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const existing = await this.prisma.task.findFirst({
      where: {
        id,
        orgId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // Remove memberships first (defensive even though FKs use CASCADE)
    await this.prisma.taskMembership.deleteMany({
      where: {
        orgId,
        taskId: existing.id,
      },
    });

    await this.prisma.task.delete({
      where: {
        id: existing.id,
      },
    });
  }

  async addAssignee(taskId: string, userId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        dueDate: true,
        sectionId: true,
        priority: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const member = await this.prisma.orgMember.findFirst({
      where: {
        orgId,
        userId,
      },
      select: { id: true },
    });

    if (!member) {
      throw new BadRequestException(
        'Assignee must be a member of this organization',
      );
    }

    const existingMembership = await this.prisma.taskMembership.findFirst({
      where: {
        orgId,
        taskId: task.id,
        userId,
      },
      select: { id: true },
    });

    if (!existingMembership) {
      const beforeAssigneeRows = await this.prisma.taskMembership.findMany({
        where: {
          orgId,
          taskId: task.id,
          role: 'ASSIGNEE',
        },
        select: { userId: true },
      });
      const beforeAssigneeIds = beforeAssigneeRows.map((m) => m.userId).sort();

      await this.prisma.taskMembership.create({
        data: {
          orgId,
          taskId: task.id,
          userId,
        },
      });

      const afterAssigneeRows = await this.prisma.taskMembership.findMany({
        where: {
          orgId,
          taskId: task.id,
          role: 'ASSIGNEE',
        },
        select: { userId: true },
      });
      const afterAssigneeIds = afterAssigneeRows.map((m) => m.userId).sort();

      await this.emitAutomationEvent({
        type: 'TASK_ASSIGNED',
        orgId,
        projectId: task.projectId,
        actorUserId: user.userId,
        entityType: 'TASK',
        entityId: task.id,
        timestamp: new Date().toISOString(),
        before: {
          assigneeUserIds: beforeAssigneeIds,
          sectionId: task.sectionId,
          priority: task.priority,
        },
        after: {
          assigneeUserIds: afterAssigneeIds,
          sectionId: task.sectionId,
          priority: task.priority,
        },
        metadata: { taskId: task.id, projectId: task.projectId },
      });

      // Notify newly added assignee (personal only).
      const assigneeStory = await (this.prisma as any).story.create({
        data: {
          orgId,
          taskId: task.id,
          createdById: user.userId,
          type: 'ACTIVITY',
          metadata: {
            action: 'TASK_ASSIGNEE_CHANGED',
            toUserIds: [userId],
          },
        },
      });

      const assigneeStoryId: string | undefined =
        (assigneeStory as any)?.id;

      const recipients = [userId].filter((id) => id !== user.userId);
      if (assigneeStoryId && recipients.length > 0) {
        await this.prisma.notification.createMany({
          data: recipients.map((recipientId) => ({
            orgId,
            userId: recipientId,
            storyId: assigneeStoryId,
            taskId: task.id,
            type: task.parentId
              ? NotificationTypes.SUBTASK_ASSIGNED
              : NotificationTypes.TASK_ASSIGNED,
          })),
          skipDuplicates: true,
        });

        // MVP due-soon (48h window) based on current dueDate.
        const now = Date.now();
        const dueSoonWindowMs = 48 * 60 * 60 * 1000;
        const dueTime =
          task.dueDate instanceof Date ? task.dueDate.getTime() : undefined;
        const isDueSoon =
          typeof dueTime === 'number' &&
          dueTime >= now &&
          dueTime <= now + dueSoonWindowMs;

        if (isDueSoon) {
          await this.prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
              orgId,
              userId: recipientId,
              storyId: assigneeStoryId,
              taskId: task.id,
              type: NotificationTypes.TASK_DUE_SOON,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    return { success: true };
  }

  async getTaskStories(taskId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        orgId,
      },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const stories = await (this.prisma as any).story.findMany({
      where: {
        orgId,
        taskId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return stories;
  }

  async addComment(
    taskId: string,
    body: string,
    mentions: string[],
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        orgId,
      },
      select: { id: true, projectId: true, sectionId: true, priority: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate mentioned users belong to this org (if any) but always persist mentions
    // when the client sends them, so metadata is never silently dropped.
    interface CommentStoryMetadata {
      mentions?: string[];
    }
    let metadata: CommentStoryMetadata | null = null;
    if (Array.isArray(mentions) && mentions.length > 0) {
      const uniqueIds = Array.from(new Set(mentions));
      const orgMembers = await this.prisma.orgMember.findMany({
        where: {
          orgId,
          userId: {
            in: uniqueIds,
          },
        },
        select: {
          userId: true,
        },
      });
      const validIds = orgMembers.map((m) => m.userId);

      const finalIds = validIds.length > 0 ? validIds : uniqueIds;

      metadata = {
        mentions: finalIds,
      };
    }

    const story = await (this.prisma as any).story.create({
      data: {
        orgId,
        taskId,
        type: 'COMMENT',
        body,
        metadata,
        createdById: user.userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const assigneeRows = await this.prisma.taskMembership.findMany({
      where: { orgId, taskId: task.id, role: 'ASSIGNEE' },
      select: { userId: true },
    });
    const assigneeUserIds = assigneeRows.map((m) => m.userId).sort();

    await this.emitAutomationEvent({
      type: 'COMMENT_CREATED',
      orgId,
      projectId: task.projectId,
      actorUserId: user.userId,
      entityType: 'COMMENT',
      entityId: story.id,
      timestamp: new Date().toISOString(),
      after: {
        body,
        taskId: task.id,
        mentions: Array.isArray(metadata?.mentions)
          ? [...metadata.mentions]
          : [],
        sectionId: task.sectionId,
        priority: task.priority,
        assigneeUserIds,
      },
      metadata: {
        taskId: task.id,
        projectId: task.projectId,
        storyId: story.id,
        mentionUserIds: Array.isArray(metadata?.mentions)
          ? [...metadata.mentions]
          : [],
      },
    });

    // Create per-user mention notifications (COMMENT_MENTION)
    // Only when the comment body actually contains an "@" mention token.
    if (
      typeof body === 'string' &&
      body.includes('@') &&
      Array.isArray(metadata?.mentions) &&
      metadata.mentions.length > 0
    ) {
      const mentionUserIds = Array.from(new Set(metadata.mentions as string[]));
      const filtered = mentionUserIds.filter((id) => id && id !== user.userId);
      if (filtered.length > 0) {
        await this.prisma.notification.createMany({
          data: filtered.map((userId) => ({
            orgId,
            userId,
            storyId: story.id,
            taskId: task.id,
            type: NotificationTypes.COMMENT_MENTION,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Notify assignees that someone commented on a task (personal only).
    // Exclude the actor to avoid self-notifications.
    const assignees = await this.prisma.taskMembership.findMany({
      where: { orgId, taskId: task.id },
      select: { userId: true },
    });

    const commentRecipients = assignees
      .map((m) => m.userId)
      .filter((id) => id && id !== user.userId);

    if (commentRecipients.length > 0) {
      await this.prisma.notification.createMany({
        data: commentRecipients.map((userId) => ({
          orgId,
          userId,
          storyId: story.id,
          taskId: task.id,
          type: NotificationTypes.TASK_COMMENTED,
        })),
        skipDuplicates: true,
      });
    }

    return story;
  }

  async updateComment(
    taskId: string,
    commentId: string,
    body: string,
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const trimmed = (body || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Comment body is required');
    }

    const existing = await (this.prisma as any).story.findFirst({
      where: {
        id: commentId,
        taskId,
        orgId,
        type: 'COMMENT',
      },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Comment not found');
    }

    if (existing.createdById !== user.userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const story = await (this.prisma as any).story.update({
      where: { id: existing.id },
      data: {
        body: trimmed,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return story;
  }

  async deleteComment(
    taskId: string,
    commentId: string,
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const existing = await (this.prisma as any).story.findFirst({
      where: {
        id: commentId,
        taskId,
        orgId,
        type: 'COMMENT',
      },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Comment not found');
    }

    if (existing.createdById !== user.userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await (this.prisma as any).story.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }

  async listSubtasks(parentId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const parent = await this.prisma.task.findFirst({
      where: {
        id: parentId,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        sectionId: true,
        priority: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Task not found');
    }

    const subtasks = await this.prisma.task.findMany({
      where: {
        orgId,
        projectId: parent.projectId,
        parentId: parent.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        section: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return subtasks.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      project: task.project,
      projectName: task.project?.name ?? null,
      parentId: task.parentId,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
      reviewerId: task.reviewerId,
      reviewer: task.reviewer,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  }

  async createSubtask(
    parentId: string,
    input: {
      title: string;
      dueDate?: string | null;
      assigneeUserId?: string | null;
      sectionId?: string | null;
      priority?: string | null;
    },
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const parent = await this.prisma.task.findFirst({
      where: {
        id: parentId,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        sectionId: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Task not found');
    }

    let sectionId = input.sectionId ?? parent.sectionId;

    if (sectionId) {
      const section = await this.prisma.projectSection.findFirst({
        where: {
          id: sectionId,
          orgId,
          projectId: parent.projectId,
        },
        select: { id: true },
      });

      if (!section) {
        throw new BadRequestException(
          'Section does not belong to this project or organization',
        );
      }
    }

    const dueDate = this.parseOptionalDateOrThrow(input.dueDate, 'dueDate');

    const subtask = await this.prisma.task.create({
      data: {
        orgId,
        projectId: parent.projectId,
        sectionId,
        parentId: parent.id,
        title: input.title,
        priority: input.priority || 'MEDIUM',
        dueDate,
      },
    });

    const createdStory = await (this.prisma as any).story.create({
      data: {
        orgId,
        taskId: subtask.id,
        createdById: user.userId,
        type: 'ACTIVITY',
        metadata: {
          action: 'SUBTASK_CREATED',
          title: subtask.title,
          parentId: parent.id,
        },
      },
    });

    const assigneeId = input.assigneeUserId ?? undefined;
    if (assigneeId) {
      const member = await this.prisma.orgMember.findFirst({
        where: {
          orgId,
          userId: assigneeId,
        },
        select: {
          id: true,
        },
      });

      if (!member) {
        throw new BadRequestException(
          'Assignee must be a member of this organization',
        );
      }

      await this.prisma.taskMembership.create({
        data: {
          orgId,
          taskId: subtask.id,
          userId: assigneeId,
        },
      });

      // Notify assignee (personal) + due-soon if applicable.
      const now = Date.now();
      const dueSoonWindowMs = 48 * 60 * 60 * 1000;
      const dueTime =
        dueDate instanceof Date ? dueDate.getTime() : undefined;
      const isDueSoon =
        typeof dueTime === 'number' && dueTime >= now && dueTime <= now + dueSoonWindowMs;

      const recipients = [assigneeId].filter((id) => id !== user.userId);
      if (recipients.length > 0) {
        await this.prisma.notification.createMany({
          data: [
            ...recipients.map((userId) => ({
              orgId,
              userId,
              storyId: createdStory.id,
              taskId: subtask.id,
              type: NotificationTypes.SUBTASK_ASSIGNED,
            })),
            ...(isDueSoon
              ? recipients.map((userId) => ({
                  orgId,
                  userId,
                  storyId: createdStory.id,
                  taskId: subtask.id,
                  type: NotificationTypes.TASK_DUE_SOON,
                }))
              : []),
          ],
          skipDuplicates: true,
        });
      }
    }

    const subtaskMemberships = await this.prisma.taskMembership.findMany({
      where: { orgId, taskId: subtask.id },
      select: { userId: true },
    });
    const subtaskAssigneeIds = subtaskMemberships.map((m) => m.userId).sort();

    await this.emitAutomationEvent({
      type: 'TASK_CREATED',
      orgId,
      projectId: subtask.projectId,
      actorUserId: user.userId,
      entityType: 'TASK',
      entityId: subtask.id,
      timestamp: new Date().toISOString(),
      before: {},
      after: {
        title: subtask.title,
        sectionId: subtask.sectionId,
        priority: subtask.priority,
        parentId: parent.id,
        assigneeUserIds: subtaskAssigneeIds,
      },
      metadata: { projectId: subtask.projectId, parentTaskId: parent.id },
    });

    const full = await this.prisma.task.findUniqueOrThrow({
      where: { id: subtask.id },
      include: {
        project: { select: { id: true, name: true, logoUrl: true } },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        section: { select: { id: true, name: true } },
        memberships: {
          include: {
            user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    return {
      id: full.id,
      title: full.title,
      description: full.description,
      priority: full.priority,
      dueDate: full.dueDate,
      projectId: full.projectId,
      project: full.project,
      projectName: full.project?.name ?? null,
      parentId: full.parentId,
      sectionId: full.sectionId,
      section: full.section,
      assignees: full.memberships.map((m) => m.user),
      reviewerId: full.reviewerId,
      reviewer: full.reviewer,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
    };
  }

  async listMyTasks(user: RequestUser) {
    const orgId = this.getOrgId(user);

    const memberships = await this.prisma.taskMembership.findMany({
      where: {
        orgId,
        userId: user.userId,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            projectId: true,
            sectionId: true,
            parentId: true,
            project: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
              },
            },
            section: {
              select: {
                name: true,
              },
            },
            reviewer: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            reviewerId: true,
            updatedAt: true,
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Apply Done-only DESC re-ordering using completedAt if it exists,
    // otherwise updatedAt. Keep Backlog/In Progress/Review untouched.
    const membershipsWithIndex = memberships.map((m, idx) => ({ m, idx }));
    const isDone = (t: typeof membershipsWithIndex[number]['m']['task']) =>
      t.section?.name?.toLowerCase() === 'done';

    const doneMemberships = membershipsWithIndex
      .filter(({ m }) => isDone(m.task))
      .sort((a, b) => {
        const completedA = (a.m.task as any).completedAt as Date | null | undefined;
        const completedB = (b.m.task as any).completedAt as Date | null | undefined;

        const keyA = completedA
          ? completedA.getTime()
          : a.m.task.updatedAt.getTime();
        const keyB = completedB
          ? completedB.getTime()
          : b.m.task.updatedAt.getTime();

        // DESC: newest first
        if (keyA !== keyB) return keyB - keyA;
        // Stable ordering within same timestamp
        return a.idx - b.idx;
      });

    let donePtr = 0;
    const orderedMemberships = membershipsWithIndex.map(({ m }) =>
      isDone(m.task) ? doneMemberships[donePtr++].m : m,
    );

    return orderedMemberships.map((m) => ({
      id: m.task.id,
      title: m.task.title,
      priority: m.task.priority,
      dueDate: m.task.dueDate,
      projectId: m.task.projectId,
      project: m.task.project,
      sectionId: m.task.sectionId,
      parentId: m.task.parentId,
      projectName: m.task.project?.name ?? '',
      sectionName: m.task.section?.name ?? '',
      assignees: m.task.memberships.map((mm) => mm.user),
      reviewerId: m.task.reviewerId,
      reviewer: m.task.reviewer,
    }));
  }

  async removeAssignee(taskId: string, userId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        sectionId: true,
        priority: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const beforeRemoveRows = await this.prisma.taskMembership.findMany({
      where: {
        orgId,
        taskId: task.id,
        role: 'ASSIGNEE',
      },
      select: { userId: true },
    });
    const beforeRemoveIds = beforeRemoveRows.map((m) => m.userId).sort();

    await this.prisma.taskMembership.deleteMany({
      where: {
        orgId,
        taskId: task.id,
        userId,
      },
    });

    const afterRemoveRows = await this.prisma.taskMembership.findMany({
      where: {
        orgId,
        taskId: task.id,
        role: 'ASSIGNEE',
      },
      select: { userId: true },
    });
    const afterRemoveIds = afterRemoveRows.map((m) => m.userId).sort();

    const assigneesChanged =
      beforeRemoveIds.length !== afterRemoveIds.length ||
      beforeRemoveIds.some((id, idx) => id !== afterRemoveIds[idx]);

    if (assigneesChanged) {
      await this.emitAutomationEvent({
        type: 'TASK_ASSIGNED',
        orgId,
        projectId: task.projectId,
        actorUserId: user.userId,
        entityType: 'TASK',
        entityId: task.id,
        timestamp: new Date().toISOString(),
        before: {
          assigneeUserIds: beforeRemoveIds,
          sectionId: task.sectionId,
          priority: task.priority,
        },
        after: {
          assigneeUserIds: afterRemoveIds,
          sectionId: task.sectionId,
          priority: task.priority,
        },
        metadata: { taskId: task.id, projectId: task.projectId },
      });
    }

    return { success: true };
  }

  /**
   * Upload an attachment for a task (or subtask).
   * Stores the file under uploads/tasks and metadata in TaskAttachment.
   */
  async uploadAttachment(
    taskId: string,
    file: any,
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (
      typeof file.size === 'number' &&
      file.size > ATTACHMENT_MAX_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException('Attachment is too large (max 10MB)');
    }
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported attachment file type');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const uploadsRoot = join(process.cwd(), 'uploads', 'tasks');
    await fs.promises.mkdir(uploadsRoot, { recursive: true });

    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetFileName = `${unique}${extname(file.originalname)}`;
    const targetPath = join(uploadsRoot, targetFileName);

    // When using the default FileInterceptor storage, file.buffer is populated.
    // Write the buffer to disk explicitly.
    if (!file.buffer) {
      throw new BadRequestException('File buffer is missing');
    }
    await fs.promises.writeFile(targetPath, file.buffer);

    const fileUrl = `/uploads/tasks/${targetFileName}`;

    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        orgId,
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: user.userId,
      },
    });

    return attachment;
  }

  /**
   * List attachments for a task (or subtask).
   */
  async listAttachments(taskId: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.taskAttachment.findMany({
      where: { taskId: task.id, orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete an attachment (DB + physical file).
   */
  async deleteAttachment(
    taskId: string,
    attachmentId: string,
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId: task.id, orgId },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Delete physical file if we own the storage
    if (attachment.fileUrl?.startsWith('/uploads/tasks/')) {
      const fullPath = join(process.cwd(), attachment.fileUrl);
      fs.unlink(fullPath, () => {});
    }

    await this.prisma.taskAttachment.delete({
      where: { id: attachment.id },
    });

    return { success: true };
  }

  /**
   * Resolve attachment file path and name for downloading.
   */
  async getAttachmentFile(
    taskId: string,
    attachmentId: string,
    user: RequestUser,
  ): Promise<{ path: string; fileName: string }> {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId: task.id, orgId },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    if (!attachment.fileUrl?.startsWith('/uploads/tasks/')) {
      throw new BadRequestException('Attachment is not stored locally');
    }

    const fullPath = join(process.cwd(), attachment.fileUrl);
    return { path: fullPath, fileName: attachment.fileName };
  }
}

