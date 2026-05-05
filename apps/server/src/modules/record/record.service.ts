import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Record } from './entities/record.entity';
import { CreateRecordDto } from './dto/create-record.dto';
import { BabyService } from '../baby/baby.service';

@Injectable()
export class RecordService {
  constructor(
    @InjectRepository(Record)
    private recordRepository: Repository<Record>,
    private babyService: BabyService,
  ) {}

  async create(userId: string, createRecordDto: CreateRecordDto) {
    await this.babyService.findOne(createRecordDto.babyId, userId);
    const record = this.recordRepository.create(createRecordDto);
    return this.recordRepository.save(record);
  }

  async findAllByBaby(userId: string, babyId: string, date?: string) {
    await this.babyService.findOne(babyId, userId);

    const where: any = { babyId };

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.startTime = Between(start, end);
    }

    return this.recordRepository.find({
      where,
      order: { startTime: 'DESC' },
    });
  }

  async findOne(id: string, userId: string) {
    const record = await this.recordRepository.findOne({
      where: { id },
      relations: ['baby'],
    });

    if (!record) {
      throw new NotFoundException('记录不存在');
    }

    await this.babyService.findOne(record.babyId, userId);
    return record;
  }

  async remove(id: string, userId: string) {
    const record = await this.findOne(id, userId);
    await this.recordRepository.remove(record);
    return { success: true };
  }

  async getTodaySummary(userId: string, babyId: string) {
    await this.babyService.findOne(babyId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await this.recordRepository.find({
      where: {
        babyId,
        startTime: Between(today, tomorrow),
      },
    });

    const summary = {
      feedingCount: 0,
      totalMilk: 0,
      diaperCount: 0,
      sleepTotal: 0,
      sleepCount: 0,
      foodCount: 0,
      waterTotal: 0,
      bathCount: 0,
      outdoorCount: 0,
    };

    records.forEach((record) => {
      switch (record.type) {
        case 'feeding':
          summary.feedingCount++;
          if (record.amount) summary.totalMilk += record.amount;
          break;
        case 'diaper':
          summary.diaperCount++;
          break;
        case 'sleep':
          summary.sleepCount++;
          if (record.duration) summary.sleepTotal += record.duration;
          break;
        case 'food':
          summary.foodCount++;
          break;
        case 'water':
          if (record.amount) summary.waterTotal += record.amount;
          break;
        case 'bath':
          summary.bathCount++;
          break;
        case 'outdoor':
          summary.outdoorCount++;
          break;
      }
    });

    return { records, summary };
  }

  // 获取本地日期字符串 YYYY-MM-DD
  private getLocalDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 获取统计数据（最近 N 天，包含今天）
  async getStats(userId: string, babyId: string, days: number = 7) {
    await this.babyService.findOne(babyId, userId);

    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0, 0);

    const records = await this.recordRepository.find({
      where: {
        babyId,
        startTime: Between(startDate, endDate),
      },
      order: { startTime: 'ASC' },
    });

    // 按日期分组统计
    const dailyStats: { [key: string]: any } = {};

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = this.getLocalDateStr(date);
      dailyStats[dateKey] = {
        date: dateKey,
        feedingCount: 0,
        totalMilk: 0,
        diaperCount: 0,
        sleepTotal: 0,
        sleepCount: 0,
        foodCount: 0,
        waterTotal: 0,
      };
    }

    records.forEach((record) => {
      const dateKey = this.getLocalDateStr(new Date(record.startTime));
      if (dailyStats[dateKey]) {
        switch (record.type) {
          case 'feeding':
            dailyStats[dateKey].feedingCount++;
            if (record.amount) dailyStats[dateKey].totalMilk += record.amount;
            break;
          case 'diaper':
            dailyStats[dateKey].diaperCount++;
            break;
          case 'sleep':
            dailyStats[dateKey].sleepCount++;
            if (record.duration) dailyStats[dateKey].sleepTotal += record.duration;
            break;
          case 'food':
            dailyStats[dateKey].foodCount++;
            break;
          case 'water':
            if (record.amount) dailyStats[dateKey].waterTotal += record.amount;
            break;
        }
      }
    });

    // 获取最新的身高体重和体温
    const latestHeightWeight = await this.recordRepository.findOne({
      where: { babyId, type: 'height_weight' as any },
      order: { startTime: 'DESC' },
    });

    const latestTemperature = await this.recordRepository.findOne({
      where: { babyId, type: 'temperature' as any },
      order: { startTime: 'DESC' },
    });

    return {
      dailyStats: Object.values(dailyStats),
      latestHeightWeight: latestHeightWeight
        ? { height: latestHeightWeight.height, weight: latestHeightWeight.weight, date: latestHeightWeight.startTime }
        : null,
      latestTemperature: latestTemperature
        ? { temperature: latestTemperature.temperature, date: latestTemperature.startTime }
        : null,
    };
  }
}
