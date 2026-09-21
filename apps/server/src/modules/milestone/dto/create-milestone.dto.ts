import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMilestoneDto {
  @IsString()
  @IsNotEmpty({ message: '缺少宝宝 ID' })
  babyId: string;

  // 预置里程碑传 code（名称由服务端从共享清单取，不接受客户端覆盖）；自定义里程碑不传 code、必须传 title
  @IsString()
  @IsOptional()
  @MaxLength(40, { message: '里程碑标识过长' })
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40, { message: '名称最长 40 个字' })
  title?: string;

  @IsDateString({}, { message: '日期格式不正确' })
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200, { message: '备注最长 200 个字' })
  note?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;
}

// 编辑时不允许改 babyId 和 code（换里程碑等于重打一条）
export class UpdateMilestoneDto {
  @IsString()
  @IsOptional()
  @MaxLength(40, { message: '名称最长 40 个字' })
  title?: string;

  @IsDateString({}, { message: '日期格式不正确' })
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200, { message: '备注最长 200 个字' })
  note?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;
}
