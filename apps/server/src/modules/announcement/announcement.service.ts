import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from './entities/announcement.entity';

const INITIAL_ANNOUNCEMENT_ID = 'ai-stool-analysis-v1';

@Injectable()
export class AnnouncementService implements OnModuleInit {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  async onModuleInit() {
    const existing = await this.announcementRepository.findOneBy({ id: INITIAL_ANNOUNCEMENT_ID });
    if (existing) return;

    await this.announcementRepository.save(this.announcementRepository.create({
      id: INITIAL_ANNOUNCEMENT_ID,
      title: '新功能上线',
      content: '新增 AI 分析便便功能。上传便便照片后，会结合宝宝的年龄阶段，提供便便情况的观察建议。',
      isActive: true,
    }));
  }

  async findCurrent() {
    return this.announcementRepository.findOne({
      where: { isActive: true },
      order: { publishedAt: 'DESC' },
    });
  }
}
