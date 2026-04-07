import { Inject, Injectable } from '@nestjs/common';
import type { AutomationRule, Prisma } from '@prisma/client';

import { AutomationsRepository } from './automations.repository';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import {
  ACTION_EXECUTORS,
  AutomationActionSkippedError,
  BaseActionExecutor,
} from './executors/base-action-executor';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationEvent,
} from './types/automation.types';

/**
 * Orchestrates automation runs: load rules, evaluate conditions, dispatch actions, persist execution rows.
 * Loop / cascade prevention hooks can extend this service later (e.g. depth limits, dedupe keys).
 */
@Injectable()
export class AutomationEngineService {
  constructor(
    private readonly automationsRepository: AutomationsRepository,
    private readonly conditionEvaluator: ConditionEvaluatorService,
    @Inject(ACTION_EXECUTORS)
    private readonly actionExecutors: readonly BaseActionExecutor[],
  ) {}

  async handleEvent(event: AutomationEvent): Promise<void> {
    const rules = await this.loadMatchingRules(event);

    for (const rule of rules) {
      await this.executeRule(rule, event);
    }
  }

  async loadMatchingRules(event: AutomationEvent): Promise<AutomationRule[]> {
    return this.automationsRepository.findActiveRulesByTrigger({
      orgId: event.orgId,
      triggerType: event.type,
      projectId: event.projectId,
    });
  }

  async executeRule(
    rule: AutomationRule,
    event: AutomationEvent,
  ): Promise<void> {
    // Future: short-circuit if this (ruleId, entityId, event.type) is already processed in this chain.

    const { conditions, actions } = this.parseRulePayload(rule);

    if (!this.conditionEvaluator.matches(conditions, event)) {
      await this.automationsRepository.createExecutionLog({
        ruleId: rule.id,
        orgId: event.orgId,
        projectId: event.projectId ?? rule.projectId,
        eventType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        status: 'SKIPPED',
        contextSnapshot: this.buildContextSnapshot(
          rule,
          event,
          conditions,
          actions,
        ) as Prisma.InputJsonValue,
      });
      return;
    }

    try {
      for (const action of actions) {
        const executor = this.resolveExecutor(action.type);
        if (!executor) {
          await this.automationsRepository.createExecutionLog({
            ruleId: rule.id,
            orgId: event.orgId,
            projectId: event.projectId ?? rule.projectId,
            eventType: event.type,
            entityType: event.entityType,
            entityId: event.entityId,
            status: 'FAILED',
            errorMessage: `No executor registered for action type: ${action.type}`,
            contextSnapshot: this.buildContextSnapshot(
              rule,
              event,
              conditions,
              actions,
            ) as Prisma.InputJsonValue,
          });
          return;
        }
        await executor.execute(action, event);
      }

      await this.automationsRepository.createExecutionLog({
        ruleId: rule.id,
        orgId: event.orgId,
        projectId: event.projectId ?? rule.projectId,
        eventType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        status: 'SUCCESS',
        contextSnapshot: this.buildContextSnapshot(
          rule,
          event,
          conditions,
          actions,
        ) as Prisma.InputJsonValue,
      });
    } catch (err) {
      if (err instanceof AutomationActionSkippedError) {
        await this.automationsRepository.createExecutionLog({
          ruleId: rule.id,
          orgId: event.orgId,
          projectId: event.projectId ?? rule.projectId,
          eventType: event.type,
          entityType: event.entityType,
          entityId: event.entityId,
          status: 'SKIPPED',
          errorMessage: err.reason,
          contextSnapshot: this.buildContextSnapshot(
            rule,
            event,
            conditions,
            actions,
          ) as Prisma.InputJsonValue,
        });
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      await this.automationsRepository.createExecutionLog({
        ruleId: rule.id,
        orgId: event.orgId,
        projectId: event.projectId ?? rule.projectId,
        eventType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        status: 'FAILED',
        errorMessage: message,
        contextSnapshot: this.buildContextSnapshot(
          rule,
          event,
          conditions,
          actions,
        ) as Prisma.InputJsonValue,
      });
    }
  }

  private resolveExecutor(
    type: AutomationAction['type'],
  ): BaseActionExecutor | undefined {
    return this.actionExecutors.find((e) => e.supports(type));
  }

  private parseRulePayload(rule: AutomationRule): {
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  } {
    const conditions = Array.isArray(rule.conditions)
      ? (rule.conditions as unknown as AutomationCondition[])
      : [];
    const actions = Array.isArray(rule.actions)
      ? (rule.actions as unknown as AutomationAction[])
      : [];
    return { conditions, actions };
  }

  private buildContextSnapshot(
    rule: AutomationRule,
    event: AutomationEvent,
    conditions: AutomationCondition[],
    actions: AutomationAction[],
  ): Record<string, unknown> {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      eventType: event.type,
      entityId: event.entityId,
      conditions,
      actions,
    };
  }
}
