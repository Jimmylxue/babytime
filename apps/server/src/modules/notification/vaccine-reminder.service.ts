import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../user/entities/user.entity';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord, RecordType } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { FamilyMember, InviteStatus } from '../family/entities/family-member.entity';
import { VaccinePlan } from './entities/vaccine-plan.entity';
import { TIMELINE_VACCINE_SCHEDULE } from '@baby-time/shared';
import { WechatSubscribeService } from './wechat-subscribe.service';
import { getVaccineTemplateId, getReviewTemplateId, dueDate, parseLocalDate, formatLocalDate } from './notification.helpers';

/**
 * 订阅消息发送编排：定时疫苗提醒、每日回顾、admin 手动测试推送。
 * 计划查询/授权入账在 VaccinePlanService；微信 API 细节在 WechatSubscribeService。
 */
@Injectable()
export class VaccineReminderService implements OnModuleInit, OnModuleDestroy {
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
    // 部署前探活会临时起一个进程，它连的是真库、拿着真的模板 ID 与凭据。
    // onModuleInit 当场就跑一次 runScheduled()，不显式禁掉的话，探活进程会真的往外推消息、
    // 真扣用户的订阅额度 —— 靠「现在不是 9 点/21 点」赌时钟对不上并不可靠。
    if (process.env.OPS_DISABLE_SCHEDULER === '1') {
      this.logger.warn('OPS_DISABLE_SCHEDULER=1：本进程不启动订阅消息定时器（探活/金丝雀模式）');
      return;
    }
    // 半小时检查一次，实际发送由配置的本地小时控制，发送表负责幂等。
    if (getVaccineTemplateId() || process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID) {
      this.timer = setInterval(() => this.runScheduled().catch((e) => this.logger.error(e)), 30 * 60 * 1000);
      void this.runScheduled();
    }
  }

  /**
   * 排空时必须清掉：setInterval 是常驻句柄，留着它进程退不干净，
   * 会被 PM2 在 kill_timeout 之后 SIGKILL —— 那正好又把在途请求砍了，排空白做。
   */
  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log('订阅消息定时器已停止，可以干净退出');
    }
  }

  private async runScheduled() {
    const hour = new Date().getHours();
    if (hour === Number(process.env.VACCINE_REMINDER_HOUR || 9)) await this.sendDueVaccines();
    if (hour === Number(process.env.DAILY_REVIEW_HOUR || 21)) await this.sendDailyReviews();
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
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + Number(process.env.VACCINE_REMINDER_DAYS || 3));
    horizon.setHours(23, 59, 59, 999);

    // 原先是「全表宝宝 → 每宝宝查计划与成员 → 每收件人查用户与额度 → 每候选 COUNT 一次接种记录」，
    // 随宝宝数线性恶化（本地按生产同规模夹具实测一轮 1294 条 SQL），是清单里唯一会这样长的定时任务。
    // 现在压成 6 条批量查询 + 每个候选一次 dedupe_key 唯一索引点查（同夹具实测 628 条，
    // 省下的 666 条全是随规模增长的那部分）。
    // 顺序上先取「有额度的授权」再回查用户：有额度的人是收件人的小子集（当前 21 人 vs 210 用户），
    // 反过来先拉全部用户再筛额度会白读一大片；一个额度都没有时整轮直接结束。
    // 注：In(babyIds) 在宝宝数上到几千时要改成分批，现在这个量级一条 SQL 更划算。
    const grants = await this.grants.find({ where: { templateId, availableCount: MoreThan(0) } });
    if (!grants.length) return { sent: 0, skipped: false };
    const grantByUser = new Map(grants.map((grant) => [grant.userId, grant]));

    const [subscribers, babies] = await Promise.all([
      this.users.find({ where: { id: In([...grantByUser.keys()]) }, select: ['id', 'openId'] }),
      this.babies.find({ select: ['id', 'userId', 'name', 'birthday'] }),
    ]);
    if (!babies.length) return { sent: 0, skipped: false };
    const openIdByUser = new Map(
      subscribers.filter((user) => user.openId).map((user) => [user.id, user.openId]),
    );
    const babyIds = babies.map((baby) => baby.id);

    const [plans, members, vaccinated] = await Promise.all([
      this.vaccinePlans.find({
        where: { babyId: In(babyIds) },
        select: ['babyId', 'scheduleItemId', 'scheduledDate'],
      }),
      this.familyMembers.find({
        where: { babyId: In(babyIds), status: InviteStatus.ACCEPTED },
        select: ['babyId', 'userId'],
      }),
      // 已接种的节点一次性取回，替代循环里每个候选一次的 records.count。
      // 不按 type 过滤：原实现统计的是「该节点 ID 上的任意记录」，保持同一口径。
      this.records.find({
        where: { babyId: In(babyIds), vaccineScheduleItemId: Not(IsNull()) },
        select: ['babyId', 'vaccineScheduleItemId'],
      }),
    ]);

    const planByBaby = new Map<string, Map<string, string>>();
    for (const plan of plans) {
      const byItem = planByBaby.get(plan.babyId) ?? new Map<string, string>();
      byItem.set(plan.scheduleItemId, plan.scheduledDate);
      planByBaby.set(plan.babyId, byItem);
    }
    // 收件人 = 宝宝创建者 + 已接受的家庭成员，创建者排第一（额度不够时先发给他，同原顺序）
    const recipientsByBaby = new Map<string, string[]>(babies.map((baby) => [baby.id, [baby.userId]]));
    for (const member of members) {
      const recipients = recipientsByBaby.get(member.babyId);
      if (recipients && member.userId && !recipients.includes(member.userId)) recipients.push(member.userId);
    }
    const doneKeys = new Set(vaccinated.map((record) => `${record.babyId}:${record.vaccineScheduleItemId}`));

    let sent = 0;
    for (const baby of babies) {
      // 到期节点与收件人无关，在宝宝这一层算一次就够，别每个收件人重复算
      const planByItem = planByBaby.get(baby.id);
      const dueItems: { itemId: string; label: string; scheduledDate?: string; date: string }[] = [];
      for (const { id: itemId, ageMonths: months, displayName: label } of TIMELINE_VACCINE_SCHEDULE) {
        if (doneKeys.has(`${baby.id}:${itemId}`)) continue;
        const scheduledDate = planByItem?.get(itemId);
        const due = scheduledDate ? parseLocalDate(scheduledDate) : dueDate(baby.birthday, months);
        if (due < today || due > horizon) continue;
        dueItems.push({ itemId, label, scheduledDate, date: formatLocalDate(due) });
      }
      if (!dueItems.length) continue;

      for (const recipientId of recipientsByBaby.get(baby.id) ?? []) {
        const openId = openIdByUser.get(recipientId);
        if (!openId) continue;
        const grant = grantByUser.get(recipientId);
        if (!grant || grant.availableCount <= 0) continue;
        for (const { itemId, label, scheduledDate, date } of dueItems) {
          // 模板中的 time2 字段要求时间格式；优先展示用户设置的计划接种日。
          const notifyTime = `${date} 09:00`;
          const dedupeKey = `vaccine:${baby.id}:${itemId}:${date}:${recipientId}`;
          let delivery = await this.deliveries.findOne({ where: { dedupeKey } });
          if (delivery && delivery.status !== 'failed') continue;
          delivery ||= this.deliveries.create({ dedupeKey, userId: recipientId, templateId, status: 'sending' });
          delivery.status = 'sending';
          delivery.error = null;
          await this.deliveries.save(delivery);
          try {
            const body = {
              touser: openId, template_id: templateId, page: `/pages/vaccine-timeline/index?babyId=${baby.id}&source=notification_vaccine`,
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
            // grant 是整轮共用的同一个对象：扣减留在内存里，本轮后面的宝宝不会把同一份额度超发
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
              grant.availableCount = 0;
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
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const tomorrow0 = new Date(today0); tomorrow0.setDate(tomorrow0.getDate() + 1);
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
      // 计数交给数据库（走 baby_id+type+start_time 索引），不再拉 100 条进内存过滤
      const totalToday = await this.records.count({
        where: { babyId: baby.id, startTime: Between(today0, tomorrow0) },
      });
      if (totalToday === 0) continue;
      // 模板 77947（宝宝每日奶粉消耗提醒）只有「宝宝 / 喂养次数 / 日期」三个字段，
      // 放不下睡眠、尿布的明细 —— 这不是问题：消息的作用是把人勾回来，
      // 完整数据点「详情」进小程序看。消息越短，点开率越高。
      const feeding = await this.records.count({
        where: { babyId: baby.id, type: RecordType.FEEDING, startTime: Between(today0, tomorrow0) },
      });
      const dedupeKey = `review:${baby.id}:${date}:${user.id}`;
      let delivery = await this.deliveries.findOne({ where: { dedupeKey } });
      if (delivery && delivery.status !== 'failed') continue;
      delivery ||= this.deliveries.create({ dedupeKey, userId: user.id, templateId, status: 'sending' });
      delivery.status = 'sending';
      delivery.error = null;
      await this.deliveries.save(delivery);
      try {
        const response = await this.wechat.postSubscribe(
          token,
          this.buildReviewBody(user.openId, baby.name, feeding, date, this.reviewTimeLabel()),
        );
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

  /**
   * 「每日回顾」消息体：字段映射的**唯一来源**，定时任务与后台直推都用它。
   *
   * 对应模板 77947（宝宝每日奶粉消耗提醒），三个字段：
   *   thing1  → 宝宝名（20 字以内）
   *   number2 → 喂养次数：**数字类型，只能传纯数字**，带「次」会被判参数非法
   *   time3   → 日期：**时间类型，要 24 小时制**（项目里疫苗模板的 time2 同样这么发，已验证可送达）
   * 模板只有三个字段，装不下睡眠/尿布明细 —— 消息的职责是把人勾回来，
   * 完整数据让用户点「详情」进小程序看。
   */
  private buildReviewBody(
    openId: string,
    babyName: string,
    feeding: number,
    date: string,
    time: string,
  ) {
    return {
      touser: openId,
      template_id: getReviewTemplateId(),
      page: '/pages/index/index?source=notification_review',
      data: {
        [process.env.WECHAT_REVIEW_FIELD_BABY || 'thing1']: { value: babyName.slice(0, 20) },
        [process.env.WECHAT_REVIEW_FIELD_FEEDING || 'number2']: { value: String(feeding) },
        [process.env.WECHAT_REVIEW_FIELD_DATE || 'time3']: { value: `${date} ${time}` },
      },
      miniprogram_state: process.env.WECHAT_SUBSCRIBE_MINI_PROGRAM_STATE || 'formal',
    };
  }

  /** 当前配置的每日回顾推送时刻，如 `21:00`（默认 21 点：宝宝哄睡后、妈妈刷手机的黄金时段） */
  private reviewTimeLabel() {
    const raw = Number(process.env.DAILY_REVIEW_HOUR || 21);
    return `${String(Number.isFinite(raw) ? raw : 21).padStart(2, '0')}:00`;
  }

  /**
   * 后台直推一条「每日回顾」，用于验证模板字段格式是否被微信接受。
   * 真实消耗用户 1 次订阅额度 —— 这是唯一能验证 number2/time3 格式的办法
   * （微信先校验 openid 再校验 data，拿假 openid 探测是测不出格式问题的）。
   */
  async sendManualReview(userId: string, triggeredBy: string) {
    const templateId = getReviewTemplateId();
    if (!templateId) throw new BadRequestException('服务端未配置每日回顾模板（WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID）');
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.openId) throw new NotFoundException('用户不存在或没有微信 OpenID');
    let baby = await this.babies.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
    if (!baby) {
      const membership = await this.familyMembers.findOne({ where: { userId, status: InviteStatus.ACCEPTED }, relations: ['baby'] });
      baby = membership?.baby || null;
    }
    if (!baby) throw new BadRequestException('该用户没有可用的宝宝档案');

    const grant = await this.grants.findOne({ where: { userId, templateId } });
    if (!grant || grant.acceptedCount <= 0) throw new BadRequestException('该用户尚未授权每日回顾提醒');
    if (grant.availableCount <= 0) throw new BadRequestException('该用户没有可用的订阅次数，请先在小程序里重新授权');

    // 与手动疫苗推送同款原子预扣：并发（定时任务/另一管理员）时不会出现超发
    const reserve = await this.grants.createQueryBuilder().update(SubscriptionGrant)
      .set({ availableCount: () => 'available_count - 1' })
      .where('id = :id AND available_count > 0', { id: grant.id }).execute();
    if (!reserve.affected) throw new BadRequestException('订阅次数刚刚被其他发送消耗，请刷新列表');

    const date = formatLocalDate(new Date());
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const tomorrow0 = new Date(today0); tomorrow0.setDate(tomorrow0.getDate() + 1);
    const feeding = await this.records.count({
      where: { babyId: baby.id, type: RecordType.FEEDING, startTime: Between(today0, tomorrow0) },
    });

    const delivery = this.deliveries.create({
      dedupeKey: `manual:review:${randomUUID()}`,
      userId,
      templateId,
      status: 'sending',
      source: 'manual',
      triggeredBy,
      payload: JSON.stringify({ babyName: baby.name, feeding, date }),
      error: null,
      wechatCode: null,
      wechatMessage: null,
      sentAt: null,
    });
    await this.deliveries.save(delivery);

    try {
      const token = await this.wechat.getAccessToken();
      if (!token) throw new Error('微信 access_token 获取失败');
      const response = await this.wechat.postSubscribe(
        token,
        this.buildReviewBody(user.openId, baby.name, feeding, date, this.reviewTimeLabel()),
      );
      delivery.wechatCode = String(response.errcode ?? 0);
      delivery.wechatMessage = response.errmsg || 'ok';
      if (response.errcode) throw new Error(`${response.errcode}: ${response.errmsg}`);
      delivery.status = 'sent';
      delivery.sentAt = new Date();
      // 额度已在 reserve 中原子扣减，这里只记发送统计（读 fresh，避免覆盖并发方的计数）
      const freshGrant = await this.grants.findOneOrFail({ where: { id: grant.id } });
      freshGrant.sentCount += 1;
      freshGrant.lastSentAt = new Date();
      freshGrant.status = freshGrant.availableCount > 0 ? 'accept' : 'consumed';
      await this.grants.save(freshGrant);
      await this.deliveries.save(delivery);
      return { success: true, deliveryId: delivery.id, availableCount: freshGrant.availableCount, feeding };
    } catch (error: any) {
      delivery.status = 'failed';
      delivery.error = String(error?.message || error);
      await this.deliveries.save(delivery);
      if (this.wechat.isWechatRefused(delivery.error)) {
        await this.wechat.invalidateWechatGrant(grant.id);
        throw new BadRequestException('该用户已在微信侧拒收或订阅次数作废，本地额度已清零，请让用户重新授权');
      }
      // 非拒收的失败（网络/模板参数错误等）：退还预扣的 1 次额度
      await this.grants.createQueryBuilder().update(SubscriptionGrant)
        .set({ availableCount: () => 'available_count + 1', status: 'accept' })
        .where('id = :id', { id: grant.id }).execute();
      throw new BadRequestException(`发送失败：${delivery.error}`);
    }
  }
}
