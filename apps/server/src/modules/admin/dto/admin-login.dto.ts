import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MinLength(1, { message: '请输入账号' })
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(128)
  password: string;
}
