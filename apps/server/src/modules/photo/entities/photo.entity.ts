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

// 相册列表固定按 babyId 过滤 + photoDate 倒序分页，缺这个索引会随照片量增长变慢
@Entity('photos')
@Index('idx_photos_baby_photo_date', ['babyId', 'photoDate'])
// 后台相册指标的「近 7/30 天上传量」只按 created_at 取范围
@Index('idx_photos_created_at', ['createdAt'])
export class Photo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'url', comment: '图片URL' })
  url: string;

  @Column({ name: 'thumbnail', nullable: true, comment: '缩略图URL' })
  thumbnail: string;

  @Column({ name: 'photo_date', type: 'date', comment: '拍照日期' })
  photoDate: string;

  @Column({ name: 'note', type: 'text', nullable: true, comment: '备注' })
  note: string;

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
