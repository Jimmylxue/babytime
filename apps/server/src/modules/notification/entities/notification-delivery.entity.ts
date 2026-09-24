import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('notification_deliveries')
@Index('idx_notification_deliveries_key', ['dedupeKey'], { unique: true })
// 疫苗漏斗的每条查询都是「先按模板过滤，再按 created_at 取范围或分组」，
// 复合索引一次走完；单列 created_at 仍要回表逐行判 template_id。
@Index('idx_notification_deliveries_template_created', ['templateId', 'createdAt'])
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dedupe_key', length: 255 })
  dedupeKey: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'template_id', length: 128 })
  templateId: string;

  @Column({ length: 16 })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  source: string;

  @Column({ name: 'triggered_by', type: 'varchar', length: 128, nullable: true })
  triggeredBy: string | null;

  @Column({ type: 'text', nullable: true })
  payload: string | null;

  @Column({ name: 'wechat_code', type: 'varchar', length: 32, nullable: true })
  wechatCode: string | null;

  @Column({ name: 'wechat_message', type: 'varchar', length: 255, nullable: true })
  wechatMessage: string | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
