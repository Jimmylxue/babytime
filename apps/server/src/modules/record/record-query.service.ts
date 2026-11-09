import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  LessThan,
  MoreThan,
  Not,
  IsNull,
  In,
  FindOptionsWhere,
} from 'typeorm';
import { Record, RecordType } from './entities/record.entity';
import { BabyService } from '../baby/baby.service';
import { buildXlsx } from '../../common/xlsx';

// 支持"明细+间隔"展示的记录类型
// 导出时间范围上限（天）：活跃用户日均十几条，一个月约 300~500 行，
// 一年则是 5000+ 行、几 MB 响应体，弱网必失败。限在一个月，稳定且语义清晰。
const EXPORT_MAX_DAYS = 31;
// 最后一道防线：31 天内也可能有极高频记录（如每 10 分钟记一次体温）
const MAX_EXPORT_ROWS = 3000;

const DETAIL_SUPPORTED_TYPES = [
  RecordType.FEEDING,
  RecordType.DIAPER,
  RecordType.SLEEP,
  RecordType.FOOD,
  RecordType.WATER,
  RecordType.TEMPERATURE,
  RecordType.HEIGHT_WEIGHT,
  RecordType.MEDICINE,
  RecordType.VACCINE,
  RecordType.BATH,
  RecordType.OUTDOOR,
];

type GrowthMetric = 'height' | 'weight';

/**
 * 统计与明细查询侧（读多算重的部分）：今日汇总、N 天统计、明细分页、区间聚合。
 * 增删改在 RecordService；RecordService 继续代理这里的方法，控制器接线不变。
 */
@Injectable()
export class RecordQueryService {
  constructor(
    @InjectRepository(Record)
    private recordRepository: Repository<Record>,
    private babyService: BabyService,
  ) {}

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
      // 首页「今日时间线」直接按这个数组顺序渲染，必须由服务端给出时间正序，
      // 不能靠 MySQL 的默认返回顺序（不保证按主键或时间）
      order: { startTime: 'ASC' },
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

    // 最后一条喂奶/睡眠 + 最近一次身高/体重/体温 + 「是否从未记录过」：全是
    // (babyId,type,start_time) 索引上的 ORDER BY start_time DESC LIMIT 1 / EXISTS，
    // 八条并成一个 Promise.all，不多一次往返。
    // 后三条原本由首页单独打 /record/stats 才拿到（见 getStats 注释），并进这里后首页只需两个请求。
    // hasAnyRecord 给首页的新手引导用：summary 只统计「今天」，全为 0 可能是今天还没记，
    // 也可能是从没记过，两者要给的引导完全不同，所以单独探一次全表是否存在。
    const [
      lastFeeding,
      lastSleep,
      lastDiaper,
      lastMedicine,
      latestHeightRecord,
      latestWeightRecord,
      latestTempRecord,
      hasAnyRecord,
      feedingRhythm,
      streak,
    ] = await Promise.all([
      this.recordRepository.findOne({ where: { babyId, type: RecordType.FEEDING }, order: { startTime: 'DESC' } }),
      this.recordRepository.findOne({ where: { babyId, type: RecordType.SLEEP }, order: { startTime: 'DESC' } }),
      this.recordRepository.findOne({ where: { babyId, type: RecordType.DIAPER }, order: { startTime: 'DESC' } }),
      this.recordRepository.findOne({ where: { babyId, type: RecordType.MEDICINE }, order: { startTime: 'DESC' } }),
      this.recordRepository.findOne({
        where: { babyId, type: RecordType.HEIGHT_WEIGHT, height: Not(IsNull()) },
        order: { startTime: 'DESC' },
      }),
      this.recordRepository.findOne({
        where: { babyId, type: RecordType.HEIGHT_WEIGHT, weight: Not(IsNull()) },
        order: { startTime: 'DESC' },
      }),
      this.recordRepository.findOne({
        where: { babyId, type: RecordType.TEMPERATURE },
        order: { startTime: 'DESC' },
      }),
      // exist() 走 SELECT 1 ... LIMIT 1，命中 idx_records_baby_type_start_time 的最左前缀
      this.recordRepository.exist({ where: { babyId } }),
      this.getFeedingRhythm(babyId),
      // 连续记录天数：首页「宝宝卡」上的小徽章用；只查 DISTINCT 日期，不拉实体
      this.getRecordStreak(babyId),
    ]);

