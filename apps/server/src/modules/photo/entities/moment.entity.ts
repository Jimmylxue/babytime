import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

// 一条瞬间 = 朋友圈式帖子：若干张照片 + 一段文案。
// photos.moment_id 为空的旧照片不算在内，读信息流时按单图瞬间兜底。
@Entity('moments')
@Index('idx_moments_baby_photo_date', ['babyId', 'photoDate'])
// 育娃圈公开流按可见范围 + 发布时间分页
@Index('idx_moments_visibility_created', ['visibility', 'createdAt'])
export class Moment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'user_id', comment: '发布者ID，后续社交功能按作者区分' })
  userId: string;

  @Column({ name: 'content', type: 'text', nullable: true, comment: '文案' })
  content: string | null;

  @Column({ name: 'photo_date', type: 'date', comment: '所属日期' })
  photoDate: string;

  // family = 仅家庭成员可见；public = 同时进入育娃圈公开流
  @Column({
    name: 'visibility',
    type: 'enum',
    enum: ['family', 'public'],
    default: 'family',
    comment: '可见范围：family=家庭，public=育娃圈',
  })
  visibility: 'family' | 'public';

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
