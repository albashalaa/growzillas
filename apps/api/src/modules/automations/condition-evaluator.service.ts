import { Injectable } from '@nestjs/common';

import type {
  AutomationCondition,
  AutomationEvent,
  ConditionField,
} from './types/automation.types';

@Injectable()
export class ConditionEvaluatorService {
  matches(conditions: AutomationCondition[], event: AutomationEvent): boolean {
    if (conditions.length === 0) {
      return true;
    }

    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, event)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(
    condition: AutomationCondition,
    event: AutomationEvent,
  ): boolean {
    const actual = this.resolveFieldValue(event, condition.field);
    const match = this.equals(actual, condition.value);

    if (condition.operator === 'equals') {
      return match;
    }
    if (condition.operator === 'not_equals') {
      return !match;
    }
    return false;
  }

  /**
   * Resolves dotted paths (e.g. task.sectionId) against before/after/metadata snapshots.
   */
  private resolveFieldValue(
    event: AutomationEvent,
    field: ConditionField,
  ): unknown {
    const segments = field.split('.');

    // Event-aware fields explicitly reference snapshot roots.
    if (segments[0] === 'after') {
      return this.walkPath(event.after, segments.slice(1));
    }
    if (segments[0] === 'before') {
      return this.walkPath(event.before, segments.slice(1));
    }
    if (segments[0] === 'metadata') {
      return this.walkPath(event.metadata, segments.slice(1));
    }

    const sources: Array<Record<string, unknown> | null | undefined> = [
      event.after,
      event.before,
      event.metadata,
    ];

    for (const source of sources) {
      const value = this.walkPath(source, segments);
      if (value !== undefined) {
        return value;
      }
      // Backward-compatibility for legacy fields like task.sectionId where
      // payloads store sectionId directly in before/after snapshots.
      if (segments.length > 1) {
        const flattenedSegments = segments.slice(1);
        const flattened = this.walkPath(source, flattenedSegments);
        if (flattened !== undefined) {
          return flattened;
        }

        // UI field alias: `task.assigneeId` should match the engine payload's
        // `assigneeUserIds` array (role-aware membership list).
        if (
          flattenedSegments.length === 1 &&
          flattenedSegments[0] === 'assigneeId'
        ) {
          const aliasValue = this.walkPath(source, ['assigneeUserIds']);
          if (aliasValue !== undefined) {
            return aliasValue;
          }
        }
      }
    }
    return undefined;
  }

  private walkPath(
    root: Record<string, unknown> | null | undefined,
    segments: string[],
  ): unknown {
    if (!root || segments.length === 0) {
      return undefined;
    }
    let current: unknown = root;
    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private equals(
    actual: unknown,
    expected: string | number | boolean | null,
  ): boolean {
    if (Array.isArray(actual)) {
      return actual.some((entry) => this.equals(entry, expected));
    }
    if (actual === expected) {
      return true;
    }
    if (actual === null || actual === undefined) {
      return expected === null;
    }
    if (expected === null) {
      return false;
    }
    if (typeof actual === 'number' && typeof expected === 'string') {
      return actual === Number(expected) && !Number.isNaN(Number(expected));
    }
    if (typeof actual === 'string' && typeof expected === 'number') {
      return Number(actual) === expected && !Number.isNaN(Number(actual));
    }
    return false;
  }
}
