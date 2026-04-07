import { Injectable } from '@nestjs/common';
import type {
  AutomationRule,
  AutomationExecution,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  AutomationEntityType,
  AutomationEventType,
  AutomationExecutionStatus,
} from './types/automation.types';

export type FindActiveRulesByTriggerParams = {
  orgId: string;
  triggerType: AutomationEventType;
  projectId?: string | null;
};

export type CreateExecutionLogParams = {
  ruleId: string;
  orgId: string;
  projectId?: string | null;
  eventType: AutomationEventType;
  entityType: AutomationEntityType;
  entityId: string;
  status: AutomationExecutionStatus;
  errorMessage?: string | null;
  contextSnapshot?: Prisma.InputJsonValue | null;
};

export type UpdateExecutionLogStatusParams = {
  id: string;
  status: AutomationExecutionStatus;
  errorMessage?: string | null;
};

export type CreateRuleParams = {
  orgId: string;
  projectId?: string | null;
  createdByUserId: string;
  name: string;
  description?: string | null;
  triggerType: AutomationEventType;
  triggerConfig?: Prisma.InputJsonValue | null;
  conditions: Prisma.InputJsonValue;
  actions: Prisma.InputJsonValue;
  isActive?: boolean;
};

export type ListRulesParams = {
  orgId: string;
  /** When set, return only rules for this project. */
  projectId?: string | null;
  /** When true, return only org-wide rules (`projectId` is null). */
  orgWideOnly?: boolean;
  isActive?: boolean;
};

@Injectable()
export class AutomationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveRulesByTrigger(
    params: FindActiveRulesByTriggerParams,
  ): Promise<AutomationRule[]> {
    const projectOr: Prisma.AutomationRuleWhereInput[] = [{ projectId: null }];
    if (params.projectId != null && params.projectId !== '') {
      projectOr.push({ projectId: params.projectId });
    }

    return this.prisma.automationRule.findMany({
      where: {
        orgId: params.orgId,
        triggerType: params.triggerType,
        isActive: true,
        OR: projectOr,
      },
    });
  }

  createExecutionLog(
    params: CreateExecutionLogParams,
  ): Promise<AutomationExecution> {
    return this.prisma.automationExecution.create({
      data: {
        ruleId: params.ruleId,
        orgId: params.orgId,
        projectId: params.projectId ?? null,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        contextSnapshot: params.contextSnapshot ?? undefined,
      },
    });
  }

  updateExecutionLogStatus(
    params: UpdateExecutionLogStatusParams,
  ): Promise<AutomationExecution> {
    return this.prisma.automationExecution.update({
      where: { id: params.id },
      data: {
        status: params.status,
        ...(params.errorMessage !== undefined
          ? { errorMessage: params.errorMessage }
          : {}),
      },
    });
  }

  createRule(params: CreateRuleParams): Promise<AutomationRule> {
    return this.prisma.automationRule.create({
      data: {
        orgId: params.orgId,
        projectId: params.projectId ?? null,
        createdByUserId: params.createdByUserId,
        name: params.name,
        description: params.description ?? null,
        triggerType: params.triggerType,
        triggerConfig: params.triggerConfig ?? undefined,
        conditions: params.conditions,
        actions: params.actions,
        isActive: params.isActive ?? true,
      },
    });
  }

  listRules(params: ListRulesParams): Promise<AutomationRule[]> {
    const where: Prisma.AutomationRuleWhereInput = {
      orgId: params.orgId,
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    };

    if (params.orgWideOnly === true) {
      where.projectId = null;
    } else if (params.projectId !== undefined) {
      where.projectId = params.projectId;
    }

    return this.prisma.automationRule.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findByIdForOrg(
    ruleId: string,
    orgId: string,
  ): Promise<AutomationRule | null> {
    return this.prisma.automationRule.findFirst({
      where: { id: ruleId, orgId },
    });
  }

  async updateRuleByIdForOrg(
    ruleId: string,
    orgId: string,
    data: Prisma.AutomationRuleUncheckedUpdateInput,
  ): Promise<AutomationRule | null> {
    const existing = await this.findByIdForOrg(ruleId, orgId);
    if (!existing) {
      return null;
    }
    return this.prisma.automationRule.update({
      where: { id: ruleId },
      data,
    });
  }

  async deleteRuleByIdForOrg(ruleId: string, orgId: string): Promise<boolean> {
    const result = await this.prisma.automationRule.deleteMany({
      where: { id: ruleId, orgId },
    });
    return result.count > 0;
  }
}
