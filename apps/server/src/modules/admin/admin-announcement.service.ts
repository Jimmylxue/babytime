import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AdminAnnouncementService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  list() {
    return this.announcementRepository.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateAnnouncementDto) {
    // 公告 ID 同时是客户端已读状态的版本号，新公告必须使用新 ID。
    const announcement = this.announcementRepository.create({
      id: `admin-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
      title: dto.title,
      content: dto.content,
      isActive: dto.isActive ?? true,
      publishedAt: new Date(),
    });
    return this.announcementRepository.save(announcement);
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const announcement = await this.announcementRepository.findOneBy({ id });
    if (!announcement) {
      throw new NotFoundException('公告不存在');
    }

    Object.assign(announcement, dto);
    return this.announcementRepository.save(announcement);
  }
}
