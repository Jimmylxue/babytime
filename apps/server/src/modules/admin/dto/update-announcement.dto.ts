import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '公告标题不能为空' })
  @MaxLength(40, { message: '公告标题不能超过 40 字' })
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: '公告内容不能为空' })
  @MaxLength(5000, { message: '公告内容不能超过 5000 字' })
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
