import type { NotificationType } from './notification-types';

export interface NotificationItem {
  id: string;
  type: NotificationType | string;
  isRead: boolean;
  createdAt: string;
  taskId: string;
  taskTitle: string;
  projectId?: string | null;
  storyId: string;
  commentBody: string;
  actorDisplayName: string;
  actorUserId?: string | null;
}

