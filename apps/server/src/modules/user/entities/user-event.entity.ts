import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('user_events')
@Index('idx_user_events_user_name_created', ['userId', 'name', 'createdAt'])
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
