import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Photo } from './entities/photo.entity';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { BabyService } from '../baby/baby.service';

@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private photoRepository: Repository<Photo>,
    private babyService: BabyService,
  ) {}

  async create(userId: string, createPhotoDto: CreatePhotoDto) {
    await this.babyService.findOne(createPhotoDto.babyId, userId);
    const photo = this.photoRepository.create(createPhotoDto);
    return this.photoRepository.save(photo);
  }

  async findAllByBaby(userId: string, babyId: string, page: number = 1, pageSize: number = 20) {
    await this.babyService.findOne(babyId, userId);

    const [items, total] = await this.photoRepository.findAndCount({
      where: { babyId },
      order: { photoDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, userId: string) {
    const photo = await this.photoRepository.findOne({
      where: { id },
      relations: ['baby'],
    });

    if (!photo) {
      throw new NotFoundException('照片不存在');
    }

    // 通过 babyService.findOne 检查权限（创建者或家庭成员均可）
    await this.babyService.findOne(photo.babyId, userId);

    return photo;
  }

  async remove(id: string, userId: string) {
    const photo = await this.findOne(id, userId);
    await this.photoRepository.remove(photo);
    return { success: true };
  }

  async batchRemove(ids: string[], userId: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids 不能为空');
    }
    if (ids.length > 100) {
      throw new BadRequestException('单次最多删除 100 张');
    }

    const photos = await this.photoRepository.find({ where: { id: In(ids) } });
    if (photos.length === 0) {
      throw new NotFoundException('照片不存在');
    }

    // 涉及到的每个宝宝都做一次权限校验（创建者或家庭成员）
    const babyIds = [...new Set(photos.map((p) => p.babyId))];
    await Promise.all(babyIds.map((babyId) => this.babyService.findOne(babyId, userId)));

    // 单条 DELETE ... WHERE id IN，不存在的照片视为已删除，直接忽略
    const result = await this.photoRepository.delete({ id: In(photos.map((p) => p.id)) });
    return { deleted: result.affected ?? 0 };
  }

  async getTimeline(userId: string, babyId: string, page = 1, pageSize = 30) {
    await this.babyService.findOne(babyId, userId);

    const [photos, total] = await this.photoRepository.findAndCount({
      where: { babyId },
      order: { photoDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 当前页内按日期分组；同一日期跨页时由前端合并
    const timeline: { [key: string]: Photo[] } = {};
    photos.forEach((photo) => {
      const date = photo.photoDate;
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(photo);
    });

    return {
      items: Object.entries(timeline).map(([date, photos]) => ({ date, photos })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }
}
