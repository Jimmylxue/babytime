import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { User } from '../user/entities/user.entity';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';

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
    const d = new Date(`${birthday}T12:00:00`);
    d.setMonth(d.getMonth() + months);
    return d;
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
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + Number(process.env.VACCINE_REMINDER_DAYS || 3));
    let sent = 0;
    for (const baby of babies) {
      const members = await this.familyMembers.find({ where: { babyId: baby.id, status: InviteStatus.ACCEPTED } });
      const recipientIds = Array.from(new Set([baby.userId, ...members.map((item) => item.userId).filter(Boolean)]));
      for (const recipientId of recipientIds) {
        const user = await this.users.findOne({ where: { id: recipientId } });
        if (!user?.openId) continue;
        const grant = await this.grants.findOne({ where: { userId: user.id, templateId } });
        if (!grant || grant.availableCount <= 0) continue;
        for (const [itemId, months, label] of VACCINES) {
          const due = this.dueDate(baby.birthday, months);
          if (due < today || due > horizon) continue;
          const done = await this.records.count({ where: { babyId: baby.id, vaccineScheduleItemId: itemId } });
          if (done > 0) continue;
          const date = this.formatLocalDate(due);
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
                [process.env.WECHAT_VACCINE_FIELD_DATE || 'time2']: { value: date },
                [process.env.WECHAT_VACCINE_FIELD_NOTE || 'thing6']: { value: '以门诊为准' },
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
