import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('announcements')
export class Announcement {
  // 公告 ID 同时用作客户端已读状态的版本号；发布新公告时请使用新 ID。
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ length: 40, comment: '公告标题' })
  title: string;

  @Column({ type: 'text', comment: '公告正文' })
  content: string;

  @Column({ name: 'is_active', default: true, comment: '是否对用户展示' })
  isActive: boolean;

  @Column({ name: 'published_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  publishedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
