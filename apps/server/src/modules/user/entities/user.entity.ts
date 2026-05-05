import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'open_id', unique: true, comment: '微信 openId' })
  openId: string;

  @Column({ name: 'union_id', nullable: true, comment: '微信 unionId' })
  unionId: string;

  @Column({ name: 'nickname', default: '微信用户', comment: '昵称' })
  nickname: string;

  @Column({ name: 'avatar', nullable: true, comment: '头像URL' })
  avatar: string;

  @Column({ name: 'role', nullable: true, comment: '角色: father/mother' })
  role: string;

  @OneToMany(() => Baby, (baby) => baby.user)
  babies: Baby[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
