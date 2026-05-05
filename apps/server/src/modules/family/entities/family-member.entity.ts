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

  @Column({
    type: 'enum',
    enum: InviteStatus,
    default: InviteStatus.PENDING,
  })
  status: InviteStatus;

  @Column({ name: 'invite_code', unique: true, length: 8 })
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
