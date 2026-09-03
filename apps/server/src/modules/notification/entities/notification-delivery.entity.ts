import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('notification_deliveries')
@Index('idx_notification_deliveries_key', ['dedupeKey'], { unique: true })
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
