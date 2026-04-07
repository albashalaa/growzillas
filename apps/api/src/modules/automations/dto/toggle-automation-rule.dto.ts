import { IsBoolean } from 'class-validator';

export class ToggleAutomationRuleDto {
  @IsBoolean()
  isActive: boolean;
}
