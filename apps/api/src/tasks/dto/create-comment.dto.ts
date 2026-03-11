import { IsArray, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentions?: string[];
}

