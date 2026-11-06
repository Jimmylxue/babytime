import { IsIn } from 'class-validator';

export class UpdateMomentVisibilityDto {
  @IsIn(['family', 'public'], { message: '可见范围不正确' })
  visibility: 'family' | 'public';
}
