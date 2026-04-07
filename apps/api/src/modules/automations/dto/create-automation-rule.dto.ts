import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  AUTOMATION_TRIGGER_TYPES,
} from '../automation-rule.constants';
import { AutomationActionDto } from './automation-action.dto';
import { AutomationConditionDto } from './automation-condition.dto';

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsString()
  @IsNotEmpty()
  @IsIn([...AUTOMATION_TRIGGER_TYPES])
  triggerType: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsObject()
  triggerConfig?: Record<string, unknown> | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions: AutomationConditionDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions: AutomationActionDto[];

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsUUID()
  projectId?: string | null;
}
