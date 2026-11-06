import { IsIn } from 'class-validator';

export class HandleCommunityReportDto {
  @IsIn(['hide', 'dismiss'], { message: '处理动作不正确' })
  action: 'hide' | 'dismiss';
}
