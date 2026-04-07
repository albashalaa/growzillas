import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/jwt.strategy';
import { AutomationsService } from './automations.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { ListAutomationRulesQueryDto } from './dto/list-automation-rules-query.dto';
import { ToggleAutomationRuleDto } from './dto/toggle-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

/**
 * CRUD for automation rules. Requires org context (`x-org-id` or `orgs/:orgId` routes).
 * Only org administrators may manage rules; see `AutomationsService` for permission notes.
 */
@Controller('automations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(OrgRole.ADMIN)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  listRules(
    @Query() query: ListAutomationRulesQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.automationsService.listRules(query, user);
  }

  @Post()
  createRule(
    @Body() dto: CreateAutomationRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.automationsService.createRule(dto, user);
  }

  @Get(':id')
  getRule(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.automationsService.getRuleById(id, user);
  }

  @Patch(':id')
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.automationsService.updateRule(id, dto, user);
  }

  @Delete(':id')
  deleteRule(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.automationsService.deleteRule(id, user);
  }

  @Post(':id/toggle')
  toggleRule(
    @Param('id') id: string,
    @Body() dto: ToggleAutomationRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.automationsService.toggleRule(id, dto, user);
  }
}
