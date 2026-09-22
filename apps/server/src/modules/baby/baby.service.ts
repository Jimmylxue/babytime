import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Baby } from './entities/baby.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { FamilyInvite } from '../family/entities/family-invite.entity';
import { Record } from '../record/entities/record.entity';
import { Photo } from '../photo/entities/photo.entity';
import { Milestone } from '../milestone/entities/milestone.entity';
import { VaccinePlan } from '../notification/entities/vaccine-plan.entity';
import { CreateBabyDto, UpdateBabyDto } from './dto/create-baby.dto';
import { ContentSecurityService } from '../content-security/content-security.service';
import { CdnCleanupService } from '../upload/cdn-cleanup.service';

@Injectable()
export class BabyService {
  constructor(
    @InjectRepository(Baby)
    private babyRepository: Repository<Baby>,
    @InjectRepository(FamilyMember)
    private familyRepository: Repository<FamilyMember>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private contentSecurity: ContentSecurityService,
    private cleanup: CdnCleanupService,
  ) {}

  async create(userId: string, createBabyDto: CreateBabyDto) {
    await this.contentSecurity.checkUserTexts(userId, [createBabyDto.name], 1);
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
    await this.contentSecurity.checkUserTexts(userId, [updateBabyDto.name], 1);
    const previousAvatar = baby.avatar;
    Object.assign(baby, updateBabyDto);
    const saved = await this.babyRepository.save(baby);
    if (saved.avatar !== previousAvatar) this.cleanup.scheduleDelete([previousAvatar]);
    return saved;
  }

  async remove(id: string, userId: string) {
    const baby = await this.creatorOnlyFindOne(id, userId);

    // 连带要删的图先取出来：事务提交后再交给清理任务，此时回查引用才判得准
    const [photos, milestones, diaperRecords] = await Promise.all([
      this.dataSource.getRepository(Photo).find({ where: { babyId: id }, select: ['url', 'thumbnail'] }),
      this.dataSource.getRepository(Milestone).find({ where: { babyId: id }, select: ['photoUrl'] }),
      this.dataSource.getRepository(Record).find({ where: { babyId: id }, select: ['diaperImage'] }),
    ]);

    // records/photos/family_* 的外键是 RESTRICT，须在同一事务内先清子表再删宝宝；
    // vaccine_plans 虽有 DB 级 CASCADE，也一并显式删除保证幂等
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Record, { babyId: id });
      await manager.delete(Photo, { babyId: id });
      await manager.delete(Milestone, { babyId: id });
      await manager.delete(VaccinePlan, { babyId: id });
      await manager.delete(FamilyInvite, { babyId: id });
      await manager.delete(FamilyMember, { babyId: id });
      await manager.delete(Baby, { id });
    });
    this.cleanup.scheduleDelete([
      baby.avatar,
      ...photos.flatMap((photo) => [photo.url, photo.thumbnail]),
      ...milestones.map((milestone) => milestone.photoUrl),
      ...diaperRecords.map((record) => record.diaperImage),
    ]);
    return { success: true };
  }
}
