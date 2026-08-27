import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1, { message: '请输入公告标题' })
  @MaxLength(40, { message: '公告标题不能超过 40 字' })
  title: string;

  @IsString()
  @MinLength(1, { message: '请输入公告内容' })
  @MaxLength(5000, { message: '公告内容不能超过 5000 字' })
  content: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
