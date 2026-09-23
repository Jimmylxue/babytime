import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { FamilyMember, InviteStatus, MemberRole } from './entities/family-member.entity';
import {
  FamilyInvite,
  FamilyInviteStatus,
} from './entities/family-invite.entity';
import { FamilyMemberAlias } from './entities/family-member-alias.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { BabyService } from '../baby/baby.service';
import { User } from '../user/entities/user.entity';
import { ContentSecurityService } from '../content-security/content-security.service';
import { RateLimitService } from '../../common/rate-limit.service';

// 成员卡片对外只露这几个字段。整 User 实体一旦随成员列表发出去，同家庭的每个账号
// 就拿到了彼此的 openId / unionId / acquisitionSource / lastSeenAt —— unionId 是
// 微信开放平台的账号级标识，泄漏出去能把同一个人在我们各处的记录对上。
// family_members.inviteCode（旧版一次性码 = 该宝宝全部数据的入场券）也一并挡在门外。
function toPublicUser(user: Partial<User> | null | undefined, fallbackId: string) {
  return {
    id: user?.id ?? fallbackId,
    nickname: user?.nickname ?? null,
    avatar: user?.avatar ?? null,
    role: user?.role ?? null,
  };
}

function toMemberEntry(member: {
  id: string;
  userId: string;
  role: string;
  user?: Partial<User> | null;
}) {
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    user: toPublicUser(member.user, member.userId),
  };
}

// 家庭成员人数上限
const FAMILY_MEMBER_LIMIT = 8;

// 成员备注名（家庭内昵称）长度上限，与 DTO 校验保持一致
const MEMBER_NICKNAME_MAX = 20;

