import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { OrgRole } from '@prisma/client';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}