    return {
      records,
      summary: {
        ...summary,
        lastFeedingAt: lastFeeding?.startTime || null,
        lastFeedingAmount: lastFeeding?.amount ?? null,
        lastSleepAt: lastSleep?.startTime || null,
        lastSleepEndAt: lastSleep?.endTime || null,
        lastDiaperAt: lastDiaper?.startTime || null,
        lastMedicineAt: lastMedicine?.startTime || null,
        lastMedicineName: lastMedicine?.medicineName ?? null,
        lastMedicineDose: lastMedicine?.medicineDose ?? null,
      },
      // 该宝宝是否一条记录都没有。首页据此区分「今天还没记」和「从没记过」
      hasAnyRecord,
      // 首页「现在」卡据此预测下一顿；样本不足时 intervalMinutes 为 null，前端不展示预测
      rhythm: feedingRhythm,
      // 连续记录天数（current/longest/totalDays/lastRecordDate）
      streak,
      // 与 getStats 的同名字段同一形状、同一算法，两处共用 toLatestHeightWeight
      latestHeightWeight: this.toLatestHeightWeight(latestHeightRecord, latestWeightRecord),
      latestTemperature: latestTempRecord
        ? { temperature: latestTempRecord.temperature, date: latestTempRecord.startTime }
        : null,
    };
  }

  /**
   * 连续记录天数（streak）。
   *
   * 口径：只取「不同日期」，任一类型记过就算这天有记录（跟周报里的 activeDays 一致）。
   * 当前连续 = 从今天往前数，今天还没记也不算断（当天还没结束），所以起点优先取今天、否则取昨天。
   * 最长连续 = 历史全部日期的最大连续段。
   *
   * 只查 DISTINCT DATE(start_time)，不拉实体：三年重度用户也就千行以内的日期字符串。
   * 不给这个查询加索引 —— `idx_records_baby_type_start_time` 的最左前缀 baby_id 已经能把它限制在
   * 单个宝宝范围内，再为 DISTINCT 表达式单独建函数索引不值得。
   */
  private async getRecordStreak(babyId: string) {
    const rows: Array<{ d: string }> = await this.recordRepository.query(
      `SELECT DISTINCT DATE_FORMAT(start_time, '%Y-%m-%d') AS d
       FROM records
       WHERE baby_id = ?
       ORDER BY d DESC
       LIMIT 2000`,
      [babyId],
    );

    const days = rows.map((row) => row.d).filter(Boolean);
    if (days.length === 0) {
      return { current: 0, longest: 0, totalDays: 0, lastRecordDate: null as string | null };
    }

    const set = new Set(days);
    const shift = (dateStr: string, delta: number) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + delta);
      return this.getLocalDateStr(date);
    };

    // 当前连续：今天算起点，今天没记就从昨天起算（当天未结束，不算断签）
    const today = this.getLocalDateStr(new Date());
    let cursor = set.has(today) ? today : shift(today, -1);
    let current = 0;
    while (set.has(cursor)) {
      current++;
      cursor = shift(cursor, -1);
    }

    // 最长连续：days 已是倒序，正序遍历一次即可
    const ascending = [...days].sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < ascending.length; i++) {
      if (shift(ascending[i - 1], 1) === ascending[i]) {
        run++;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
    }

    return {
      current,
      longest,
      totalDays: days.length,
      lastRecordDate: days[0],
    };
  }

  /**
   * 近 7 天喂奶节奏：相邻两顿起始时间的间隔取中位数。
   * 用中位数而不是平均，是因为漏记一顿会拉出一个超长间隔，平均值会被带偏。
   * 20 分钟内的重复记录不算新的一顿；超过 8 小时的多半是隔夜/漏记，不计入。
   * 样本不足 3 个间隔时返回 null，前端不展示「预计下次」。
   */
  private async getFeedingRhythm(babyId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const feedings = await this.recordRepository.find({
      where: { babyId, type: RecordType.FEEDING, startTime: MoreThan(since) },
      select: ['startTime'],
      order: { startTime: 'ASC' },
    });

    const gaps: number[] = [];
    for (let i = 1; i < feedings.length; i++) {
      const gap =
        (new Date(feedings[i].startTime).getTime() -
          new Date(feedings[i - 1].startTime).getTime()) /
        60000;
      if (gap >= 20 && gap <= 8 * 60) gaps.push(gap);
    }
    if (gaps.length < 3) {
      return { intervalMinutes: null, sampleCount: gaps.length };
    }

    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    const median =
      gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
    return { intervalMinutes: Math.round(median), sampleCount: gaps.length };
  }

  /**
   * 身高体重全量历史（统计页的 WHO 成长曲线与英雄卡用）。
   * 这里原本打的是 `getStats(babyId, 1100)`：为了 `heightWeightTrend` 一个字段，
   * 服务端把三年内**所有类型**的记录捞进内存、构造 1100 个 dailyStats 对象（绝大多数全 0）再序列化回去。
   * 现在只查 height/weight 一种、只取三个列。
   */
  /**
   * 健康分析数据：体温与排便的原始记录。
   *
   * 为什么放在一个接口里返回两样：这两个分析经常一起看（发烧往往伴随排便异常），
   * 分两个接口就是两次往返、两个 loading 态。数据量都小（各几十条），合并更划算。
   *
   * 只返回原始点，聚合逻辑在 packages/shared（feverEpisode / stoolPattern）——
   * 前端算、纯函数、可单测，且以后后台要看同样的口径可以直接复用。
   */
  async getHealthPoints(userId: string, babyId: string, days = 30) {
    await this.babyService.findOne(babyId, userId);

    const safeDays = Math.min(365, Math.max(1, days));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - safeDays + 1);

    const records = await this.recordRepository.find({
      where: {
        babyId,
        type: In([RecordType.TEMPERATURE, RecordType.DIAPER]),
        startTime: MoreThan(since),
      },
      select: ['type', 'startTime', 'temperature', 'diaperStatus'],
      order: { startTime: 'ASC' },
    });

    return {
      temperatures: records
        .filter((r) => r.type === RecordType.TEMPERATURE && r.temperature != null)
        .map((r) => ({
          at: r.startTime,
          temperature: Number(r.temperature),
        })),
      diapers: records
        .filter((r) => r.type === RecordType.DIAPER)
        .map((r) => ({
          at: r.startTime,
          status: r.diaperStatus,
        })),
      days: safeDays,
    };
  }

  async getGrowthTrend(userId: string, babyId: string) {
    await this.babyService.findOne(babyId, userId);

    const records = await this.recordRepository.find({
      where: { babyId, type: RecordType.HEIGHT_WEIGHT },
      select: ['startTime', 'height', 'weight'],
      order: { startTime: 'ASC' },
    });

    // 身高体重允许只填一项，两项都空的脏行没有可画的点
    return records
      .filter((record) => record.height != null || record.weight != null)
      .map((record) => ({
        date: record.startTime,
        height: record.height == null ? null : Number(record.height),
        weight: record.weight == null ? null : Number(record.weight),
      }));
  }

  /**
   * 最新一次身高/体重：两项各自回看最近一次非空测量（支持只记身高或只记体重），
   * 日期取两者中较新的那次。`getStats` 与 `getTodaySummary` 共用 ——
   * 前端只有一份读取逻辑，两处形状必须完全一致。
   */
  private toLatestHeightWeight(heightRecord: Record | null, weightRecord: Record | null) {
    if (!heightRecord && !weightRecord) return null;
    // 只测了一项时取那一项的时间（上面的早退保证了两边至少一个非空）
    const latest =
      heightRecord && weightRecord
        ? heightRecord.startTime >= weightRecord.startTime
          ? heightRecord
          : weightRecord
        : heightRecord || weightRecord;
    return {
      height: heightRecord?.height ?? null,
      weight: weightRecord?.weight ?? null,
      date: latest!.startTime,
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
        bathCount: 0,
        outdoorCount: 0,
        temperatureCount: 0,
        heightWeightCount: 0,
        medicineCount: 0,
        vaccineCount: 0,
        otherCount: 0,
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
          case 'bath':
            dailyStats[dateKey].bathCount++;
            break;
          case 'outdoor':
            dailyStats[dateKey].outdoorCount++;
            break;
          case 'temperature':
            dailyStats[dateKey].temperatureCount++;
            break;
          case 'height_weight':
            dailyStats[dateKey].heightWeightCount++;
            break;
          case 'medicine':
            dailyStats[dateKey].medicineCount++;
            break;
          case 'vaccine':
            dailyStats[dateKey].vaccineCount++;
            break;
          case 'other':
            dailyStats[dateKey].otherCount++;
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
      latestHeightWeight: this.toLatestHeightWeight(latestHeightRecord, latestWeightRecord),
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

  // 获取某一类型记录的明细（含与上一条的间隔）。
  // - 传 date：返回当天该类型的分页记录
  // - 传 days：返回最近 N 天（含今天）的分页记录
  /**
   * 导出记录为 Excel（.xlsx），base64 编码返回。
   *
   * 为什么返回 base64 而不是文件流：小程序 `downloadFile` 需要把域名加进
   * downloadFile 白名单，且 JWT 只能从 header 带 —— 多一层配置和多一个失败点。
   * base64 走普通 JSON 接口，小程序 writeFileSync 带 encoding:'base64' 即可落文件。
   *
   * 为什么是 xlsx 不是 csv：微信 `wx.openDocument` 的 fileType 白名单只有
   * doc/docx/xls/xlsx/ppt/pptx/pdf，没有 csv —— CSV 写出来也打不开。
   *
   * 时间范围：**用户自己选，最长 31 天**（EXPORT_MAX_DAYS）。
   *
   * 为什么必须限长：活跃用户日均记十几条（见 todo.md 的数据诊断），
   * 一年就是 5000+ 条，base64 后响应体到几 MB —— 弱网下必然超时，
   * 而且用户根本不知道自己导的是哪一段。限制在一个月内，
   * 单次通常几百行、几十 KB，稳定且语义清晰（「导出这个月」）。
   *
   * 超出 31 天直接拒绝（BadRequest），**不再静默截断** ——
   * 截断等于悄悄少给数据，用户拿去分析会得出错误结论。
   * MAX_EXPORT_ROWS 仅作为最后一道防线（一个月内也可能有极高频记录）。
   */
  async exportRecordsExcel(
    userId: string,
    babyId: string,
    options: { startDate?: string; endDate?: string },
  ) {
    await this.babyService.findOne(babyId, userId);

    const { startDate, endDate } = this.parseExportRange(options);

    const records = await this.recordRepository.find({
      where: { babyId, startTime: Between(startDate, endDate) },
      order: { startTime: 'ASC' },
      take: MAX_EXPORT_ROWS,
    });

    const header = [
      '日期',
      '时间',
      '类型',
      '主要信息',
      '奶量ml',
      '时长分钟',
      '体温',
      '身高cm',
      '体重kg',
      '备注',
      '记录人',
    ];

    // 注意：本文件的 `Record` 是实体类型，会遮蔽 TS 内置泛型 Record<K,V>，
    // 所以这里用 Map 而不是 Record<string, string>（与文件里其它地方的处理一致）
    const typeLabels = new Map<string, string>([
      ['feeding', '喂奶'],
      ['diaper', '尿布'],
      ['sleep', '睡觉'],
      ['food', '辅食'],
      ['water', '喝水'],
      ['temperature', '体温'],
      ['height_weight', '身高体重'],
      ['medicine', '用药'],
      ['vaccine', '疫苗'],
      ['bath', '洗澡'],
      ['outdoor', '户外活动'],
      ['other', '其他'],
    ]);

    const rows = records.map((record) => {
      const date = this.getLocalDateStr(new Date(record.startTime));
      const hh = String(new Date(record.startTime).getHours()).padStart(2, '0');
      const mm = String(new Date(record.startTime).getMinutes()).padStart(2, '0');
      return [
        date,
        `${hh}:${mm}`,
        typeLabels.get(record.type) || record.type,
        this.recordMainText(record),
        record.amount ?? '',
        record.duration ?? '',
        record.temperature ?? '',
        record.height ?? '',
        record.weight ?? '',
        record.note ?? '',
        record.actorUserId ? '家人' : '',
      ];
    });

    const truncated = records.length >= MAX_EXPORT_ROWS;

    // 生成真 .xlsx（zip + OOXML，见 common/xlsx.ts）。
    // 顺带解决中文编码问题：xlsx 是 XML，天然 UTF-8，不需要 BOM 那套。
    const buffer = buildXlsx([header, ...rows], { sheetName: '宝宝记录' });
    return {
      filename: `宝宝记录_${this.getLocalDateStr(startDate)}_${this.getLocalDateStr(endDate)}.xlsx`,
      // base64 而不是二进制流：与项目其它接口保持 JSON 一致，
      // 小程序端 writeFileSync 带 encoding:'base64' 即可落文件
      content: buffer.toString('base64'),
      encoding: 'base64' as const,
      total: records.length,
      truncated,
      note: truncated
        ? `记录较多，仅导出最近 ${MAX_EXPORT_ROWS} 条，可缩小时间范围重试`
        : `导出区间 ${this.getLocalDateStr(startDate)} ~ ${this.getLocalDateStr(endDate)}`,
    };
  }

  /**
   * 解析并校验导出区间。
   *
   * - 两个都不传：默认「最近 31 天」（含今天）
   * - 传了就用传的，但必须 start <= end 且跨度 <= EXPORT_MAX_DAYS
   * - 不允许未来日期（end 会被夹到今天）
   *
   * 所有边界都按**本地日历日**算，与统计页/周报口径一致。
   */
  private parseExportRange(options: { startDate?: string; endDate?: string }): {
    startDate: Date;
    endDate: Date;
  } {
    const todayStr = this.getLocalDateStr(new Date());
    const isValidDate = (value?: string) =>
      !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());

    // 只给了一头：另一头按 31 天补全，避免前端漏传导致语义不明
    let endStr = isValidDate(options.endDate) ? options.endDate! : todayStr;
    // 不允许导出未来
    if (endStr > todayStr) endStr = todayStr;

    let startStr: string;
    if (isValidDate(options.startDate)) {
      startStr = options.startDate!;
    } else {
      const end = new Date(`${endStr}T12:00:00`);
      end.setDate(end.getDate() - (EXPORT_MAX_DAYS - 1));
      startStr = this.getLocalDateStr(end);
    }

    if (startStr > endStr) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }
    // 天数按「含首含尾」算：同一天 = 1 天
    const spanDays =
      Math.round(
        (new Date(`${endStr}T12:00:00`).getTime() -
          new Date(`${startStr}T12:00:00`).getTime()) /
          86400000,
      ) + 1;
    if (spanDays > EXPORT_MAX_DAYS) {
      throw new BadRequestException(
        `导出范围最多 ${EXPORT_MAX_DAYS} 天，当前选择了 ${spanDays} 天，请缩小范围`,
      );
    }

    const startDate = new Date(`${startStr}T00:00:00`);
    const endDate = new Date(`${endStr}T23:59:59.999`);
    return { startDate, endDate };
  }

  /** 每条记录的一句话说明，与客户端 getRecordMainText 保持同一口径 */
  private recordMainText(record: Record): string {
    switch (record.type) {
      case RecordType.FEEDING: {
        if (record.feedingMethod === 'mixed') {
          return `混合 母乳${record.breastAmount || 0}ml+奶粉${record.formulaAmount || 0}ml`;
        }
        const method =
          record.feedingMethod === 'breast'
            ? '母乳'
            : record.feedingMethod === 'formula'
              ? '奶粉'
              : '';
        return `${method}${record.amount ? ` ${record.amount}ml` : ''}`.trim();
      }
      case RecordType.DIAPER: {
        const map = new Map<string, string>([
          ['wet', '尿了'],
          ['dirty', '拉了'],
          ['both', '都有'],
        ]);
        return map.get(record.diaperStatus) || '';
      }
      case RecordType.SLEEP:
        return record.duration ? `睡了 ${record.duration} 分钟` : '睡眠';
      case RecordType.FOOD:
        return record.foodName || '';
      case RecordType.WATER:
        return record.amount ? `${record.amount}ml` : '';
      case RecordType.TEMPERATURE:
        return record.temperature != null ? `${record.temperature}°C` : '';
      case RecordType.HEIGHT_WEIGHT: {
        const parts: string[] = [];
        if (record.height != null) parts.push(`${record.height}cm`);
        if (record.weight != null) parts.push(`${record.weight}kg`);
        return parts.join(' / ');
      }
      case RecordType.MEDICINE:
        return [record.medicineName, record.medicineDose].filter(Boolean).join(' ');
      case RecordType.VACCINE:
        return `${record.vaccineName || '疫苗'}${record.vaccineDose ? ` 第${record.vaccineDose}剂` : ''}`;
      case RecordType.BATH:
        return '洗澡';
      case RecordType.OUTDOOR:
        return [record.outdoorLocation, record.duration ? `${record.duration}分钟` : '']
          .filter(Boolean)
          .join(' ');
      default:
        return '';
    }
  }

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
    if (type === RecordType.FEEDING || type === RecordType.WATER) {
      summary.totalAmount = Number(aggregateResult.totalAmount);
    } else if (type === RecordType.SLEEP) {
      summary.totalDuration = Number(aggregateResult.totalDuration);
    } else if (type === RecordType.OUTDOOR) {
      // 户外活动也记时长（OutdoorForm 的「活动时长」写进 duration），
      // 统计页补上 outdoor tab 后要能显示「今天户外多久」
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
