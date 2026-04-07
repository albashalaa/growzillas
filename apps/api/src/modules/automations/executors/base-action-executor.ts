import type {
  AutomationAction,
  AutomationActionType,
  AutomationEvent,
} from '../types/automation.types';

export abstract class BaseActionExecutor {
  abstract supports(type: AutomationActionType): boolean;

  abstract execute(
    action: AutomationAction,
    event: AutomationEvent,
  ): Promise<void>;
}

/** Thrown by action executor stubs until real implementations exist. */
export class NotImplementedAutomationActionError extends Error {
  constructor(readonly actionType: AutomationActionType) {
    super(`Automation action not implemented: ${actionType}`);
    this.name = 'NotImplementedAutomationActionError';
  }
}

/** Thrown when an action intentionally does nothing (e.g. no recipients). Engine maps this to SKIPPED. */
export class AutomationActionSkippedError extends Error {
  constructor(readonly reason: string) {
    super(`Automation action skipped: ${reason}`);
    this.name = 'AutomationActionSkippedError';
  }
}

/** Nest multi-provider token for all concrete action executors. */
export const ACTION_EXECUTORS = Symbol('ACTION_EXECUTORS');
