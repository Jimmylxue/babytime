import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

@Entity('vaccine_plans')
@Index('idx_vaccine_plans_baby_item', ['babyId', 'scheduleItemId'], { unique: true })
export class VaccinePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'schedule_item_id', length: 64 })
  scheduleItemId: string;

  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 36, nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => Baby, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
