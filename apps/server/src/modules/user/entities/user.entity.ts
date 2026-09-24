import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

@Entity('users')
// 后台「今日/近 7 日新增」与用户列表的 ORDER BY created_at DESC 分页都靠它
@Index('idx_users_created_at', ['createdAt'])
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

  /**
   * 获客来源：扫码进入时携带的场景值（如 album/daily/chart/family）。
   * 只在**创建用户**时写入一次（first-write-wins），老用户扫码不回填，
   * 否则归因口径会被老用户污染。线上加列走 docs/acquisition-source.sql。
   */
  @Column({ name: 'acquisition_source', type: 'varchar', length: 32, nullable: true, comment: '获客来源(扫码场景值)' })
  acquisitionSource: string | null;

  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt: Date;

  @OneToMany(() => Baby, (baby) => baby.user)
  babies: Baby[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
