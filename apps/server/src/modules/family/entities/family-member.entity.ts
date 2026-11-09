import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Baby } from '../../baby/entities/baby.entity';

export enum MemberRole {
  FATHER = 'father',
  MOTHER = 'mother',
  GRANDFATHER = 'grandfather',
  GRANDMOTHER = 'grandmother',
  OTHER = 'other',
}

/**
 * 权限级别 —— 与上面的 MemberRole 是两回事。
 *
 * MemberRole 是**亲属称谓**（爸爸/妈妈/爷爷…），只用于展示；
 * 这个枚举才是**权限**，决定这个家人能不能写数据。
 *
 * 为什么单独加一列而不是复用 role：role 已经被前端 ROLE_MAP 当称谓渲染，
 * 混进权限值会让「奶奶」变成「奶奶=只读」这种耦合，以后改权限定义就得改称谓表。
 *
 * 默认 EDITOR：上线前所有成员都是"什么都能改"，默认值必须是它，
 * 否则一发布所有老家庭立刻被降权，用户会以为坏了。
 */
export enum MemberAccess {
  /** 创建者：全部权限，含删宝宝、管成员、改权限 */
  OWNER = 'owner',
  /** 可记录：能增删改记录/照片/里程碑 */
  EDITOR = 'editor',
  /** 只读：能看统计和记录，不能写 */
  VIEWER = 'viewer',
}

export enum InviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('family_members')
export class FamilyMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'inviter_id' })
  inviterId: string;

  @Column({
    type: 'enum',
    enum: MemberRole,
    default: MemberRole.OTHER,
  })
  role: MemberRole;

  /**
   * 权限级别。线上加列见 docs/sql/family-access-level-2026-11.sql，
   * 默认 EDITOR 保持存量成员原有能力不变。
   */
  @Column({
    name: 'access_level',
    type: 'enum',
    enum: MemberAccess,
    default: MemberAccess.EDITOR,
    comment: 'owner=创建者 / editor=可记录 / viewer=只读',
  })
  accessLevel: MemberAccess;

  @Column({
    type: 'enum',
    enum: InviteStatus,
    default: InviteStatus.PENDING,
  })
  status: InviteStatus;

  // 旧版"邀请即成员"模型遗留列：新模型下成员不再由邀请码标识，保留兼容历史数据
  @Column({ name: 'invite_code', nullable: true, length: 8 })
  inviteCode: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'inviter_id' })
  inviter: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
