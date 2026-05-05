import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FamilyMember, InviteStatus, MemberRole } from './entities/family-member.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { BabyService } from '../baby/baby.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(FamilyMember)
    private familyRepository: Repository<FamilyMember>,
    private babyService: BabyService,
  ) {}

  // 生成邀请码
  private generateInviteCode(): string {
    return uuidv4().substring(0, 8).toUpperCase();
  }

  // 创建邀请
  async createInvite(userId: string, createInviteDto: CreateInviteDto) {
    const { babyId, role } = createInviteDto;

    // 验证宝宝属于当前用户
    await this.babyService.findOne(babyId, userId);

    // 检查是否已经邀请过
    const existing = await this.familyRepository.findOne({
      where: { inviterId: userId, babyId, status: InviteStatus.PENDING },
    });

    if (existing) {
      return {
        inviteCode: existing.inviteCode,
        message: '已有未使用的邀请码',
      };
    }

    const inviteCode = this.generateInviteCode();

    const invite = this.familyRepository.create({
      babyId,
      inviterId: userId,
      role: role || MemberRole.OTHER,
      status: InviteStatus.PENDING,
      inviteCode,
    });

    await this.familyRepository.save(invite);

    return { inviteCode };
  }

  // 接受邀请
  async acceptInvite(userId: string, inviteCode: string, role?: MemberRole) {
    const invite = await this.familyRepository.findOne({
      where: { inviteCode, status: InviteStatus.PENDING },
    });

    if (!invite) {
      throw new NotFoundException('邀请码无效或已使用');
    }

    // 检查是否是自己的邀请
    if (invite.inviterId === userId) {
      throw new BadRequestException('不能接受自己的邀请');
    }

    // 检查是否已经是家庭成员
    const existingMember = await this.familyRepository.findOne({
      where: { userId, babyId: invite.babyId, status: InviteStatus.ACCEPTED },
    });

    if (existingMember) {
      throw new BadRequestException('已经是该宝宝的家庭成员');
    }

    invite.userId = userId;
    invite.status = InviteStatus.ACCEPTED;
    if (role) {
      invite.role = role;
    }

    await this.familyRepository.save(invite);

    return { success: true, message: '已成功加入家庭' };
  }

  // 获取宝宝的家庭成员
  async getFamilyMembers(userId: string, babyId: string) {
    // 验证用户有权限访问该宝宝
    await this.verifyBabyAccess(userId, babyId);

    return this.familyRepository.find({
      where: { babyId, status: InviteStatus.ACCEPTED },
      relations: ['user'],
    });
  }

  // 获取用户的家庭（所有关联的宝宝）
  async getUserFamilies(userId: string) {
    // 作为创建者的宝宝
    const myBabies = await this.babyService.findAllByUser(userId);

    // 作为成员的宝宝
    const memberRecords = await this.familyRepository.find({
      where: { userId, status: InviteStatus.ACCEPTED },
      relations: ['baby', 'baby.user'],
    });

    const memberBabies = memberRecords.map((record) => ({
      ...record.baby,
      role: record.role,
      isOwner: false,
    }));

    const ownedBabies = myBabies.map((baby) => ({
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

    // 验证权限（只有创建者可以移除成员）
    await this.babyService.findOne(member.babyId, userId);

    await this.familyRepository.remove(member);

    return { success: true };
  }

  // 验证用户是否有权限访问宝宝
  private async verifyBabyAccess(userId: string, babyId: string) {
    // 检查是否是宝宝的创建者
    try {
      await this.babyService.findOne(babyId, userId);
      return true;
    } catch {
      // 不是创建者，检查是否是家庭成员
      const member = await this.familyRepository.findOne({
        where: { userId, babyId, status: InviteStatus.ACCEPTED },
      });

      if (!member) {
        throw new BadRequestException('无权访问该宝宝信息');
      }

      return true;
    }
  }
}
