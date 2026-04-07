import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../auth/jwt.strategy';
import { AutomationsRepository } from './automations.repository';
import type { AutomationEventType } from './types/automation.types';
import type { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import type { ListAutomationRulesQueryDto } from './dto/list-automation-rules-query.dto';
import type { ToggleAutomationRuleDto } from './dto/toggle-automation-rule.dto';
import type { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

/**
 * Automation rule CRUD. Org scoping is enforced via `orgId` on every query and write.
 *
 * Permissions: only `OrgRole.ADMIN` may call these methods. The codebase does not model
 * project-level roles on `Project`; org members (`MEMBER`) are denied at the controller.
 * When project-scoped automation ACLs exist, extend the guard/service here.
 */
@Injectable()
export class AutomationsService {
  constructor(
    private readonly automationsRepository: AutomationsRepository,
    private readonly prisma: PrismaService,
  ) {}

  private getOrgIdOrThrow(user: RequestUser): string {
    if (!user.orgId) {
      throw new BadRequestException('Organization context is required');
    }
    return user.orgId;
  }

  assertOrgAdmin(user: RequestUser): void {
    if (user.role !== OrgRole.ADMIN) {
      throw new ForbiddenException(
        'Only organization administrators can manage automation rules',
      );
    }
  }

  async createRule(dto: CreateAutomationRuleDto, user: RequestUser) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    this.validateRulePayload(dto.conditions, dto.actions);

    const projectId =
      dto.projectId !== undefined && dto.projectId !== null
        ? dto.projectId
        : null;
    if (projectId) {
      await this.assertProjectInOrg(projectId, orgId);
    }

    const rule = await this.automationsRepository.createRule({
      orgId,
      projectId,
      createdByUserId: user.userId,
      name: dto.name.trim(),
      description:
        dto.description === undefined || dto.description === null
          ? null
          : dto.description.trim() || null,
      triggerType: dto.triggerType as AutomationEventType,
      triggerConfig: (dto.triggerConfig ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      conditions: dto.conditions as unknown as Prisma.InputJsonValue,
      actions: dto.actions as unknown as Prisma.InputJsonValue,
      isActive: true,
    });

    return this.toRuleResponse(rule);
  }

  async listRules(query: ListAutomationRulesQueryDto, user: RequestUser) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    if (query.orgWideOnly && query.projectId) {
      throw new BadRequestException(
        'Cannot combine orgWideOnly with projectId',
      );
    }

    const rules = await this.automationsRepository.listRules({
      orgId,
      ...(query.orgWideOnly === true ? { orgWideOnly: true } : {}),
      ...(query.projectId !== undefined
        ? { projectId: query.projectId }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    });

    return rules.map((r) => this.toRuleResponse(r));
  }

  async getRuleById(ruleId: string, user: RequestUser) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    const rule = await this.automationsRepository.findByIdForOrg(ruleId, orgId);
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return this.toRuleResponse(rule);
  }

  async updateRule(ruleId: string, dto: UpdateAutomationRuleDto, user: RequestUser) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    if (this.isEmptyPatch(dto)) {
      throw new BadRequestException('No fields to update');
    }

    const existing = await this.automationsRepository.findByIdForOrg(
      ruleId,
      orgId,
    );
    if (!existing) {
      throw new NotFoundException('Automation rule not found');
    }

    if (dto.conditions !== undefined || dto.actions !== undefined) {
      this.validateRulePayload(
        dto.conditions ?? (existing.conditions as any),
        dto.actions ?? (existing.actions as any),
      );
    }

    if (dto.projectId !== undefined) {
      const nextProjectId =
        dto.projectId === null || dto.projectId === ''
          ? null
          : dto.projectId;
      if (nextProjectId) {
        await this.assertProjectInOrg(nextProjectId, orgId);
      }
    }

    const data: Prisma.AutomationRuleUncheckedUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      data.description =
        dto.description === null
          ? null
          : String(dto.description).trim() || null;
    }
    if (dto.triggerType !== undefined) {
      data.triggerType = dto.triggerType as AutomationEventType;
    }
    if (dto.triggerConfig !== undefined) {
      data.triggerConfig =
        dto.triggerConfig === null
          ? Prisma.DbNull
          : (dto.triggerConfig as Prisma.InputJsonValue);
    }
    if (dto.conditions !== undefined) {
      data.conditions = dto.conditions as unknown as Prisma.InputJsonValue;
    }
    if (dto.actions !== undefined) {
      data.actions = dto.actions as unknown as Prisma.InputJsonValue;
    }
    if (dto.projectId !== undefined) {
      const nextProjectId =
        dto.projectId === null || dto.projectId === ''
          ? null
          : dto.projectId;
      data.projectId = nextProjectId;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated = await this.automationsRepository.updateRuleByIdForOrg(
      ruleId,
      orgId,
      data,
    );
    if (!updated) {
      throw new NotFoundException('Automation rule not found');
    }
    return this.toRuleResponse(updated);
  }

  async deleteRule(ruleId: string, user: RequestUser) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    const deleted = await this.automationsRepository.deleteRuleByIdForOrg(
      ruleId,
      orgId,
    );
    if (!deleted) {
      throw new NotFoundException('Automation rule not found');
    }
    return { success: true as const };
  }

  async toggleRule(
    ruleId: string,
    dto: ToggleAutomationRuleDto,
    user: RequestUser,
  ) {
    this.assertOrgAdmin(user);
    const orgId = this.getOrgIdOrThrow(user);

    const updated = await this.automationsRepository.updateRuleByIdForOrg(
      ruleId,
      orgId,
      { isActive: dto.isActive },
    );
    if (!updated) {
      throw new NotFoundException('Automation rule not found');
    }
    return this.toRuleResponse(updated);
  }

  private isEmptyPatch(dto: UpdateAutomationRuleDto): boolean {
    return Object.keys(dto).length === 0;
  }

  private async assertProjectInOrg(
    projectId: string,
    orgId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException(
        'Project not found in this organization or is archived',
      );
    }
  }

  private validateRulePayload(
    conditions: unknown,
    actions: unknown,
  ): void {
    if (!Array.isArray(conditions)) {
      throw new BadRequestException('conditions must be an array');
    }
    if (!Array.isArray(actions)) {
      throw new BadRequestException('actions must be an array');
    }
    if (actions.length === 0) {
      throw new BadRequestException('actions must contain at least one action');
    }
    for (const action of actions) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw new BadRequestException('Each action must be an object');
      }
      const cfg = (action as { config?: unknown }).config;
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        throw new BadRequestException('Each action must have an object config');
      }
      this.assertPlainConfigObject(
        cfg as Record<string, unknown>,
        'action.config',
      );
    }
  }

  private assertPlainConfigObject(
    obj: Record<string, unknown>,
    path: string,
  ): void {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (
        v === null ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        continue;
      }
      throw new BadRequestException(
        `${path} must only contain string, number, boolean, or null values`,
      );
    }
  }

  private toRuleResponse(rule: {
    id: string;
    orgId: string;
    projectId: string | null;
    createdByUserId: string;
    name: string;
    description: string | null;
    triggerType: string;
    triggerConfig: unknown;
    conditions: unknown;
    actions: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: rule.id,
      orgId: rule.orgId,
      projectId: rule.projectId,
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      triggerConfig: rule.triggerConfig ?? null,
      conditions: rule.conditions,
      actions: rule.actions,
      isActive: rule.isActive,
      createdByUserId: rule.createdByUserId,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
