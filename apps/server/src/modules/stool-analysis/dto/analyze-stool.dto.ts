import { IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class AnalyzeStoolDto {
  @IsUUID()
  babyId: string;

  @IsUrl({ require_tld: false })
  imageUrl: string;

  // 仅用于补充家长主动提供的情况，不应用作诊断依据。
  @IsString()
  @IsOptional()
  @MaxLength(300)
  symptoms?: string;
}
