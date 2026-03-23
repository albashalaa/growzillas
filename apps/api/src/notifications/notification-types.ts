export const NotificationTypes = {
  COMMENT_MENTION: 'COMMENT_MENTION',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  SUBTASK_ASSIGNED: 'SUBTASK_ASSIGNED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
  MEMBER_JOINED: 'MEMBER_JOINED',
} as const;

export type NotificationType =
  (typeof NotificationTypes)[keyof typeof NotificationTypes];

