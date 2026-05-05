import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

export class CreatePhotoDto {
  @IsString()
  @IsNotEmpty()
  babyId: string;

  @IsString()
  @IsNotEmpty({ message: '图片URL不能为空' })
  url: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsDateString({}, { message: '日期格式不正确' })
  photoDate: string;

  @IsString()
  @IsOptional()
  note?: string;
}
