import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  IsObject,
  IsBoolean,
  IsArray,
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
  breastAmount?: number;

  @IsNumber()
  @IsOptional()
  formulaAmount?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  // 尿布相关
  @IsEnum(DiaperStatus)
  @IsOptional()
  diaperStatus?: DiaperStatus;

  @IsString()
  @IsOptional()
  diaperImage?: string;

  @IsObject()
  @IsOptional()
  diaperAnalysis?: Record<string, unknown>;

  // 辅食/饮水
  @IsString()
  @IsOptional()
  foodName?: string;

  // 新食物观察：反应状态 + 是否首日新食物（仅辅食记录有意义）
  @IsString()
  @IsOptional()
  foodReaction?: string;

  @IsBoolean()
  @IsOptional()
  foodIsNew?: boolean;

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
  vaccineCode?: string;

  @IsNumber()
  @IsOptional()
  vaccineDose?: number;

  @IsString()
  @IsOptional()
  vaccineScheduleItemId?: string;

  @IsString()
  @IsOptional()
  vaccineScheduleVersion?: string;

  @IsBoolean()
  @IsOptional()
  isCustomVaccine?: boolean;

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

  // 记录配图（最多 9 张）：所有类型通用，与尿布专用的 diaperImage 并存
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];
}
