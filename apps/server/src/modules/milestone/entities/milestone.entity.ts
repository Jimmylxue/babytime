import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

/**
 * 成长里程碑打卡（第一次翻身/长牙/叫妈妈…）。
 *
 * 与 records 分开建表：记录表是「一天几十条的高频流水」，里程碑是「一生几十条的低频事件」，
 * 混在一起会让统计页每次聚合都要先过滤掉它。
 *
 * code 引用 packages/shared 的 MILESTONE_CATALOG（稳定标识，改名会让用户已打的卡失联）；
 * 自定义里程碑 code 为空、isCustom=true。title 冗余存一份，这样清单文案日后调整
 * 不会把用户当时看到的名字改掉（打卡当下叫什么，纪念海报上就叫什么）。
 */
@Entity('baby_milestones')
// 时间轴列表固定按 baby_id 过滤 + date 倒序
@Index('idx_milestones_baby_date', ['babyId', 'date'])
// 预置里程碑一个宝宝只能打一次；code 为 NULL 的自定义项不受约束（MySQL 唯一索引允许多个 NULL）
@Index('uk_milestones_baby_code', ['babyId', 'code'], { unique: true })
export class Milestone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'actor_user_id', nullable: true, comment: '实际打卡的用户（家人代记时与创建者不同）' })
  actorUserId: string;

  // 列类型为 `string | null` 时 TypeORM 推不出 design:type（Object），必须显式写 type
  @Column({ name: 'code', type: 'varchar', length: 40, nullable: true, comment: '预置里程碑编码，自定义为空' })
  code: string | null;

  @Column({ name: 'title', length: 40, comment: '里程碑名称' })
  title: string;

  @Column({ name: 'category', length: 20, comment: '分类，自定义为 custom' })
  category: string;

  @Column({ name: 'is_custom', type: 'boolean', default: false, comment: '是否用户自定义' })
  isCustom: boolean;

  @Column({ name: 'date', type: 'date', comment: '发生日期' })
  date: string;

  @Column({ name: 'note', type: 'text', nullable: true, comment: '一句话备注' })
  note: string | null;

  @Column({ name: 'photo_url', type: 'varchar', nullable: true, comment: '配图片 URL' })
  photoUrl: string | null;

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
