import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { MemberRole } from '../entities/family-member.entity';

export class CreateInviteDto {
  @IsUUID()
  babyId: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole;
}

export class AcceptInviteDto {
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}
