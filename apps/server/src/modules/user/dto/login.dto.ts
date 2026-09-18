import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'code 不能为空' })
  code: string;

  /**
   * 获客来源：扫码进入时携带的场景值（album/daily/chart/family）。
   * 只在创建新用户时落库，老用户传了也不改；未知值直接忽略。
   */
  @IsString()
  @IsOptional()
  source?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  nickname?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  role?: string;
}
