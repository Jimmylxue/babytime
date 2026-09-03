import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('subscription_grants')
@Index('idx_subscription_grants_user_template', ['userId', 'templateId'], { unique: true })
export class SubscriptionGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'template_id', length: 128 })
  templateId: string;

  @Column({ length: 16 })
  status: string;

  @Column({ name: 'available_count', type: 'int', default: 0 })
  availableCount: number;

  @Column({ name: 'accepted_count', type: 'int', default: 0 })
  acceptedCount: number;

  @Column({ name: 'rejected_count', type: 'int', default: 0 })
  rejectedCount: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'granted_at', type: 'datetime', nullable: true })
  grantedAt: Date;

  @Column({ name: 'last_sent_at', type: 'datetime', nullable: true })
  lastSentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
