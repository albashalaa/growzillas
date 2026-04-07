import { Allow, IsIn, IsNotEmpty, IsString } from 'class-validator';

import {
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_CONDITION_OPERATORS,
} from '../automation-rule.constants';

export class AutomationConditionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([...AUTOMATION_CONDITION_FIELDS])
  field: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([...AUTOMATION_CONDITION_OPERATORS])
  operator: string;

  @Allow()
  value: string | number | boolean | null;
}
