import { IsEnum, IsUUID, IsOptional, IsBoolean } from 'class-validator';
import { MemberRole } from '../entities/family-member.entity';

export class CreateInviteDto {
  @IsUUID()
  babyId: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole;

  // 强制作废旧邀请卡并生成新卡
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class AcceptInviteDto {
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}
