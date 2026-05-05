import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'code 不能为空' })
  code: string;
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
