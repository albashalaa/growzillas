import type { NotificationItem } from './notifications';

export function getNotificationTitle(n: NotificationItem): string {
  const actor = (n.actorDisplayName && n.actorDisplayName.trim()) || 'Someone';
  const task = n.taskTitle || 'a task';
  const type = (n.type ?? '').toUpperCase();

  if (type === 'COMMENT_MENTION') return `${actor} mentioned you in ${task}`;
  if (type === 'TASK_ASSIGNED') return `${actor} assigned you to ${task}`;
  if (type === 'SUBTASK_ASSIGNED') return `${actor} assigned you to ${task}`;
  if (type === 'TASK_COMMENTED') return `${actor} commented on ${task}`;
  if (type === 'TASK_DUE_SOON') return `${task} is due soon`;
  if (type === 'AUTOMATION') return n.commentBody || `${actor} updated ${task}`;

  return `${actor} updated ${task}`;
}
