import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  LessThan,
  Not,
  IsNull,
  FindOptionsWhere,
} from 'typeorm';
import { Record, RecordType } from './entities/record.entity';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { BabyService } from '../baby/baby.service';

// 支持"明细+间隔"展示的记录类型
const DETAIL_SUPPORTED_TYPES = [
  RecordType.FEEDING,
  RecordType.DIAPER,
  RecordType.SLEEP,
  RecordType.HEIGHT_WEIGHT,
  RecordType.TEMPERATURE,
  RecordType.VACCINE,
];

type GrowthMetric = 'height' | 'weight';

@Injectable()
export class RecordService {
  constructor(
    @InjectRepository(Record)
    private recordRepository: Repository<Record>,
    private babyService: BabyService,
  ) {}

  async create(userId: string, createRecordDto: CreateRecordDto) {
    await this.babyService.findOne(createRecordDto.babyId, userId);
    this.validateHeightWeightDate(createRecordDto.type, createRecordDto.startTime);
    this.validateHeightWeightValues(
      createRecordDto.type,
      createRecordDto.height,
      createRecordDto.weight,
    );

    // 混合喂养时，若未显式传入总奶量，用母乳量+奶粉量归一化，保持 amount 语义为"总奶量"
    if (
      createRecordDto.type === 'feeding' &&
      createRecordDto.feedingMethod === 'mixed' &&
      createRecordDto.amount == null
    ) {
      const breast = createRecordDto.breastAmount || 0;
      const formula = createRecordDto.formulaAmount || 0;
      if (breast || formula) {
        createRecordDto.amount = breast + formula;
      }
    }

    const record = this.recordRepository.create({ ...createRecordDto, actorUserId: userId });
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

  async findVaccinesByBaby(userId: string, babyId: string) {
    await this.babyService.findOne(babyId, userId);
    return this.recordRepository.find({
      where: { babyId, type: RecordType.VACCINE },
      order: { startTime: 'ASC' },
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

  async update(id: string, userId: string, updateRecordDto: UpdateRecordDto) {
    const record = await this.findOne(id, userId);
    if (updateRecordDto.startTime) {
      this.validateHeightWeightDate(record.type, updateRecordDto.startTime);
    }
    this.validateHeightWeightValues(
      record.type,
      updateRecordDto.height === undefined ? record.height : updateRecordDto.height,
      updateRecordDto.weight === undefined ? record.weight : updateRecordDto.weight,
    );

    // 混合喂养时，若未显式传入总奶量，用母乳量+奶粉量归一化，保持 amount 语义为"总奶量"
    const feedingMethod = updateRecordDto.feedingMethod ?? record.feedingMethod;
    if (
      record.type === RecordType.FEEDING &&
      feedingMethod === 'mixed' &&
      updateRecordDto.amount == null &&
      (updateRecordDto.breastAmount != null || updateRecordDto.formulaAmount != null)
    ) {
      const breast = updateRecordDto.breastAmount ?? record.breastAmount ?? 0;
      const formula = updateRecordDto.formulaAmount ?? record.formulaAmount ?? 0;
      updateRecordDto.amount = breast + formula;
    }

    Object.assign(record, updateRecordDto);
    return this.recordRepository.save(record);
  }

  private validateHeightWeightDate(type: RecordType, startTime: string) {
    if (type !== RecordType.HEIGHT_WEIGHT) return;

    const selectedDate = new Date(startTime);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (selectedDate > endOfToday) {
      throw new BadRequestException('测量日期不能晚于今天');
    }
  }

  private validateHeightWeightValues(
    type: RecordType,
    height: number | null | undefined,
    weight: number | null | undefined,
  ) {
    if (type === RecordType.HEIGHT_WEIGHT && height == null && weight == null) {
      throw new BadRequestException('身高和体重至少填写一项');
    }
  }

  private parseGrowthMetric(type: RecordType, metric?: string): GrowthMetric | undefined {
    if (!metric) return undefined;
    if (
      type !== RecordType.HEIGHT_WEIGHT ||
      (metric !== 'height' && metric !== 'weight')
    ) {
      throw new BadRequestException('metric 仅支持身高或体重明细查询');
    }
    return metric;
  }

  private getGrowthMetricWhere(metric?: GrowthMetric): FindOptionsWhere<Record> {
    if (metric === 'height') return { height: Not(IsNull()) };
    if (metric === 'weight') return { weight: Not(IsNull()) };
    return {};
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

    const [lastFeeding, lastSleep] = await Promise.all([
      this.recordRepository.findOne({ where: { babyId, type: RecordType.FEEDING }, order: { startTime: 'DESC' } }),
      this.recordRepository.findOne({ where: { babyId, type: RecordType.SLEEP }, order: { startTime: 'DESC' } }),
    ]);

    return {
      records,
      summary: {
        ...summary,
        lastFeedingAt: lastFeeding?.startTime || null,
        lastSleepAt: lastSleep?.startTime || null,
        lastSleepEndAt: lastSleep?.endTime || null,
      },
    };
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
    // 身高体重支持单独记录，最新身高/体重分别取各自最近一次测量的值
    const [latestHeightRecord, latestWeightRecord] = await Promise.all([
      this.recordRepository.findOne({
        where: { babyId, type: 'height_weight' as any, height: Not(IsNull()) },
        order: { startTime: 'DESC' },
      }),
      this.recordRepository.findOne({
        where: { babyId, type: 'height_weight' as any, weight: Not(IsNull()) },
        order: { startTime: 'DESC' },
      }),
    ]);

    const latestTemperature = await this.recordRepository.findOne({
      where: { babyId, type: 'temperature' as any },
      order: { startTime: 'DESC' },
    });

    // 带上区间前最后一次测量，供前端从区间首日开始补齐趋势值。
    const heightWeightBaseline = await this.recordRepository.findOne({
      where: {
        babyId,
        type: RecordType.HEIGHT_WEIGHT,
        startTime: LessThan(startDate),
      },
      order: { startTime: 'DESC' },
    });
    const heightWeightTrend = [
      ...(heightWeightBaseline ? [heightWeightBaseline] : []),
      ...records.filter((record) => record.type === RecordType.HEIGHT_WEIGHT),
    ]
      .map((record) => ({
        date: record.startTime,
        height: record.height == null ? null : Number(record.height),
        weight: record.weight == null ? null : Number(record.weight),
      }));
    const temperatureTrend = records
      .filter((record) => record.type === RecordType.TEMPERATURE && record.temperature != null)
      .map((record) => ({
        date: record.startTime,
        temperature: Number(record.temperature),
      }));

    return {
      dailyStats: Object.values(dailyStats),
      heightWeightTrend,
      temperatureTrend,
      latestHeightWeight:
        latestHeightRecord || latestWeightRecord
          ? {
              height: latestHeightRecord?.height ?? null,
              weight: latestWeightRecord?.weight ?? null,
              // 日期取身高/体重中较新那次测量的时间
              date:
                !latestWeightRecord ||
                (latestHeightRecord &&
                  latestHeightRecord.startTime >= latestWeightRecord.startTime)
                  ? latestHeightRecord!.startTime
                  : latestWeightRecord.startTime,
            }
          : null,
      latestTemperature: latestTemperature
        ? { temperature: latestTemperature.temperature, date: latestTemperature.startTime }
        : null,
    };
  }

  // 计算与上一条同类型记录的间隔分钟数。
  // 睡眠记录算的是"清醒间隔"：上一次睡醒到这一次入睡；喂奶/尿布算的是两次记录起始时间的间隔。
  private calcIntervalMinutes(
    type: RecordType,
    current: Record,
    previous: Record | null,
  ): number | null {
    if (!previous) return null;

    const currentStart = new Date(current.startTime).getTime();
    let previousAnchor = new Date(previous.startTime).getTime();

    if (type === RecordType.SLEEP && previous.duration) {
      previousAnchor += previous.duration * 60 * 1000;
    }

    // 按天维度计算间隔：锚点时间和当前记录不在同一天，就不计入间隔（不跨天）
    if (this.getLocalDateStr(new Date(previousAnchor)) !== this.getLocalDateStr(new Date(currentStart))) {
      return null;
    }

    const diffMs = currentStart - previousAnchor;
    if (diffMs < 0) return null;
    return Math.round(diffMs / 60000);
  }

  // 获取某一类型记录的明细（含与上一条的间隔）。
  // - 传 date：返回当天该类型的分页记录
  // - 传 days：返回最近 N 天（含今天）的分页记录
  async getRecordDetail(
    userId: string,
    babyId: string,
    type: RecordType,
    options: {
      date?: string;
      days?: number;
      page?: number;
      pageSize?: number;
      metric?: string;
    },
  ) {
    await this.babyService.findOne(babyId, userId);

    if (!DETAIL_SUPPORTED_TYPES.includes(type)) {
      throw new BadRequestException('该记录类型暂不支持明细查询');
    }
    const metric = this.parseGrowthMetric(type, options.metric);

    let startDate: Date;
    let endDate: Date;

    if (options.date) {
      startDate = new Date(options.date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(options.date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      const days = options.days || 7;
      const now = new Date();
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0, 0);
    }

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
    const where: FindOptionsWhere<Record> = {
      babyId,
      type,
      startTime: Between(startDate, endDate),
      ...this.getGrowthMetricWhere(metric),
    };
    const [records, total] = await this.recordRepository.findAndCount({
      where,
      order: { startTime: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 列表按倒序显示；计算间隔时转换回时间正序，并查找当前页最早记录的前一条。
    const chronologicalRecords = records.slice().reverse();
    const oldestRecord = chronologicalRecords[0];
    const previousRecord = await this.recordRepository.findOne({
      where: {
        babyId,
        type,
        startTime: LessThan(oldestRecord ? oldestRecord.startTime : startDate),
        ...this.getGrowthMetricWhere(metric),
      },
      order: { startTime: 'DESC' },
    });

    let prev: Record | null = previousRecord || null;
    const items = chronologicalRecords.map((record) => {
      const intervalMinutes = this.calcIntervalMinutes(type, record, prev);
      prev = record;
      return { ...record, intervalMinutes };
    }).reverse();

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  // 获取某一类型记录的全区间汇总。聚合及平均间隔均在数据库内完成，不传输全量记录。
  async getRecordDetailSummary(
    userId: string,
    babyId: string,
    type: RecordType,
    options: { date?: string; days?: number; metric?: string },
  ) {
    await this.babyService.findOne(babyId, userId);

    if (!DETAIL_SUPPORTED_TYPES.includes(type)) {
      throw new BadRequestException('该记录类型暂不支持明细查询');
    }
    const metric = this.parseGrowthMetric(type, options.metric);

    let startDate: Date;
    let endDate: Date;
    if (options.date) {
      startDate = new Date(options.date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(options.date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      const days = options.days || 7;
      const now = new Date();
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0, 0);
    }

    const where: FindOptionsWhere<Record> = {
      babyId,
      type,
      startTime: Between(startDate, endDate),
      ...this.getGrowthMetricWhere(metric),
    };
    const aggregate = this.recordRepository
      .createQueryBuilder('record')
      .select('COUNT(record.id)', 'count')
      .addSelect('COALESCE(SUM(record.amount), 0)', 'totalAmount')
      .addSelect('COALESCE(SUM(record.duration), 0)', 'totalDuration')
      .where('record.baby_id = :babyId', { babyId })
      .andWhere('record.type = :type', { type })
      .andWhere('record.start_time BETWEEN :startDate AND :endDate', { startDate, endDate });
    if (metric) {
      aggregate.andWhere(`record.${metric} IS NOT NULL`);
    }
    const aggregateResult = await aggregate.getRawOne();

    const summary: any = { count: Number(aggregateResult.count) };
    if (type === RecordType.FEEDING) {
      summary.totalAmount = Number(aggregateResult.totalAmount);
    } else if (type === RecordType.SLEEP) {
      summary.totalDuration = Number(aggregateResult.totalDuration);
    } else if (type === RecordType.HEIGHT_WEIGHT) {
      // 单指标查询只返回当前指标的最新值；未传 metric 时保持兼容，分别返回两项。
      const [latestHeight, latestWeight] = await Promise.all([
        metric === 'weight'
          ? Promise.resolve(null)
          : this.recordRepository.findOne({
              where: { ...where, height: Not(IsNull()) },
              order: { startTime: 'DESC' },
            }),
        metric === 'height'
          ? Promise.resolve(null)
          : this.recordRepository.findOne({
              where: { ...where, weight: Not(IsNull()) },
              order: { startTime: 'DESC' },
            }),
      ]);
      summary.latestHeight = latestHeight?.height ?? null;
      summary.latestWeight = latestWeight?.weight ?? null;
    } else if (type === RecordType.TEMPERATURE) {
      const latest = await this.recordRepository.findOne({ where, order: { startTime: 'DESC' } });
      if (latest) {
        summary.latestTemperature = latest.temperature ?? null;
      }
    }

    // 对每条记录关联其上一条同类型记录，仅由数据库返回平均值。
    // 睡眠按上次醒来时间计算；跨天或时间倒流的记录不纳入平均值，规则与列表一致。
    const metricSql = metric ? ` AND candidate.${metric} IS NOT NULL` : '';
    const currentMetricSql = metric ? ` AND current_record.${metric} IS NOT NULL` : '';
    const [intervalAggregate] = await this.recordRepository.query(
      `SELECT AVG(
        CASE
          WHEN previous_record.id IS NULL THEN NULL
          WHEN DATE(current_record.start_time) != DATE(
            CASE
              WHEN ? = 'sleep' AND previous_record.duration IS NOT NULL
                THEN DATE_ADD(previous_record.start_time, INTERVAL previous_record.duration MINUTE)
              ELSE previous_record.start_time
            END
          ) THEN NULL
          WHEN current_record.start_time <
            CASE
              WHEN ? = 'sleep' AND previous_record.duration IS NOT NULL
                THEN DATE_ADD(previous_record.start_time, INTERVAL previous_record.duration MINUTE)
              ELSE previous_record.start_time
            END THEN NULL
          ELSE ROUND(TIMESTAMPDIFF(
            SECOND,
            CASE
              WHEN ? = 'sleep' AND previous_record.duration IS NOT NULL
                THEN DATE_ADD(previous_record.start_time, INTERVAL previous_record.duration MINUTE)
              ELSE previous_record.start_time
            END,
            current_record.start_time
          ) / 60)
        END
      ) AS avgIntervalMinutes
      FROM records current_record
      LEFT JOIN records previous_record ON previous_record.id = (
        SELECT candidate.id
        FROM records candidate
        WHERE candidate.baby_id = current_record.baby_id
          AND candidate.type = current_record.type
          AND candidate.start_time < current_record.start_time
          ${metricSql}
        ORDER BY candidate.start_time DESC
        LIMIT 1
      )
      WHERE current_record.baby_id = ?
        AND current_record.type = ?
        AND current_record.start_time BETWEEN ? AND ?
        ${currentMetricSql}`,
      [type, type, type, babyId, type, startDate, endDate],
    );
    summary.avgIntervalMinutes = intervalAggregate.avgIntervalMinutes == null
      ? null
      : Math.round(Number(intervalAggregate.avgIntervalMinutes));

    return summary;
  }
}
