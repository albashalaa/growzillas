import { IsString } from 'class-validator';

export class AddAssigneeDto {
  @IsString()
  userId: string;
}

