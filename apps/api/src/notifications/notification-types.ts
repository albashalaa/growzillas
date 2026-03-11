export const NotificationTypes = {
  COMMENT_MENTION: 'COMMENT_MENTION',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  SUBTASK_ASSIGNED: 'SUBTASK_ASSIGNED',
} as const;

export type NotificationType =
  (typeof NotificationTypes)[keyof typeof NotificationTypes];

