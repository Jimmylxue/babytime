import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export type ReportTargetType = 'moment' | 'comment';
export type ReportStatus = 'pending' | 'handled' | 'dismissed';

// 用户举报：target 是多态的（瞬间/评论），所以不建目标外键；
// 按内容删除时由后台列表把找不到目标的举报标成已删除/忽略。
@Entity('community_reports')
@Index('uk_community_reports_target_reporter', [
  'targetType',
  'targetId',
  'reporterUserId',
], { unique: true })
@Index('idx_community_reports_status_created', ['status', 'createdAt'])
export class CommunityReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ['moment', 'comment'],
    comment: '被举报对象类型',
  })
  targetType: ReportTargetType;

  @Column({ name: 'target_id', length: 36, comment: '被举报对象 ID' })
  targetId: string;

  @Column({ name: 'reporter_user_id', length: 36 })
  reporterUserId: string;

  @Column({ length: 32, comment: '举报原因编码' })
  reason: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '补充说明',
  })
  detail: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'handled', 'dismissed'],
    default: 'pending',
    comment: 'pending=待处理，handled=已下架，dismissed=已忽略',
  })
  status: ReportStatus;

  @Column({
    name: 'handled_by',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '处理的管理员',
  })
  handledBy: string | null;

  @Column({
    name: 'handled_at',
    type: 'datetime',
    nullable: true,
    comment: '处理时间',
  })
  handledAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_user_id' })
  reporter: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
