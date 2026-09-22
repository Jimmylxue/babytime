import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Record, RecordType } from './entities/record.entity';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { BabyService } from '../baby/baby.service';
import { ContentSecurityService } from '../content-security/content-security.service';
import { CdnCleanupService } from '../upload/cdn-cleanup.service';
import { RecordQueryService } from './record-query.service';

/**
 * 记录增删改（写路径）。统计/明细查询在 RecordQueryService，这里代理转发，
 * 控制器注入点保持单一 RecordService 不变。
 */
@Injectable()
export class RecordService {
  constructor(
    @InjectRepository(Record)
    private recordRepository: Repository<Record>,
    private babyService: BabyService,
    private contentSecurity: ContentSecurityService,
    private queryService: RecordQueryService,
    private cleanup: CdnCleanupService,
  ) {}

  // 记录里允许用户自由填写的文本字段，创建/更新时统一过内容安全检测
  private recordTextFields(dto: CreateRecordDto | UpdateRecordDto) {
    return [
      dto.note,
      dto.foodName,
      dto.medicineName,
      dto.medicineDose,
      dto.vaccineName,
      dto.vaccineHospital,
      dto.outdoorLocation,
    ];
  }

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

    await this.contentSecurity.checkUserTexts(userId, this.recordTextFields(createRecordDto));

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
    // 换尿布记录可以配图，删记录时图也要一起走
    this.cleanup.scheduleDelete([record.diaperImage]);
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

    // Object.assign 之后拿不到旧图，先存一份用于清理
    const previousDiaperImage = record.diaperImage;
    Object.assign(record, updateRecordDto);
    await this.contentSecurity.checkUserTexts(userId, this.recordTextFields(updateRecordDto));
    const saved = await this.recordRepository.save(record);
    if (saved.diaperImage !== previousDiaperImage) {
      this.cleanup.scheduleDelete([previousDiaperImage]);
    }
    return saved;
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

  // ── 查询代理：实现见 RecordQueryService ──

  getTodaySummary(userId: string, babyId: string) {
    return this.queryService.getTodaySummary(userId, babyId);
  }

  getStats(userId: string, babyId: string, days = 7) {
    return this.queryService.getStats(userId, babyId, days);
  }

  getRecordDetail(
    userId: string,
    babyId: string,
    type: RecordType,
    options: { date?: string; days?: number; page?: number; pageSize?: number; metric?: string },
  ) {
    return this.queryService.getRecordDetail(userId, babyId, type, options);
  }

  getRecordDetailSummary(
    userId: string,
    babyId: string,
    type: RecordType,
    options: { date?: string; days?: number; metric?: string },
  ) {
    return this.queryService.getRecordDetailSummary(userId, babyId, type, options);
  }
}
