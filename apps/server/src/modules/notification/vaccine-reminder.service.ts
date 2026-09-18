import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../user/entities/user.entity';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { VaccinePlan } from './entities/vaccine-plan.entity';
import { TIMELINE_VACCINE_SCHEDULE } from '@baby-time/shared';
import { WechatSubscribeService } from './wechat-subscribe.service';
import { getVaccineTemplateId, dueDate, parseLocalDate, formatLocalDate } from './notification.helpers';

/**
 * 订阅消息发送编排：定时疫苗提醒、每日回顾、admin 手动测试推送。
 * 计划查询/授权入账在 VaccinePlanService；微信 API 细节在 WechatSubscribeService。
 */
@Injectable()
export class VaccineReminderService implements OnModuleInit {
  private readonly logger = new Logger(VaccineReminderService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly wechat: WechatSubscribeService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Baby) private readonly babies: Repository<Baby>,
    @InjectRepository(BabyRecord) private readonly records: Repository<BabyRecord>,
    @InjectRepository(SubscriptionGrant) private readonly grants: Repository<SubscriptionGrant>,
    @InjectRepository(NotificationDelivery) private readonly deliveries: Repository<NotificationDelivery>,
    @InjectRepository(FamilyMember) private readonly familyMembers: Repository<FamilyMember>,
    @InjectRepository(VaccinePlan) private readonly vaccinePlans: Repository<VaccinePlan>,
  ) {}

  onModuleInit() {
    // 半小时检查一次，实际发送由配置的本地小时控制，发送表负责幂等。
    if (getVaccineTemplateId() || process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID) {
      this.timer = setInterval(() => this.runScheduled().catch((e) => this.logger.error(e)), 30 * 60 * 1000);
      void this.runScheduled();
    }
  }

  private async runScheduled() {
    const hour = new Date().getHours();
    if (hour === Number(process.env.VACCINE_REMINDER_HOUR || 9)) await this.sendDueVaccines();
    if (hour === Number(process.env.DAILY_REVIEW_HOUR || 20)) await this.sendDailyReviews();
  }

  async sendManualVaccine(userId: string, babyId: string | undefined, triggeredBy: string) {
    const templateId = getVaccineTemplateId();
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
    const notifyTime = `${formatLocalDate(date)} 09:00`;
    const payload = {
      vaccine: `${baby.name} · 测试提醒`.slice(0, 20), date: notifyTime, note: '测试提醒，以门诊为准'.slice(0, 20),
    };
    const delivery = this.deliveries.create({
      dedupeKey: `manual:vaccine:${randomUUID()}`, userId, templateId, status: 'sending', source: 'manual',
      triggeredBy, payload: JSON.stringify(payload), error: null, wechatCode: null, wechatMessage: null, sentAt: null,
    });
    await this.deliveries.save(delivery);
    try {
      const token = await this.wechat.getAccessToken();
      if (!token) throw new Error('微信 access_token 获取失败');
      const response = await this.wechat.postSubscribe(token, {
        touser: user.openId, template_id: templateId,
        page: `/pages/vaccine-timeline/index?babyId=${baby.id}&source=notification_vaccine`,
        data: {
          [process.env.WECHAT_VACCINE_FIELD_NAME || 'thing1']: { value: payload.vaccine },
          [process.env.WECHAT_VACCINE_FIELD_DATE || 'time2']: { value: payload.date },
          [process.env.WECHAT_VACCINE_FIELD_NOTE || 'thing6']: { value: payload.note },
        }, miniprogram_state: process.env.WECHAT_SUBSCRIBE_MINI_PROGRAM_STATE || 'formal',
      });
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
      if (this.wechat.isWechatRefused(delivery.error)) {
        // 微信侧已拒收/次数作废：不退还额度并清零，避免「显示有次数却永远推不动」的死循环
        await this.wechat.invalidateWechatGrant(grant.id);
        throw new BadRequestException('测试推送失败：用户已在微信侧拒收或订阅次数作废（43101），本地额度已清零，请让用户在小程序内重新授权后再试');
      }
      await this.grants.createQueryBuilder().update(SubscriptionGrant)
        .set({ availableCount: () => 'available_count + 1', status: 'accept' })
        .where('id = :id', { id: grant.id }).execute();
      throw new BadRequestException(`测试推送失败：${delivery.error}`);
    }
  }

  async sendDueVaccines() {
    const templateId = getVaccineTemplateId();
    if (!templateId || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return { sent: 0, skipped: true };
    const token = await this.wechat.getAccessToken();
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
        for (const { id: itemId, ageMonths: months, displayName: label } of TIMELINE_VACCINE_SCHEDULE) {
          const scheduledDate = planByItem.get(itemId);
          const due = scheduledDate ? parseLocalDate(scheduledDate) : dueDate(baby.birthday, months);
          if (due < today || due > horizon) continue;
          const done = await this.records.count({ where: { babyId: baby.id, vaccineScheduleItemId: itemId } });
          if (done > 0) continue;
          const date = formatLocalDate(due);
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
            const response = await this.wechat.postSubscribe(token, body);
            if (response.errcode) throw new Error(`${response.errcode}: ${response.errmsg}`);
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
            if (this.wechat.isWechatRefused(delivery.error)) {
              // 微信侧已拒收：清零本地额度，本轮及后续定时任务不再重试该用户
              await this.wechat.invalidateWechatGrant(grant.id);
              break;
            }
          }
          await this.deliveries.save(delivery);
        }
      }
    }
    return { sent, skipped: false };
  }

  async sendDailyReviews() {
    const templateId = process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID || '';
    if (!templateId || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return { sent: 0, skipped: true };
    const token = await this.wechat.getAccessToken();
    if (!token) return { sent: 0, skipped: true };
    const date = formatLocalDate(new Date());
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
      const todayRows = rows.filter((item) => formatLocalDate(new Date(item.startTime)) === date);
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
        const response = await this.wechat.postSubscribe(token, body);
        if (response.errcode) throw new Error(`${response.errcode}: ${response.errmsg}`);
        delivery.status = 'sent';
        grant.availableCount = Math.max(0, grant.availableCount - 1);
        grant.sentCount += 1;
        grant.status = grant.availableCount > 0 ? 'accept' : 'consumed';
        grant.lastSentAt = new Date();
        await this.grants.save(grant);
        sent++;
      } catch (error: any) {
        delivery.status = 'failed'; delivery.error = String(error?.message || error);
        if (this.wechat.isWechatRefused(delivery.error)) {
          // 微信侧已拒收：清零本地额度，后续定时任务不再重试该用户
          await this.wechat.invalidateWechatGrant(grant.id);
          grant.availableCount = 0;
        }
      }
      await this.deliveries.save(delivery);
    }
    return { sent, skipped: false };
  }
}
