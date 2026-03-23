import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/jwt.strategy';
import { NotificationTypes } from './notification-types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private getOrgId(user: RequestUser): string {
    if (!user.orgId) {
      throw new Error('Organization context is required');
    }
    return user.orgId;
  }

  async listMyNotifications(user: RequestUser) {
    const orgId = this.getOrgId(user);

    const personalTypes = [
      NotificationTypes.COMMENT_MENTION,
      NotificationTypes.TASK_ASSIGNED,
      NotificationTypes.SUBTASK_ASSIGNED,
      NotificationTypes.TASK_COMMENTED,
      NotificationTypes.TASK_DUE_SOON,
    ];

    const notifications = await this.prisma.notification.findMany({
      where: {
        orgId,
        userId: user.userId,
        type: {
          in: personalTypes,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        story: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            createdById: true,
            createdBy: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
          },
        },
      },
    });

    return notifications.map((n) => ({
      id: n.id,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
      taskId: n.taskId,
      taskTitle: n.task?.title ?? '',
      projectId: n.task?.projectId ?? null,
      storyId: n.storyId,
      commentBody: n.story?.body ?? '',
      actorUserId: n.story?.createdById ?? null,
      actorDisplayName:
        n.story?.createdBy?.displayName ??
        n.story?.createdBy?.email ??
        'Someone',
    }));
  }

  async getUnreadCount(user: RequestUser) {
    const orgId = this.getOrgId(user);

    const personalTypes = [
      NotificationTypes.COMMENT_MENTION,
      NotificationTypes.TASK_ASSIGNED,
      NotificationTypes.SUBTASK_ASSIGNED,
      NotificationTypes.TASK_COMMENTED,
      NotificationTypes.TASK_DUE_SOON,
    ];

    const unreadCount = await this.prisma.notification.count({
      where: {
        orgId,
        userId: user.userId,
        type: {
          in: personalTypes,
        },
        isRead: false,
      },
    });

    return { unreadCount };
  }

  async markRead(id: string, user: RequestUser) {
    const orgId = this.getOrgId(user);

    const existing = await this.prisma.notification.findFirst({
      where: {
        id,
        orgId,
        userId: user.userId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return { success: true };
    }

    await this.prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true },
    });

    return { success: true };
  }

  async markAllRead(user: RequestUser) {
    const orgId = this.getOrgId(user);

    await this.prisma.notification.updateMany({
      where: {
        orgId,
        userId: user.userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return { success: true };
  }
}