// 邀请码字母表：去掉了易混淆的 I L O 0 1，全大写 —— 库表是 utf8mb4_unicode_ci
// （大小写不敏感），混用大小写既没熵又容易两码撞同一个唯一索引
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;

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
    @InjectRepository(FamilyMemberAlias)
    private aliasRepository: Repository<FamilyMemberAlias>,
    private babyService: BabyService,
    private contentSecurity: ContentSecurityService,
    private rateLimit: RateLimitService,
  ) {}

  /**
   * 邀请码 = 别人宝宝全部数据的入场券，所以必须不可猜。
   * 旧实现取 uuidv4 前 8 位十六进制，只有 32 bit，配合无限频探测可被爆破；
   * 这里改成 CSPRNG + 32 字母表 × 8 位 ≈ 40 bit，并且只接受随机源（不掺时间）。
   */
  private generateInviteCode(): string {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
      code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
    }
    return code;
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

  /**
   * 邀请落地页要显示「谁邀请你加入 · 宝宝叫什么」来让人确认，这是正当用途；
   * 但卡号无效/已过期时绝不能回这些 —— 那样它就成了爆破的验证器：
   * 命中即白拿陌生宝宝的名字、性别和家人昵称。这类情况一律回占位文案。
   */
  private static readonly HIDDEN_PARTY = {
    inviterNickname: '家人',
    babyName: '宝宝',
    babyGender: undefined,
  };

  // 查询邀请卡信息（供落地页展示与状态判断）
  async getInviteInfo(userId: string, inviteCode: string) {
    this.rateLimit.assert('family-invite-lookup', userId);

    const invite = await this.inviteRepository.findOne({
      where: { inviteCode },
      relations: ['baby', 'inviter'],
    });

    if (!invite || invite.status === FamilyInviteStatus.DISABLED) {
      return { valid: false, reason: 'invalid', ...FamilyService.HIDDEN_PARTY };
    }
    if (invite.expiresAt <= new Date()) {
      return { valid: false, reason: 'expired', ...FamilyService.HIDDEN_PARTY };
    }

    const base = {
      inviterNickname: invite.inviter?.nickname || '家人',
      babyName: invite.baby?.name || '宝宝',
      babyGender: invite.baby?.gender,
    };

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
    // 命中即获得该宝宝的全部记录与照片，是爆破真正想拿的东西，所以比查询卡面限得更紧
    this.rateLimit.assert('family-invite-accept', userId);

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
      const ownerEntry = toMemberEntry({
        id: `owner-${userId}`,
        userId,
        role: 'owner',
        user: ownerUser,
      });
      return this.attachAliases(userId, [ownerEntry, ...asOwner.map(toMemberEntry)]);
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
    const ownerEntry = toMemberEntry({
      id: `owner-${myRecord.inviterId}`,
      userId: myRecord.inviterId,
      role: 'owner',
      user: ownerUser,
    });

    return this.attachAliases(myRecord.inviterId, [
      ownerEntry,
      ...members.map(toMemberEntry),
    ]);
  }

  // 给成员列表挂上本家庭的备注名：nickname 为 null 表示没设过，前端回落到微信昵称
  private async attachAliases<
    T extends { userId: string },
  >(familyOwnerId: string, entries: T[]) {
    const targetUserIds = entries.map(entry => entry.userId).filter(Boolean);
    if (targetUserIds.length === 0) {
      return entries.map(entry => ({ ...entry, nickname: null as string | null }));
    }

    const aliases = await this.aliasRepository.find({
      where: { familyOwnerId, targetUserId: In(targetUserIds) },
    });
    const aliasMap = new Map(aliases.map(alias => [alias.targetUserId, alias.nickname]));

    return entries.map(entry => ({
      ...entry,
      nickname: aliasMap.get(entry.userId) || null,
    }));
  }

  /**
   * 修改家庭成员在本家庭内的昵称（备注名）。
   * 备注是给「别人」看的，所以：
   * - 只有家庭创建者（且名下有成员）能改；
   * - 谁都不能改自己——自己的名字在「我的」页改（那是全局昵称，不限于本家庭）
   * - nickname 传空串等价于「恢复默认」，删除备注回落到微信昵称
   */
  async updateMemberNickname(
    userId: string,
    targetUserId: string,
    nickname?: string,
  ) {
    // 给自己设备注没有意义：列表里自己那一行显示的就是「我的」页的昵称
    if (targetUserId === userId) {
      throw new BadRequestException(
        '不能修改自己的昵称，请到「我的」页面修改',
      );
    }

    // 只有「有家人加入过」的创建者才有成员可管理
    const memberCount = await this.familyRepository.count({
      where: { inviterId: userId, status: InviteStatus.ACCEPTED },
    });
    if (memberCount === 0) {
      const joinedOthers = await this.familyRepository.count({
        where: { userId, status: InviteStatus.ACCEPTED },
      });
      throw new BadRequestException(
        joinedOthers > 0
          ? '仅家庭创建者可修改成员昵称'
          : '你还没有家庭成员，无法修改成员昵称',
      );
    }

    // 目标必须是我家庭的已接受成员
    await this.assertMyFamilyMember(userId, targetUserId);

    const trimmed = (nickname || '').trim();
    const existing = await this.aliasRepository.findOne({
      where: { familyOwnerId: userId, targetUserId },
    });

    // 恢复默认：删掉备注，回落到微信昵称
    if (!trimmed) {
      if (existing) {
        await this.aliasRepository.remove(existing);
      }
      return { success: true, nickname: null, restored: !!existing };
    }

    if (trimmed.length > MEMBER_NICKNAME_MAX) {
      throw new BadRequestException(`备注名最多 ${MEMBER_NICKNAME_MAX} 个字`);
    }

    // 微信内容安全检测，违规直接 400（与宝宝昵称、用户昵称同一套口径）
    await this.contentSecurity.checkUserTexts(userId, [trimmed], 1);

    if (existing) {
      existing.nickname = trimmed;
      existing.updatedBy = userId;
      await this.aliasRepository.save(existing);
    } else {
      await this.aliasRepository.save(
        this.aliasRepository.create({
          familyOwnerId: userId,
          targetUserId,
          nickname: trimmed,
          updatedBy: userId,
        }),
      );
    }

    return { success: true, nickname: trimmed };
  }

  // 目标用户必须确实是我家庭里已接受的成员（创建者自己除外，上面已拦）
  private async assertMyFamilyMember(ownerId: string, targetUserId: string) {
    const member = await this.familyRepository.findOne({
      where: {
        inviterId: ownerId,
        userId: targetUserId,
        status: InviteStatus.ACCEPTED,
      },
    });
    if (!member) {
      throw new BadRequestException('该成员不属于你的家庭');
    }
  }

  // 获取用户的家庭（所有关联的宝宝）
  async getUserFamilies(userId: string) {
    // 作为成员的宝宝。只 load baby：下面用 ...record.baby 摊平成响应，
    // 再多带一个 baby.user 就等于把创建者的 openId/unionId 发出去
    const memberRecords = await this.familyRepository.find({
      where: { userId, status: InviteStatus.ACCEPTED },
      relations: ['baby'],
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

    // 顺手清掉该成员在本家庭的备注名，避免留下孤儿数据
    if (member.userId) {
      await this.aliasRepository.delete({
        familyOwnerId: member.inviterId,
        targetUserId: member.userId,
      });
    }

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

    // 退出家庭时一并清掉自己的备注名（含别人给我起的和自留的）
    await this.aliasRepository.delete({
      familyOwnerId: record.inviterId,
      targetUserId: userId,
    });

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
