/**
 * Core type definitions for the automations system (V1).
 * No runtime behavior — shared language for rules, events, and execution records.
 */

// --- Triggers / events ---

export type AutomationEventType =
  | 'TASK_CREATED'
  | 'TASK_SECTION_CHANGED'
  | 'TASK_ASSIGNED'
  | 'COMMENT_CREATED';

// --- Entities ---

export type AutomationEntityType = 'TASK' | 'PROJECT' | 'COMMENT' | 'SUBTASK';

// --- Event payload ---

export interface AutomationEvent {
  type: AutomationEventType;
  orgId: string;
  projectId?: string | null;
  actorUserId?: string | null;
  entityType: AutomationEntityType;
  entityId: string;
  timestamp: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// --- Conditions ---

export type ConditionField =
  | 'task.sectionId'
  | 'task.priority'
  | 'task.assigneeId'
  | 'task.projectId'
  | 'after.sectionId'
  | 'before.sectionId';

export type ConditionOperator = 'equals' | 'not_equals';

export interface AutomationCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | number | boolean | null;
}

// --- Actions ---

export type AutomationActionType =
  | 'ASSIGN_USER'
  | 'MOVE_TO_SECTION'
  | 'SET_PRIORITY'
  | 'SEND_NOTIFICATION'
  | 'SET_REVIEWER';

export interface AutomationAction {
  type: AutomationActionType;
  config: Record<string, string | number | boolean | null>;
}

// --- Rule definition ---

export interface AutomationRuleDefinition {
  id: string;
  orgId: string;
  projectId?: string | null;
  name: string;
  description?: string | null;
  triggerType: AutomationEventType;
  triggerConfig?: Record<string, unknown> | null;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
}

// --- Execution ---

export type AutomationExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
