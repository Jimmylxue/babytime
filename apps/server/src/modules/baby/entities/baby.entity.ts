import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('babies')
export class Baby {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', comment: '用户ID' })
  userId: string;

  @Column({ name: 'name', comment: '宝宝名字' })
  name: string;

  @Column({
    name: 'gender',
    type: 'enum',
    enum: ['male', 'female'],
    comment: '性别',
  })
  gender: 'male' | 'female';

  @Column({ name: 'birthday', type: 'date', comment: '出生日期' })
  birthday: string;

  @Column({ name: 'avatar', nullable: true, comment: '头像URL' })
  avatar: string;

  @ManyToOne(() => User, (user) => user.babies)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
