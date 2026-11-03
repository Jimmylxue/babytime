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

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
