import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const REPORT_REASONS = ['spam', 'abuse', 'privacy', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export class ReportCommunityContentDto {
  @IsIn(['moment', 'comment'], { message: '举报对象类型不正确' })
  targetType: 'moment' | 'comment';

  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  targetId: string;

  @IsIn(REPORT_REASONS, { message: '举报原因不正确' })
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '补充说明最多 200 字' })
  detail?: string;
}
