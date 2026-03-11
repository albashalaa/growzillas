import { IsString } from 'class-validator';

export class GetTasksDto {
  @IsString()
  projectId: string;
}

