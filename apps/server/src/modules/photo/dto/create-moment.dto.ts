import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MomentPhotoDto {
  @IsString()
  @IsNotEmpty({ message: '图片URL不能为空' })
  url: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;
}

export class CreateMomentDto {
  @IsString()
  @IsNotEmpty()
  babyId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: '文案最多 500 字' })
  content?: string;

  @IsDateString({}, { message: '日期格式不正确' })
  photoDate: string;

  // 允许纯文字瞬间，所以照片数组可空；有图时按数组顺序展示
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9, { message: '一条瞬间最多 9 张照片' })
  @ValidateNested({ each: true })
  @Type(() => MomentPhotoDto)
  photos?: MomentPhotoDto[];
}
