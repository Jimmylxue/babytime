import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

@Entity('photos')
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
