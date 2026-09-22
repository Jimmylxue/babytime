import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateLimitService } from '../../common/rate-limit.service';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord, RecordType } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { VaccinePlan } from './entities/vaccine-plan.entity';
import { TIMELINE_VACCINE_SCHEDULE } from '@baby-time/shared';
import { getVaccineTemplateId, getReviewTemplateId, dueDate, formatLocalDate } from './notification.helpers';

/**
 * 疫苗计划与订阅授权（用户侧业务）：
 * 计划查询/设置/重置、订阅授权入账、个人提醒状态。
 * 发送编排见 VaccineReminderService，微信 API 见 WechatSubscribeService。
 */
@Injectable()
export class VaccinePlanService {
  constructor(
    @InjectRepository(Baby) private readonly babies: Repository<Baby>,
    @InjectRepository(BabyRecord) private readonly records: Repository<BabyRecord>,
    @InjectRepository(SubscriptionGrant) private readonly grants: Repository<SubscriptionGrant>,
    @InjectRepository(FamilyMember) private readonly familyMembers: Repository<FamilyMember>,
    @InjectRepository(VaccinePlan) private readonly vaccinePlans: Repository<VaccinePlan>,
    private readonly rateLimit: RateLimitService,
  ) {}

  getConfig() {
    return {
      vaccineTemplateId: getVaccineTemplateId(),
      reviewTemplateId: getReviewTemplateId(),
      vaccineEnabled: Boolean(getVaccineTemplateId() && process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
      reviewEnabled: Boolean(getReviewTemplateId() && process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
    };
  }

  async saveGrants(userId: string, statuses: Record<string, string>) {
    // 授权结果只有客户端知道（微信没有服务端回调），所以这里是"客户端自报"的信任边界。
    // 刷出来的次数在真发送时会被微信 43101 打回并清零，伤不到用户，
    // 但会把后台订阅漏斗的口径灌脏 —— 所以按人按天给一个正常用不到的上限。
    this.rateLimit.assert('subscription-grant', userId);
    const allowed = new Set([getVaccineTemplateId(), process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID || ''].filter(Boolean));
    for (const [templateId, status] of Object.entries(statuses || {})) {
      if (!allowed.has(templateId) || !['accept', 'reject'].includes(status)) continue;
      let grant = await this.grants.findOne({ where: { userId, templateId } });
      if (!grant) grant = this.grants.create({ userId, templateId, status, availableCount: 0, acceptedCount: 0, rejectedCount: 0, sentCount: 0 });
      if (status === 'accept') {
        grant.availableCount += 1;
        grant.acceptedCount += 1;
        grant.status = 'accept';
        grant.grantedAt = new Date();
      } else {
        grant.rejectedCount += 1;
        grant.status = grant.availableCount > 0 ? 'accept' : 'reject';
      }
      await this.grants.save(grant);
    }
    return { success: true };
  }

  async getUserVaccineStatus(userId: string, kind: 'vaccine' | 'review' = 'vaccine') {
    const templateId = kind === 'review' ? getReviewTemplateId() : getVaccineTemplateId();
    if (!templateId) return { configured: false, state: 'never', availableCount: 0, acceptedCount: 0, sentCount: 0 };
    const grant = await this.grants.findOne({ where: { userId, templateId } });
    const acceptedCount = Number(grant?.acceptedCount || 0);
    const availableCount = Number(grant?.availableCount || 0);
    return {
      configured: true,
      state: availableCount > 0 ? 'active' : acceptedCount > 0 ? 'exhausted' : 'never',
      availableCount,
      acceptedCount,
      sentCount: Number(grant?.sentCount || 0),
    };
  }

  private async getAccessibleBaby(userId: string, babyId: string) {
    const baby = await this.babies.findOne({ where: { id: babyId } });
    if (!baby) throw new NotFoundException('宝贝不存在');
    if (baby.userId === userId) return baby;
    const member = await this.familyMembers.findOne({
      where: { userId, babyId, status: InviteStatus.ACCEPTED },
    });
    if (!member) throw new ForbiddenException('无权访问该宝宝');
    return baby;
  }

  async getVaccinePlans(userId: string, babyId: string) {
    const baby = await this.getAccessibleBaby(userId, babyId);
    const plans = await this.vaccinePlans.find({ where: { babyId } });
    const records = await this.records.find({ where: { babyId, type: RecordType.VACCINE } });
    const planByItem = new Map(plans.map((plan) => [plan.scheduleItemId, plan]));
    const recordByItem = new Map(
      records.filter((record) => record.vaccineScheduleItemId).map((record) => [record.vaccineScheduleItemId, record]),
    );
    // 疫苗计划表来自 @baby-time/shared（唯一数据源）。
    // ⚠️ 节点 ID 被 vaccine_plans / records 引用，调整月龄可以，改 ID 会让用户已有数据失联。
    return TIMELINE_VACCINE_SCHEDULE.map(({ id: scheduleItemId, ageMonths: months, displayName: label }) => {
      const referenceDate = formatLocalDate(dueDate(baby.birthday, months));
      const plan = planByItem.get(scheduleItemId);
      const record = recordByItem.get(scheduleItemId);
      return {
        scheduleItemId,
        label,
        referenceDate,
        scheduledDate: plan?.scheduledDate || null,
        effectiveDate: plan?.scheduledDate || referenceDate,
        completed: Boolean(record),
        actualDate: record ? formatLocalDate(new Date(record.startTime)) : null,
      };
    });
  }

  async setVaccinePlan(userId: string, babyId: string, scheduleItemId: string, scheduledDate: string) {
    await this.getAccessibleBaby(userId, babyId);
    if (!TIMELINE_VACCINE_SCHEDULE.some((item) => item.id === scheduleItemId)) {
      throw new BadRequestException('无效的疫苗计划节点');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      throw new BadRequestException('接种日期格式不正确');
    }
    const parsedDate = new Date(`${scheduledDate}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime()) || formatLocalDate(parsedDate) !== scheduledDate) {
      throw new BadRequestException('接种日期无效');
    }
    const today = formatLocalDate(new Date());
    if (scheduledDate < today) throw new BadRequestException('计划接种日不能早于今天');

    let plan = await this.vaccinePlans.findOne({ where: { babyId, scheduleItemId } });
    if (!plan) plan = this.vaccinePlans.create({ babyId, scheduleItemId });
    plan.scheduledDate = scheduledDate;
    plan.updatedBy = userId;
    const saved = await this.vaccinePlans.save(plan);
    return { scheduleItemId, scheduledDate: saved.scheduledDate };
  }

  async removeVaccinePlan(userId: string, babyId: string, scheduleItemId: string) {
    await this.getAccessibleBaby(userId, babyId);
    if (!TIMELINE_VACCINE_SCHEDULE.some((item) => item.id === scheduleItemId)) {
      throw new BadRequestException('无效的疫苗计划节点');
    }
    await this.vaccinePlans.delete({ babyId, scheduleItemId });
    return { scheduleItemId, scheduledDate: null };
  }
}
