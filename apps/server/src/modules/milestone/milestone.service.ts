import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Milestone } from './entities/milestone.entity';
import {
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/create-milestone.dto';
import { findMilestone } from '@baby-time/shared';
import { BabyService } from '../baby/baby.service';
import { ContentSecurityService } from '../content-security/content-security.service';

const CUSTOM_CATEGORY = 'custom';

@Injectable()
export class MilestoneService {
  constructor(
    @InjectRepository(Milestone)
    private milestoneRepository: Repository<Milestone>,
    private babyService: BabyService,
    private contentSecurity: ContentSecurityService,
  ) {}

  async create(userId: string, dto: CreateMilestoneDto) {
    const baby = await this.babyService.findOne(dto.babyId, userId);
    const preset = dto.code ? findMilestone(dto.code) : undefined;
    if (dto.code && !preset) {
      throw new BadRequestException('这个里程碑不在清单里，可以改成自定义里程碑');
    }

    const title = (preset ? preset.title : dto.title || '').trim();
    if (!title) throw new BadRequestException('请填写里程碑名称');
    const note = dto.note?.trim() || null;
    const date = dto.date || this.today();
    this.validateDate(date, baby.birthday);

    // 预置项一个宝宝只打一次：唯一索引兜底，这里先给出可读的提示
    if (preset) {
      const existed = await this.milestoneRepository.findOne({
        where: { babyId: dto.babyId, code: preset.code },
      });
      if (existed) throw new BadRequestException(`「${preset.title}」已经打过卡了`);
    }

    // 送检的就是最终入库的那份文本，避免「检的和存的不是一回事」
    await this.contentSecurity.checkUserTexts(userId, [title, note], 2);

    const milestone = this.milestoneRepository.create({
      babyId: dto.babyId,
      actorUserId: userId,
      code: preset?.code ?? null,
      title,
      category: preset?.category ?? CUSTOM_CATEGORY,
      isCustom: !preset,
      date,
      note,
      photoUrl: dto.photoUrl || null,
    });
    return this.milestoneRepository.save(milestone);
  }

  async findAllByBaby(userId: string, babyId: string) {
    await this.babyService.findOne(babyId, userId);
    return this.milestoneRepository.find({
      where: { babyId },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  async update(id: string, userId: string, dto: UpdateMilestoneDto) {
    const milestone = await this.findOne(id, userId);
    const baby = await this.babyService.findOne(milestone.babyId, userId);

    if (dto.date) this.validateDate(dto.date, baby.birthday);
    // 预置项的名称跟着清单走，只允许改自定义项的标题
    const title = dto.title?.trim();
    const nextTitle = milestone.isCustom && title ? title : undefined;
    if (nextTitle) milestone.title = nextTitle;
    if (dto.date) milestone.date = dto.date;
    if (dto.note !== undefined) milestone.note = dto.note.trim() || null;
    if (dto.photoUrl !== undefined) milestone.photoUrl = dto.photoUrl || null;

    await this.contentSecurity.checkUserTexts(userId, [nextTitle, milestone.note], 2);
    return this.milestoneRepository.save(milestone);
  }

  async remove(id: string, userId: string) {
    const milestone = await this.findOne(id, userId);
    await this.milestoneRepository.remove(milestone);
    return { success: true };
  }

  private async findOne(id: string, userId: string) {
    const milestone = await this.milestoneRepository.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('里程碑不存在');
    await this.babyService.findOne(milestone.babyId, userId);
    return milestone;
  }

  // 日期不能晚于今天、不能早于出生（错一条就会让整条时间轴的可信度掉下来）
  private validateDate(date: string, birthday: string) {
    const value = new Date(`${date}T00:00:00`);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('日期格式不正确');
    }
    if (date > this.today()) throw new BadRequestException('日期不能晚于今天');
    if (birthday && date < birthday) {
      throw new BadRequestException('日期不能早于宝宝的出生日期');
    }
  }

  private today() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
