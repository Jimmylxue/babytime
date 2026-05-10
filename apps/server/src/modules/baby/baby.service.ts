import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Baby } from './entities/baby.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { CreateBabyDto, UpdateBabyDto } from './dto/create-baby.dto';

@Injectable()
export class BabyService {
  constructor(
    @InjectRepository(Baby)
    private babyRepository: Repository<Baby>,
    @InjectRepository(FamilyMember)
    private familyRepository: Repository<FamilyMember>,
  ) {}

  async create(userId: string, createBabyDto: CreateBabyDto) {
    const baby = this.babyRepository.create({
      ...createBabyDto,
      userId,
    });
    return this.babyRepository.save(baby);
  }

  async findAllByUser(userId: string) {
    // 自己创建的宝贝
    const myBabies = await this.babyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // 作为家庭成员关联的宝贝
    const memberRecords = await this.familyRepository.find({
      where: { userId, status: InviteStatus.ACCEPTED },
      relations: ['baby'],
    });
    const memberBabies = memberRecords.map(r => r.baby).filter(Boolean);

    // 合并去重，标记是否为创建者
    const allIds = new Set(myBabies.map(b => b.id));
    const merged = myBabies.map(baby => ({ ...baby, isOwner: true }));
    for (const baby of memberBabies) {
      if (!allIds.has(baby.id)) {
        merged.push({ ...baby, isOwner: false });
        allIds.add(baby.id);
      }
    }

    return merged;
  }

  // 仅按 ID 查找，不做权限检查（供内部服务调用）
  async findById(id: string) {
    const baby = await this.babyRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!baby) {
      throw new NotFoundException('宝贝不存在');
    }
    return baby;
  }

  // 获取创建者的用户信息
  async findOwnerUser(userId: string) {
    const baby = await this.babyRepository.findOne({
      where: { userId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return baby?.user || { id: userId };
  }

  // 允许创建者或家庭成员访问
  async findOne(id: string, userId: string) {
    const baby = await this.babyRepository.findOne({
      where: { id },
    });

    if (!baby) {
      throw new NotFoundException('宝贝不存在');
    }

    // 是创建者，直接放行
    if (baby.userId === userId) {
      return baby;
    }

    // 检查是否是家庭成员
    const member = await this.familyRepository.findOne({
      where: { userId, babyId: id, status: InviteStatus.ACCEPTED },
    });

    if (!member) {
      throw new ForbiddenException('无权访问');
    }

    return baby;
  }

  // 仅创建者可访问（用于删除宝贝、管理成员等敏感操作）
  async creatorOnlyFindOne(id: string, userId: string) {
    const baby = await this.babyRepository.findOne({
      where: { id },
    });

    if (!baby) {
      throw new NotFoundException('宝贝不存在');
    }

    if (baby.userId !== userId) {
      throw new ForbiddenException('仅创建者可操作');
    }

    return baby;
  }

  async update(id: string, userId: string, updateBabyDto: UpdateBabyDto) {
    const baby = await this.findOne(id, userId);
    Object.assign(baby, updateBabyDto);
    return this.babyRepository.save(baby);
  }

  async remove(id: string, userId: string) {
    const baby = await this.creatorOnlyFindOne(id, userId);
    await this.babyRepository.remove(baby);
    return { success: true };
  }
}
