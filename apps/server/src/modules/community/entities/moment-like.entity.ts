import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Moment } from '../../photo/entities/moment.entity';
import { User } from '../../user/entities/user.entity';

// 育娃圈点赞：一个用户对一条公开瞬间只能点一次赞
@Entity('moment_likes')
@Index('uk_moment_likes_moment_user', ['momentId', 'userId'], { unique: true })
@Index('idx_moment_likes_user', ['userId'])
export class MomentLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'moment_id', length: 36 })
  momentId: string;

  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @ManyToOne(() => Moment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moment_id' })
  moment: Moment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
