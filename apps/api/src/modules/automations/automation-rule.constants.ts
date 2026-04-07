/**
 * Allowed values for automation rule payloads (aligned with automation engine types).
 */
export const AUTOMATION_TRIGGER_TYPES = [
  'TASK_CREATED',
  'TASK_SECTION_CHANGED',
  'TASK_ASSIGNED',
  'COMMENT_CREATED',
] as const;

export const AUTOMATION_ACTION_TYPES = [
  'ASSIGN_USER',
  'MOVE_TO_SECTION',
  'SET_PRIORITY',
  'SEND_NOTIFICATION',
  'SET_REVIEWER',
] as const;

export const AUTOMATION_CONDITION_FIELDS = [
  'task.sectionId',
  'task.priority',
  'task.assigneeId',
  'task.projectId',
  'after.sectionId',
  'before.sectionId',
] as const;

export const AUTOMATION_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];
export type AutomationActionTypeName = (typeof AUTOMATION_ACTION_TYPES)[number];
