import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { RecordType, FeedingMethod, DiaperStatus } from '../entities/record.entity';

export class CreateRecordDto {
  @IsUUID()
  babyId: string;

  @IsEnum(RecordType)
  type: RecordType;

  @IsDateString()
  startTime: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  // 喂奶相关
  @IsEnum(FeedingMethod)
  @IsOptional()
  feedingMethod?: FeedingMethod;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  // 尿布相关
  @IsEnum(DiaperStatus)
  @IsOptional()
  diaperStatus?: DiaperStatus;

  // 辅食/饮水
  @IsString()
  @IsOptional()
  foodName?: string;

  // 体温
  @IsNumber()
  @IsOptional()
  temperature?: number;

  // 身高体重
  @IsNumber()
  @IsOptional()
  height?: number;

  @IsNumber()
  @IsOptional()
  weight?: number;

  // 用药
  @IsString()
  @IsOptional()
  medicineName?: string;

  @IsString()
  @IsOptional()
  medicineDose?: string;

  // 疫苗
  @IsString()
  @IsOptional()
  vaccineName?: string;

  @IsString()
  @IsOptional()
  vaccineHospital?: string;

  // 户外活动
  @IsString()
  @IsOptional()
  outdoorLocation?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
