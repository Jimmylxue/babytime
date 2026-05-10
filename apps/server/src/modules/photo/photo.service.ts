import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async getTimeline(userId: string, babyId: string) {
    await this.babyService.findOne(babyId, userId);

    const photos = await this.photoRepository.find({
      where: { babyId },
      order: { photoDate: 'DESC', createdAt: 'DESC' },
    });

    // 按日期分组
    const timeline: { [key: string]: Photo[] } = {};
    photos.forEach((photo) => {
      const date = photo.photoDate;
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(photo);
    });

    return Object.entries(timeline).map(([date, photos]) => ({
      date,
      photos,
    }));
  }
}
