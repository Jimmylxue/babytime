import { IsString, IsNotEmpty, IsEnum, IsDateString, IsOptional } from 'class-validator';

export class CreateBabyDto {
  @IsString()
  @IsNotEmpty({ message: '宝宝名字不能为空' })
  name: string;

  @IsEnum(['male', 'female'], { message: '性别只能是 male 或 female' })
  gender: 'male' | 'female';

  @IsDateString({}, { message: '出生日期格式不正确' })
  birthday: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdateBabyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(['male', 'female'])
  @IsOptional()
  gender?: 'male' | 'female';

  @IsDateString()
  @IsOptional()
  birthday?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
