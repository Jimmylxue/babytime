import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// 两个索引对应两种查询：后台分析一律 name + created_at（不带 user_id），留存分析是 user_id + created_at。
// 原先的 (user_id, name, created_at) 对前者用不上前导列，实测 3 万行时要扫完全部 30064 条索引项，
// 换成 (name, created_at) 后只扫 557 条；对后者又被中间的 name 挡住 created_at 范围（每用户 30 行 → 1 行）。
// 这是增长最快的表，别再加第三个索引。线上落地见 docs/sql/db-indexes-2026-09-23.sql。
@Entity('user_events')
@Index('idx_user_events_name_created', ['name', 'createdAt'])
@Index('idx_user_events_user_created', ['userId', 'createdAt'])
export class UserEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ length: 64 })
  name: string;

  @Column({ type: 'json', nullable: true })
  properties: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
