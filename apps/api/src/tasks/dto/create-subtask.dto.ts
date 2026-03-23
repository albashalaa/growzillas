import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsString()
  sectionId?: string | null;

  @IsOptional()
  @IsString()
  priority?: string | null;
}

