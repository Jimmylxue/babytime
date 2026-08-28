import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Baby } from '../../baby/entities/baby.entity';

export enum FamilyInviteStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/**
 * 家庭邀请卡：一张卡在有效期内可被多位家人依次使用（上限为家庭人数上限）
 * 与成员（family_members）解耦，成员在接受邀请时单独创建
 */
@Entity('family_invites')
export class FamilyInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'invite_code', length: 8 })
  inviteCode: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({ name: 'inviter_id' })
  inviterId: string;

  @Column({
    type: 'enum',
    enum: FamilyInviteStatus,
    default: FamilyInviteStatus.ACTIVE,
  })
  status: FamilyInviteStatus;

  @Column({ name: 'expires_at', type: 'datetime', comment: '邀请卡失效时间' })
  expiresAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'inviter_id' })
  inviter: User;

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
