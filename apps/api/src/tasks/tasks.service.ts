import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTypes } from '../notifications/notification-types';
import type { RequestUser } from '../auth/jwt.strategy';
import { join, extname } from 'path';
import * as fs from 'fs';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private getOrgId(user: RequestUser): string {
    if (!user.orgId) {
      throw new BadRequestException('Organization context is required');
    }
    return user.orgId;
  }

  async getTaskById(id: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const task = await this.prisma.task.findFirst({
      where: {
        id,
        orgId,
      },
      include: {
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
      parentId: task.parentId,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
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
              },
            },
          },
        },
      },
    });

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      projectId: task.projectId,
      parentId: task.parentId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
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
    },
    user: RequestUser,
  ) {
    const orgId = this.getOrgId(user);

    // Org-scoped: project must belong to current org
    const project = await this.prisma.project.findFirst({
      where: {
        id: input.projectId,
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

    const dueDate =
      input.dueDate != null &&
      String(input.dueDate).trim().length > 0
        ? new Date(input.dueDate)
        : undefined;

    const task = await this.prisma.task.create({
      data: {
        orgId,
        projectId: project.id,
        sectionId,
        title: input.title,
        description: input.description,
        dueDate,
      },
    });

    await (this.prisma as any).story.create({
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

    const assigneeId =
      input.assigneeUserId ?? input.assigneeId ?? undefined;
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
    }

    return task;
  }

  async updateTask(
    id: string,
    input: {
      title?: string;
      dueDate?: string | null;
      sectionId?: string;
      assigneeUserId?: string;
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
        title: true,
        dueDate: true,
        sectionId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data: {
      title?: string;
      dueDate?: Date | null;
      sectionId?: string;
    } = {};

    if (typeof input.title === 'string') {
      data.title = input.title;
    }

    if (input.dueDate !== undefined) {
      if (input.dueDate === null || input.dueDate.trim().length === 0) {
        data.dueDate = null;
      } else {
        data.dueDate = new Date(input.dueDate);
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

    const updated = await this.prisma.task.update({
      where: {
        id: existing.id,
      },
      data,
    });

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
    if (oldDue !== newDue) {
      await (this.prisma as any).story.create({
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
        },
        select: { userId: true },
      });

      const beforeIds = beforeMemberships.map((m) => m.userId).sort();
      const afterIds = afterMemberships.map((m) => m.userId).sort();

      const changed =
        beforeIds.length !== afterIds.length ||
        beforeIds.some((id, idx) => id !== afterIds[idx]);

      if (changed) {
        await (this.prisma as any).story.create({
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
      }
    }

    return updated;
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
      await this.prisma.taskMembership.create({
        data: {
          orgId,
          taskId: task.id,
          userId,
        },
      });
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
      select: { id: true },
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
          },
        },
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
              },
            },
          },
        },
      },
    });

    return subtasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      projectId: task.projectId,
      parentId: task.parentId,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.memberships.map((m) => m.user),
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

    const dueDate =
      input.dueDate != null && String(input.dueDate).trim().length > 0
        ? new Date(input.dueDate)
        : undefined;

    const subtask = await this.prisma.task.create({
      data: {
        orgId,
        projectId: parent.projectId,
        sectionId,
        parentId: parent.id,
        title: input.title,
        dueDate,
      },
    });

    await (this.prisma as any).story.create({
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
    }

    return subtask;
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
            dueDate: true,
            projectId: true,
            sectionId: true,
            parentId: true,
            project: {
              select: {
                name: true,
              },
            },
            section: {
              select: {
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

    return memberships.map((m) => ({
      id: m.task.id,
      title: m.task.title,
      dueDate: m.task.dueDate,
      projectId: m.task.projectId,
      sectionId: m.task.sectionId,
       parentId: m.task.parentId,
      projectName: m.task.project?.name ?? '',
      sectionName: m.task.section?.name ?? '',
      assignees: m.task.memberships.map((mm) => mm.user),
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
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.taskMembership.deleteMany({
      where: {
        orgId,
        taskId: task.id,
        userId,
      },
    });

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

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const uploadsRoot = join(process.cwd(), 'uploads', 'tasks');
    fs.mkdirSync(uploadsRoot, { recursive: true });

    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetFileName = `${unique}${extname(file.originalname)}`;
    const targetPath = join(uploadsRoot, targetFileName);

    // When using the default FileInterceptor storage, file.buffer is populated.
    // Write the buffer to disk explicitly.
    if (!file.buffer) {
      throw new BadRequestException('File buffer is missing');
    }
    fs.writeFileSync(targetPath, file.buffer);

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

