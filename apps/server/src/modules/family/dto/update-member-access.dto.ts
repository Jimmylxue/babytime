import { IsEnum } from 'class-validator';
import { MemberAccess } from '../entities/family-member.entity';

export class UpdateMemberAccessDto {
  // 只允许 editor / viewer（owner 不可转交，service 里再挡一层）
  @IsEnum(MemberAccess, { message: '权限值不合法' })
  accessLevel: MemberAccess;
}
