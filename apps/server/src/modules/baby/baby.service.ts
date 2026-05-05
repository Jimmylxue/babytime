import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Baby } from './entities/baby.entity';
import { CreateBabyDto, UpdateBabyDto } from './dto/create-baby.dto';

@Injectable()
export class BabyService {
  constructor(
    @InjectRepository(Baby)
    private babyRepository: Repository<Baby>,
  ) {}

  async create(userId: string, createBabyDto: CreateBabyDto) {
    const baby = this.babyRepository.create({
      ...createBabyDto,
      userId,
    });
    return this.babyRepository.save(baby);
  }

  async findAllByUser(userId: string) {
    return this.babyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string) {
    const baby = await this.babyRepository.findOne({
      where: { id },
    });

    if (!baby) {
      throw new NotFoundException('宝贝不存在');
    }

    if (baby.userId !== userId) {
      throw new ForbiddenException('无权访问');
    }

    return baby;
  }

  async update(id: string, userId: string, updateBabyDto: UpdateBabyDto) {
    const baby = await this.findOne(id, userId);
    Object.assign(baby, updateBabyDto);
    return this.babyRepository.save(baby);
  }

  async remove(id: string, userId: string) {
    const baby = await this.findOne(id, userId);
    await this.babyRepository.remove(baby);
    return { success: true };
  }
}
