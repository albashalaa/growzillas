import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  priority?: string;
}

