import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMomentCommentDto {
  @IsString()
  @IsNotEmpty({ message: '评论内容不能为空' })
  @MaxLength(200, { message: '评论最多 200 字' })
  content: string;

  /** 楼中楼：回复时传所属的一级评论 ID */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  parentId?: string;

  /** 楼中楼：回复某条评论时传目标评论 ID，服务端据此生成「回复 @昵称」 */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  replyToCommentId?: string;
}
