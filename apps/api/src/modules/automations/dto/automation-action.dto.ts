import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

import { AUTOMATION_ACTION_TYPES } from '../automation-rule.constants';

export class AutomationActionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([...AUTOMATION_ACTION_TYPES])
  type: string;

  @IsObject()
  config: Record<string, string | number | boolean | null>;
}
