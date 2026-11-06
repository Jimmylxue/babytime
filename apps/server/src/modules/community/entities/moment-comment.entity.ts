import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Moment } from '../../photo/entities/moment.entity';
import { User } from '../../user/entities/user.entity';

export type CommentStatus = 'visible' | 'hidden';

// 育娃圈评论：软删除用 hidden 保留举报处理证据
@Entity('moment_comments')
@Index('idx_moment_comments_moment_status_created', [
  'momentId',
  'status',
  'createdAt',
])
@Index('idx_moment_comments_moment_parent_created', [
  'momentId',
  'parentId',
  'createdAt',
])
@Index('idx_moment_comments_user', ['userId'])
export class MomentComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'moment_id', length: 36 })
  momentId: string;

  @Column({ name: 'user_id', length: 36 })
  userId: string;

  // 楼中楼：顶层评论为空，回复指向顶层评论；只做一层回复，不无限嵌套
  @Column({
    name: 'parent_id',
    type: 'varchar',
    length: 36,
    nullable: true,
    comment: '顶层评论为空；回复指向所属的顶层评论',
  })
  parentId: string | null;

  @Column({
    name: 'reply_to_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
    comment: '回复的目标用户，用于展示「回复 @昵称」',
  })
  replyToUserId: string | null;

  @Column({ type: 'text', comment: '评论内容' })
  content: string;

  @Column({
    type: 'enum',
    enum: ['visible', 'hidden'],
    default: 'visible',
    comment: 'visible=正常展示，hidden=已删除/已下架',
  })
  status: CommentStatus;

  @ManyToOne(() => Moment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moment_id' })
  moment: Moment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => MomentComment, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: MomentComment | null;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'reply_to_user_id' })
  replyToUser: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
