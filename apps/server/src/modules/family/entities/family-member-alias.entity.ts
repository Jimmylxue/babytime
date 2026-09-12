import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 家庭成员备注名（家庭内昵称）。
 *
 * 为什么要单独一张表而不是加在 family_members 上：
 * 1. 家庭创建者自己没有 family_members 记录（列表里的「创建者」是运行时拼出来的），
 *    单独建表才能让「家人给创建者起备注名」和「创建者给家人起备注名」走同一套逻辑；
 * 2. 备注名是「家庭内」的称呼，不能改写 users.nickname（那是全局昵称，
 *    会影响用户在其它场景的展示）。
 *
 * 家庭以创建者（babies.user_id / family_members.inviter_id）为标识，
 * 一个账号目前只能属于一个家庭，因此 (family_owner_id, target_user_id) 唯一。
 */
@Entity('family_member_aliases')
@Index('uk_family_owner_target', ['familyOwnerId', 'targetUserId'], {
  unique: true,
})
export class FamilyMemberAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_owner_id', comment: '家庭创建者用户 ID' })
  familyOwnerId: string;

  @Column({ name: 'target_user_id', comment: '被备注的用户 ID' })
  targetUserId: string;

  @Column({ name: 'nickname', length: 20, comment: '本家庭内的备注名' })
  nickname: string;

  @Column({ name: 'updated_by', comment: '最后修改人用户 ID' })
  updatedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
