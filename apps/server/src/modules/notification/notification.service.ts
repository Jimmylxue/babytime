import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { User } from '../user/entities/user.entity';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord, RecordType } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { VaccinePlan } from './entities/vaccine-plan.entity';

// 与客户端 vaccineSchedule.ts 保持节点 ID 和月龄一致；地区接种安排仍以门诊为准。
const VACCINES = [
  ['hepb-1', 0, '乙肝疫苗 第1剂'], ['bcg-1', 0, '卡介苗'], ['hepb-2', 1, '乙肝疫苗 第2剂'],
  ['ipv-1', 2, '脊灰疫苗 第1剂'], ['ipv-2', 3, '脊灰疫苗 第2剂'], ['dtap-1', 3, '百白破疫苗 第1剂'],
  ['bopv-1', 4, '脊灰疫苗 第3剂'], ['dtap-2', 4, '百白破疫苗 第2剂'], ['dtap-3', 5, '百白破疫苗 第3剂'],
  ['hepb-3', 6, '乙肝疫苗 第3剂'], ['men-a-1', 6, 'A群流脑疫苗 第1剂'], ['mr-1', 8, '麻疹风疹联合疫苗 第1剂'],
  ['je-1', 8, '乙脑疫苗 第1剂'], ['men-a-2', 9, 'A群流脑疫苗 第2剂'], ['dtap-4', 18, '百白破疫苗 第4剂'],
  ['mmr-1', 18, '麻腮风疫苗 第1剂'], ['hepa-1', 18, '甲肝疫苗'], ['je-2', 24, '乙脑疫苗 后续剂次'],
  ['men-ac-1', 36, 'A+C群流脑疫苗 第1剂'], ['bopv-2', 48, '脊灰疫苗 第4剂'], ['dt-1', 72, '白破疫苗'], ['men-ac-2', 72, 'A+C群流脑疫苗 第2剂'],
] as const;

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private accessToken: { value: string; expiresAt: number } | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly http: HttpService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Baby) private readonly babies: Repository<Baby>,
    @InjectRepository(BabyRecord) private readonly records: Repository<BabyRecord>,
    @InjectRepository(SubscriptionGrant) private readonly grants: Repository<SubscriptionGrant>,
    @InjectRepository(NotificationDelivery) private readonly deliveries: Repository<NotificationDelivery>,
    @InjectRepository(FamilyMember) private readonly familyMembers: Repository<FamilyMember>,
    @InjectRepository(VaccinePlan) private readonly vaccinePlans: Repository<VaccinePlan>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    // 半小时检查一次，实际发送由配置的本地小时控制，发送表负责幂等。
    if (this.getVaccineTemplateId() || this.getReviewTemplateId()) {
      this.timer = setInterval(() => this.runScheduled().catch((e) => this.logger.error(e)), 30 * 60 * 1000);
      void this.runScheduled();
    }
  }

  private async runScheduled() {
    const hour = new Date().getHours();
    if (hour === Number(process.env.VACCINE_REMINDER_HOUR || 9)) await this.sendDueVaccines();
    if (hour === Number(process.env.DAILY_REVIEW_HOUR || 20)) await this.sendDailyReviews();
  }

  getConfig() {
    return {
      vaccineTemplateId: this.getVaccineTemplateId(),
      reviewTemplateId: this.getReviewTemplateId(),
      vaccineEnabled: Boolean(this.getVaccineTemplateId() && process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
      reviewEnabled: Boolean(this.getReviewTemplateId() && process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
    };
  }

  async saveGrants(userId: string, statuses: Record<string, string>) {
    const allowed = new Set([this.getVaccineTemplateId(), process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID || ''].filter(Boolean));
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

  private getVaccineTemplateId() { return process.env.WECHAT_SUBSCRIBE_VACCINE_TEMPLATE_ID || ''; }
  private getReviewTemplateId() { return process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID || ''; }

  async getUserVaccineStatus(userId: string) {
    const templateId = this.getVaccineTemplateId();
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
    return VACCINES.map(([scheduleItemId, months, label]) => {
      const referenceDate = this.formatLocalDate(this.dueDate(baby.birthday, months));
      const plan = planByItem.get(scheduleItemId);
      const record = recordByItem.get(scheduleItemId);
      return {
        scheduleItemId,
        label,
        referenceDate,
        scheduledDate: plan?.scheduledDate || null,
        effectiveDate: plan?.scheduledDate || referenceDate,
        completed: Boolean(record),
        actualDate: record ? this.formatLocalDate(new Date(record.startTime)) : null,
      };
    });
  }

  async setVaccinePlan(userId: string, babyId: string, scheduleItemId: string, scheduledDate: string) {
    await this.getAccessibleBaby(userId, babyId);
    if (!VACCINES.some(([itemId]) => itemId === scheduleItemId)) {
      throw new BadRequestException('无效的疫苗计划节点');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      throw new BadRequestException('接种日期格式不正确');
    }
    const parsedDate = new Date(`${scheduledDate}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime()) || this.formatLocalDate(parsedDate) !== scheduledDate) {
      throw new BadRequestException('接种日期无效');
    }
    const today = this.formatLocalDate(new Date());
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
    if (!VACCINES.some(([itemId]) => itemId === scheduleItemId)) {
      throw new BadRequestException('无效的疫苗计划节点');
    }
    await this.vaccinePlans.delete({ babyId, scheduleItemId });
    return { scheduleItemId, scheduledDate: null };
  }

  async listSubscribedUsers(page = 1, pageSize = 20, keyword?: string) {
    const templateId = this.getVaccineTemplateId();
    if (!templateId) return { list: [], total: 0, page: 1, pageSize };
    const safePage = Math.max(Math.floor(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;
    const where = keyword ? 'AND (u.nickname LIKE ? OR b.name LIKE ?)' : '';
    const keywordParams = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
    const baseParams = [templateId, ...keywordParams];
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT sg.user_id) AS total
       FROM subscription_grants sg
       INNER JOIN users u ON u.id = sg.user_id
       LEFT JOIN babies b ON b.user_id = u.id
       WHERE sg.template_id = ? AND sg.accepted_count > 0 ${where}`,
      baseParams,
    );
    const rows = await this.dataSource.query(
      `SELECT DISTINCT sg.user_id AS userId, u.nickname, u.avatar, sg.template_id AS templateId,
        sg.status, sg.available_count AS availableCount, sg.accepted_count AS acceptedCount,
        sg.rejected_count AS rejectedCount, sg.sent_count AS sentCount,
        sg.granted_at AS grantedAt, sg.last_sent_at AS lastSentAt,
        COALESCE(
          (SELECT b1.id FROM babies b1 WHERE b1.user_id = u.id ORDER BY b1.created_at ASC LIMIT 1),
          (SELECT b2.id FROM babies b2 INNER JOIN family_members fm ON fm.baby_id = b2.id
           WHERE fm.user_id = u.id AND fm.status = 'accepted' ORDER BY b2.created_at ASC LIMIT 1)
        ) AS babyId,
        COALESCE(
          (SELECT b1.name FROM babies b1 WHERE b1.user_id = u.id ORDER BY b1.created_at ASC LIMIT 1),
          (SELECT b2.name FROM babies b2 INNER JOIN family_members fm ON fm.baby_id = b2.id
           WHERE fm.user_id = u.id AND fm.status = 'accepted' ORDER BY b2.created_at ASC LIMIT 1)
        ) AS babyName
       FROM subscription_grants sg
       INNER JOIN users u ON u.id = sg.user_id
       LEFT JOIN babies b ON b.user_id = u.id
       WHERE sg.template_id = ? AND sg.accepted_count > 0 ${where}
       ORDER BY sg.available_count DESC, sg.granted_at DESC
       LIMIT ? OFFSET ?`,
      [...baseParams, safePageSize, offset],
    );
    return {
      list: rows.map((row) => ({
        userId: row.userId, nickname: row.nickname, avatar: row.avatar, templateId: row.templateId,
        status: row.status, availableCount: Number(row.availableCount), acceptedCount: Number(row.acceptedCount),
        rejectedCount: Number(row.rejectedCount), sentCount: Number(row.sentCount), babyId: row.babyId || null,
        babyName: row.babyName || null, grantedAt: row.grantedAt, lastSentAt: row.lastSentAt,
      })),
      total: Number(countRow?.total || 0), page: safePage, pageSize: safePageSize,
    };
  }

  async sendManualVaccine(userId: string, babyId: string | undefined, triggeredBy: string) {
    const templateId = this.getVaccineTemplateId();
    if (!templateId || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
      throw new BadRequestException('疫苗提醒模板或微信配置未完成');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.openId) throw new NotFoundException('用户不存在或没有微信 OpenID');
    const baby = babyId
      ? await this.babies.findOne({ where: { id: babyId } })
      : await this.babies.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
    if (!baby) throw new BadRequestException('该用户没有可用的宝宝档案');
    if (baby.userId !== userId) {
      const member = await this.familyMembers.findOne({ where: { userId, babyId: baby.id, status: InviteStatus.ACCEPTED } });
      if (!member) throw new BadRequestException('用户无权操作该宝宝');
    }
    const grant = await this.grants.findOne({ where: { userId, templateId } });
    if (!grant || grant.acceptedCount <= 0) throw new BadRequestException('该用户尚未授权疫苗提醒');
    if (grant.availableCount <= 0) throw new BadRequestException('该用户没有可用的订阅次数，请先重新授权');

    const reserve = await this.grants.createQueryBuilder().update(SubscriptionGrant)
      .set({ availableCount: () => 'available_count - 1' })
      .where('id = :id AND available_count > 0', { id: grant.id }).execute();
    if (!reserve.affected) throw new BadRequestException('订阅次数刚刚被其他发送消耗，请刷新列表');

    const date = new Date(); date.setDate(date.getDate() + Number(process.env.VACCINE_REMINDER_DAYS || 3));
    const notifyTime = `${this.formatLocalDate(date)} 09:00`;
    const payload = {
      vaccine: `${baby.name} · 测试提醒`.slice(0, 20), date: notifyTime, note: '测试提醒，以门诊为准'.slice(0, 20),
    };
    const delivery = this.deliveries.create({
      dedupeKey: `manual:vaccine:${randomUUID()}`, userId, templateId, status: 'sending', source: 'manual',
      triggeredBy, payload: JSON.stringify(payload), error: null, wechatCode: null, wechatMessage: null, sentAt: null,
    });
    await this.deliveries.save(delivery);
    try {
      const token = await this.getAccessToken();
      if (!token) throw new Error('微信 access_token 获取失败');
      const result = await firstValueFrom(this.http.post(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
        touser: user.openId, template_id: templateId,
        page: `/pages/vaccine-timeline/index?babyId=${baby.id}&source=notification_vaccine`,
        data: {
          [process.env.WECHAT_VACCINE_FIELD_NAME || 'thing1']: { value: payload.vaccine },
          [process.env.WECHAT_VACCINE_FIELD_DATE || 'time2']: { value: payload.date },
          [process.env.WECHAT_VACCINE_FIELD_NOTE || 'thing6']: { value: payload.note },
        }, miniprogram_state: process.env.WECHAT_SUBSCRIBE_MINI_PROGRAM_STATE || 'formal',
      }));
      const response = result.data || {};
      delivery.wechatCode = String(response.errcode ?? 0);
      delivery.wechatMessage = response.errmsg || 'ok';
      if (response.errcode) throw new Error(`${response.errcode}: ${response.errmsg}`);
      delivery.status = 'sent'; delivery.sentAt = new Date();
      const freshGrant = await this.grants.findOneOrFail({ where: { id: grant.id } });
      freshGrant.sentCount += 1; freshGrant.lastSentAt = new Date(); freshGrant.status = freshGrant.availableCount > 0 ? 'accept' : 'consumed';
      await this.grants.save(freshGrant);
      await this.deliveries.save(delivery);
      return { success: true, deliveryId: delivery.id, availableCount: freshGrant.availableCount };
    } catch (error: any) {
      delivery.status = 'failed'; delivery.error = String(error?.message || error);
      await this.deliveries.save(delivery);
      await this.grants.createQueryBuilder().update(SubscriptionGrant)
        .set({ availableCount: () => 'available_count + 1', status: 'accept' })
        .where('id = :id', { id: grant.id }).execute();
      throw new BadRequestException(`测试推送失败：${delivery.error}`);
    }
  }

  private async getAccessToken() {
    const appid = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appid || !secret) return null;
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const response = await firstValueFrom(this.http.get('https://api.weixin.qq.com/cgi-bin/token', { params: { grant_type: 'client_credential', appid, secret } }));
    if (!response.data?.access_token) throw new Error(`微信 access_token 获取失败: ${JSON.stringify(response.data)}`);
    this.accessToken = { value: response.data.access_token, expiresAt: Date.now() + Number(response.data.expires_in || 7200) * 1000 };
    return this.accessToken.value;
  }

  private dueDate(birthday: string, months: number) {
    const [year, month, day] = birthday.split('-').map(Number);
    const targetMonth = month - 1 + months;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    return new Date(targetYear, normalizedMonth, Math.min(day, lastDay), 12, 0, 0, 0);
  }

  private parseLocalDate(date: string) {
    return new Date(`${date}T12:00:00`);
  }

  private formatLocalDate(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  async sendDueVaccines() {
    const templateId = this.getVaccineTemplateId();
    if (!templateId || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return { sent: 0, skipped: true };
    const token = await this.getAccessToken();
    if (!token) return { sent: 0, skipped: true };
    const babies = await this.babies.find();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + Number(process.env.VACCINE_REMINDER_DAYS || 3));
    horizon.setHours(23, 59, 59, 999);
    let sent = 0;
    for (const baby of babies) {
      const plans = await this.vaccinePlans.find({ where: { babyId: baby.id } });
      const planByItem = new Map(plans.map((plan) => [plan.scheduleItemId, plan.scheduledDate]));
      const members = await this.familyMembers.find({ where: { babyId: baby.id, status: InviteStatus.ACCEPTED } });
      const recipientIds = Array.from(new Set([baby.userId, ...members.map((item) => item.userId).filter(Boolean)]));
      for (const recipientId of recipientIds) {
        const user = await this.users.findOne({ where: { id: recipientId } });
        if (!user?.openId) continue;
        const grant = await this.grants.findOne({ where: { userId: user.id, templateId } });
        if (!grant || grant.availableCount <= 0) continue;
        for (const [itemId, months, label] of VACCINES) {
          const scheduledDate = planByItem.get(itemId);
          const due = scheduledDate ? this.parseLocalDate(scheduledDate) : this.dueDate(baby.birthday, months);
          if (due < today || due > horizon) continue;
          const done = await this.records.count({ where: { babyId: baby.id, vaccineScheduleItemId: itemId } });
          if (done > 0) continue;
          const date = this.formatLocalDate(due);
          // 模板中的 time2 字段要求时间格式；优先展示用户设置的计划接种日。
          const notifyTime = `${date} 09:00`;
          const dedupeKey = `vaccine:${baby.id}:${itemId}:${date}:${user.id}`;
          let delivery = await this.deliveries.findOne({ where: { dedupeKey } });
          if (delivery && delivery.status !== 'failed') continue;
          delivery ||= this.deliveries.create({ dedupeKey, userId: user.id, templateId, status: 'sending' });
          delivery.status = 'sending';
          delivery.error = null;
          await this.deliveries.save(delivery);
          try {
            const body = {
              touser: user.openId, template_id: templateId, page: `/pages/vaccine-timeline/index?babyId=${baby.id}&source=notification_vaccine`,
              data: {
                [process.env.WECHAT_VACCINE_FIELD_NAME || 'thing1']: { value: `${baby.name} · ${label}`.slice(0, 20) },
                [process.env.WECHAT_VACCINE_FIELD_DATE || 'time2']: { value: notifyTime },
                [process.env.WECHAT_VACCINE_FIELD_NOTE || 'thing6']: { value: scheduledDate ? '计划接种日，请以门诊为准' : '参考日期，请以门诊为准' },
              },
              miniprogram_state: process.env.WECHAT_SUBSCRIBE_MINI_PROGRAM_STATE || 'formal',
            };
            const result = await firstValueFrom(this.http.post(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, body));
            if (result.data?.errcode) throw new Error(`${result.data.errcode}: ${result.data.errmsg}`);
            delivery.status = 'sent';
            grant.availableCount = Math.max(0, grant.availableCount - 1);
            grant.sentCount += 1;
            grant.status = grant.availableCount > 0 ? 'accept' : 'consumed';
            grant.lastSentAt = new Date();
            await this.grants.save(grant);
            sent++;
            await this.deliveries.save(delivery);
            break;
          } catch (error: any) {
            delivery.status = 'failed';
            delivery.error = String(error?.message || error);
            this.logger.warn(`疫苗提醒发送失败 ${dedupeKey}: ${delivery.error}`);
          }
          await this.deliveries.save(delivery);
        }
      }
    }
    return { sent, skipped: false };
  }

  async sendDailyReviews() {
    const templateId = this.getReviewTemplateId();
    if (!templateId || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return { sent: 0, skipped: true };
    const token = await this.getAccessToken();
    if (!token) return { sent: 0, skipped: true };
    const date = this.formatLocalDate(new Date());
    const grants = (await this.grants.find({ where: { templateId } })).filter((grant) => grant.availableCount > 0);
    let sent = 0;
    for (const grant of grants) {
      const user = await this.users.findOne({ where: { id: grant.userId } });
      let baby = await this.babies.findOne({ where: { userId: grant.userId }, order: { createdAt: 'ASC' } });
      if (!baby) {
        const membership = await this.familyMembers.findOne({ where: { userId: grant.userId, status: InviteStatus.ACCEPTED }, relations: ['baby'] });
        baby = membership?.baby || null;
      }
      if (!user?.openId || !baby) continue;
      const rows = await this.records.find({
        where: { babyId: baby.id },
        order: { startTime: 'DESC' },
        take: 100,
      });
      const todayRows = rows.filter((item) => this.formatLocalDate(new Date(item.startTime)) === date);
      if (todayRows.length === 0) continue;
      const feeding = todayRows.filter((item) => item.type === 'feeding').length;
      const sleepMinutes = todayRows.filter((item) => item.type === 'sleep').reduce((sum, item) => sum + Number(item.duration || 0), 0);
      const diaper = todayRows.filter((item) => item.type === 'diaper').length;
      const summary = [`喂奶${feeding}次`, `睡眠${Math.round(sleepMinutes / 60)}小时`, `尿布${diaper}次`].join(' · ').slice(0, 20);
      const dedupeKey = `review:${baby.id}:${date}:${user.id}`;
      let delivery = await this.deliveries.findOne({ where: { dedupeKey } });
      if (delivery && delivery.status !== 'failed') continue;
      delivery ||= this.deliveries.create({ dedupeKey, userId: user.id, templateId, status: 'sending' });
      delivery.status = 'sending';
      delivery.error = null;
      await this.deliveries.save(delivery);
      try {
        const body = {
          touser: user.openId, template_id: templateId, page: '/pages/index/index?source=notification_review',
          data: {
            [process.env.WECHAT_REVIEW_FIELD_BABY || 'thing1']: { value: baby.name.slice(0, 20) },
            [process.env.WECHAT_REVIEW_FIELD_SUMMARY || 'thing2']: { value: summary },
            [process.env.WECHAT_REVIEW_FIELD_DATE || 'date3']: { value: date },
          },
          miniprogram_state: process.env.WECHAT_SUBSCRIBE_MINI_PROGRAM_STATE || 'formal',
        };
        const result = await firstValueFrom(this.http.post(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, body));
        if (result.data?.errcode) throw new Error(`${result.data.errcode}: ${result.data.errmsg}`);
        delivery.status = 'sent';
        grant.availableCount = Math.max(0, grant.availableCount - 1);
        grant.sentCount += 1;
        grant.status = grant.availableCount > 0 ? 'accept' : 'consumed';
        grant.lastSentAt = new Date();
        await this.grants.save(grant);
        sent++;
      } catch (error: any) {
        delivery.status = 'failed'; delivery.error = String(error?.message || error);
      }
      await this.deliveries.save(delivery);
    }
    return { sent, skipped: false };
  }
}
