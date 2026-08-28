import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FamilyMember, InviteStatus, MemberRole } from './entities/family-member.entity';
import {
  FamilyInvite,
  FamilyInviteStatus,
} from './entities/family-invite.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { BabyService } from '../baby/baby.service';
import { v4 as uuidv4 } from 'uuid';

// 家庭成员人数上限
const FAMILY_MEMBER_LIMIT = 8;

@Injectable()
export class FamilyService {
  // 邀请卡有效期（天），可通过 env 调整便于测试
  private readonly inviteExpireDays = parseInt(
    process.env.FAMILY_INVITE_EXPIRE_DAYS || '7',
    10,
  );

  constructor(
    @InjectRepository(FamilyMember)
    private familyRepository: Repository<FamilyMember>,
    @InjectRepository(FamilyInvite)
    private inviteRepository: Repository<FamilyInvite>,
    private babyService: BabyService,
  ) {}

  // 生成邀请码
  private generateInviteCode(): string {
    return uuidv4().substring(0, 8).toUpperCase();
  }

  // 创建（或复用）邀请卡：一张卡在有效期内可让多位家人加入
  async createInvite(userId: string, createInviteDto: CreateInviteDto) {
    const { babyId, force } = createInviteDto;

    // 验证宝宝属于当前用户（仅创建者可邀请）
    await this.babyService.creatorOnlyFindOne(babyId, userId);

    // 强制重新生成：作废当前有效邀请卡
    if (force) {
      await this.inviteRepository.update(
        { babyId, inviterId: userId, status: FamilyInviteStatus.ACTIVE },
        { status: FamilyInviteStatus.DISABLED },
      );
    } else {
      // 复用仍然有效的邀请卡
      const existing = await this.inviteRepository.findOne({
        where: { babyId, inviterId: userId, status: FamilyInviteStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (existing && existing.expiresAt > new Date()) {
        return {
          inviteCode: existing.inviteCode,
          expiresAt: existing.expiresAt,
          message: '已有有效邀请卡',
        };
      }
      // 已过期但未标记的旧卡，顺手作废
      if (existing) {
        existing.status = FamilyInviteStatus.DISABLED;
        await this.inviteRepository.save(existing);
      }
    }

    const inviteCode = this.generateInviteCode();
    const expiresAt = new Date(
      Date.now() + this.inviteExpireDays * 24 * 60 * 60 * 1000,
    );

    const invite = this.inviteRepository.create({
      babyId,
      inviterId: userId,
      inviteCode,
      status: FamilyInviteStatus.ACTIVE,
      expiresAt,
    });

    await this.inviteRepository.save(invite);

    return { inviteCode, expiresAt };
  }

  // 查询邀请卡信息（供落地页展示与状态判断）
  async getInviteInfo(userId: string, inviteCode: string) {
    const invite = await this.inviteRepository.findOne({
      where: { inviteCode },
      relations: ['baby', 'inviter'],
    });

    const base = {
      inviterNickname: invite?.inviter?.nickname || '家人',
      babyName: invite?.baby?.name || '宝宝',
      babyGender: invite?.baby?.gender,
    };

    if (!invite || invite.status === FamilyInviteStatus.DISABLED) {
      return { valid: false, reason: 'invalid', ...base };
    }
    if (invite.expiresAt <= new Date()) {
      return { valid: false, reason: 'expired', ...base };
    }
    if (invite.inviterId === userId) {
      return { valid: false, reason: 'own', ...base };
    }
    // 已是该宝宝家庭的成员
    const existingMember = await this.familyRepository.findOne({
      where: { userId, babyId: invite.babyId, status: InviteStatus.ACCEPTED },
    });
    if (existingMember) {
      return { valid: false, reason: 'already_member', ...base };
    }
    // 已绑定其他家庭
    const binding = await this.checkFamilyBinding(userId);
    if (binding.isBound) {
      return { valid: false, reason: 'bound_other', ...base };
    }
    // 家庭人数是否已满
    const memberCount = await this.countAcceptedMembers(invite.babyId);
    if (memberCount >= FAMILY_MEMBER_LIMIT) {
      return { valid: false, reason: 'full', ...base };
    }

    return { valid: true, reason: null, ...base };
  }

  private countAcceptedMembers(babyId: string): Promise<number> {
    return this.familyRepository.count({
      where: { babyId, status: InviteStatus.ACCEPTED },
    });
  }

  // 检查账号是否已绑定家庭关系
  async checkFamilyBinding(userId: string) {
    // 1. 作为创建者，是否有家庭成员
    const myBabies = await this.babyService.findAllByUser(userId);
    const ownedBabyIds = myBabies.filter(b => b.isOwner).map(b => b.id);

    if (ownedBabyIds.length > 0) {
      const memberCount = await this.familyRepository.count({
        where: ownedBabyIds.map(id => ({
          babyId: id,
          status: InviteStatus.ACCEPTED,
        })),
      });
      if (memberCount > 0) {
        return { isBound: true, reason: 'owner' as const };
      }
    }

    // 2. 作为成员，是否已加入其他家庭
    const asMember = await this.familyRepository.count({
      where: { userId, status: InviteStatus.ACCEPTED },
    });

    if (asMember > 0) {
      return { isBound: true, reason: 'member' as const };
    }

    return { isBound: false, reason: null };
  }

  // 接受邀请（新：邀请卡模型，一卡多人；兼容旧版一次性邀请码）
  async acceptInvite(userId: string, inviteCode: string, role?: MemberRole) {
    const invite = await this.inviteRepository.findOne({
      where: { inviteCode },
    });

    if (!invite || invite.status === FamilyInviteStatus.DISABLED) {
      // 兼容改造前生成的旧版一次性邀请码（记录在 family_members 表，PENDING 状态）
      return this.acceptLegacyInvite(userId, inviteCode, role);
    }
    if (invite.expiresAt <= new Date()) {
      throw new BadRequestException('邀请已过期，请联系邀请人重新分享');
    }
    if (invite.inviterId === userId) {
      throw new BadRequestException('不能接受自己的邀请');
    }

    // 检查是否已经是该宝宝的家庭成员
    const existingMember = await this.familyRepository.findOne({
      where: { userId, babyId: invite.babyId, status: InviteStatus.ACCEPTED },
    });
    if (existingMember) {
      throw new BadRequestException('已经是该宝宝的家庭成员');
    }

    // 检查账号是否已绑定其他家庭关系
    const binding = await this.checkFamilyBinding(userId);
    if (binding.isBound) {
      throw new BadRequestException('该账号已绑定家庭关系，无法加入其他家庭');
    }

    // 家庭人数上限
    const memberCount = await this.countAcceptedMembers(invite.babyId);
    if (memberCount >= FAMILY_MEMBER_LIMIT) {
      throw new BadRequestException(`家庭成员已满（上限 ${FAMILY_MEMBER_LIMIT} 人）`);
    }

    const member = this.familyRepository.create({
      babyId: invite.babyId,
      inviterId: invite.inviterId,
      userId,
      role: role || MemberRole.OTHER,
      status: InviteStatus.ACCEPTED,
    });

    await this.familyRepository.save(member);

    return { success: true, message: '已成功加入家庭' };
  }

  // 旧版一次性邀请码（邀请记录即成员记录）的兼容入口
  private async acceptLegacyInvite(
    userId: string,
    inviteCode: string,
    role?: MemberRole,
  ) {
    const invite = await this.familyRepository.findOne({
      where: { inviteCode, status: InviteStatus.PENDING },
    });

    if (!invite) {
      throw new NotFoundException('邀请码无效或已使用');
    }

    if (invite.inviterId === userId) {
      throw new BadRequestException('不能接受自己的邀请');
    }

    const existingMember = await this.familyRepository.findOne({
      where: { userId, babyId: invite.babyId, status: InviteStatus.ACCEPTED },
    });
    if (existingMember) {
      throw new BadRequestException('已经是该宝宝的家庭成员');
    }

    const binding = await this.checkFamilyBinding(userId);
    if (binding.isBound) {
      throw new BadRequestException('该账号已绑定家庭关系，无法加入其他家庭');
    }

    invite.userId = userId;
    invite.status = InviteStatus.ACCEPTED;
    if (role) {
      invite.role = role;
    }

    await this.familyRepository.save(invite);

    return { success: true, message: '已成功加入家庭' };
  }

  // 获取用户所在家庭的所有成员（账号级别）
  async getFamilyMembers(userId: string) {
    // 判断是创建者还是成员
    const asOwner = await this.familyRepository.find({
      where: { inviterId: userId, status: InviteStatus.ACCEPTED },
      relations: ['user'],
    });

    if (asOwner.length > 0) {
      // 创建者视角：返回成员列表 + 自己
      const ownerUser = await this.babyService.findOwnerUser(userId);
      const ownerEntry = {
        id: `owner-${userId}`,
        userId,
        role: 'owner',
        user: ownerUser,
      };
      return [ownerEntry, ...asOwner];
    }

    // 是成员，找到自己加入的那条记录，获取同一家庭的所有成员
    const myRecord = await this.familyRepository.findOne({
      where: { userId, status: InviteStatus.ACCEPTED },
    });

    if (!myRecord) {
      return [];
    }

    // 获取同一家庭的其他成员（不含自己）
    const members = await this.familyRepository.find({
      where: { inviterId: myRecord.inviterId, status: InviteStatus.ACCEPTED },
      relations: ['user'],
    });

    // 获取家庭创建者的信息，补充到列表中
    const ownerUser = await this.babyService.findOwnerUser(myRecord.inviterId);
    const ownerEntry = {
      id: `owner-${myRecord.inviterId}`,
      userId: myRecord.inviterId,
      role: 'owner',
      user: ownerUser,
    };

    return [ownerEntry, ...members];
  }

  // 获取用户的家庭（所有关联的宝宝）
  async getUserFamilies(userId: string) {
    // 作为成员的宝宝
    const memberRecords = await this.familyRepository.find({
      where: { userId, status: InviteStatus.ACCEPTED },
      relations: ['baby', 'baby.user'],
    });

    const memberBabyIds = new Set(memberRecords.map(r => r.babyId));
    const memberBabies = memberRecords
      .filter(r => r.baby)
      .map((record) => ({
        ...record.baby,
        role: record.role,
        isOwner: false,
      }));

    // 作为创建者的宝宝（排除已作为成员出现的）
    const myBabies = await this.babyService.findAllByUser(userId);
    const ownedBabies = myBabies
      .filter(baby => !memberBabyIds.has(baby.id))
      .map((baby) => ({
        ...baby,
        role: 'owner',
        isOwner: true,
      }));

    return [...ownedBabies, ...memberBabies];
  }

  // 移除家庭成员
  async removeMember(userId: string, memberId: string) {
    const member = await this.familyRepository.findOne({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('成员不存在');
    }

    // 验证权限（只有家庭创建者可以移除成员）
    if (member.inviterId !== userId) {
      throw new BadRequestException('仅家庭创建者可移除成员');
    }

    await this.familyRepository.remove(member);

    return { success: true };
  }

  // 主动退出家庭
  async leaveFamily(userId: string) {
    const record = await this.familyRepository.findOne({
      where: { userId, status: InviteStatus.ACCEPTED },
    });

    if (!record) {
      throw new BadRequestException('你尚未加入任何家庭');
    }

    await this.familyRepository.remove(record);

    return { success: true };
  }

  // 验证用户是否有权限访问宝宝（账号级别：检查是否是创建者或其家庭成员）
  private async verifyBabyAccess(userId: string, babyId: string) {
    // 检查是否是宝宝的创建者
    const baby = await this.babyService.findById(babyId);
    if (baby.userId === userId) {
      return true;
    }

    // 不是创建者，检查是否是该创建者家庭的成员
    const member = await this.familyRepository.findOne({
      where: { userId, inviterId: baby.userId, status: InviteStatus.ACCEPTED },
    });

    if (!member) {
      throw new BadRequestException('无权访问该宝宝信息');
    }

    return true;
  }
}
