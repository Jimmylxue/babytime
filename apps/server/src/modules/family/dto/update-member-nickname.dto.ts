import { IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateMemberNicknameDto {
  @IsUUID()
  targetUserId: string;

  // 必填；传空字符串表示恢复默认（删除备注，回落到微信昵称）
  @IsString()
  @MaxLength(20, { message: '备注名最多 20 个字' })
  nickname: string;
}
