import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WechatSubscribeService } from './wechat-subscribe.service';
import { VaccinePlanService } from './vaccine-plan.service';
import { VaccineReminderService } from './vaccine-reminder.service';
import { getVaccineTemplateId } from './notification.helpers';

/**
 * 对外门面：控制器/admin 的注入点保持稳定（行为与原单文件实现一致），
 * 实现按职责拆在三个 service：
 * - VaccinePlanService      计划查询/设置、订阅授权入账（用户侧业务）
 * - VaccineReminderService  定时/手动发送编排
 * - WechatSubscribeService  微信 API（token、发送、小程序码、43101 对账）
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly planService: VaccinePlanService,
    private readonly reminderService: VaccineReminderService,
    private readonly wechat: WechatSubscribeService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  getConfig() { return this.planService.getConfig(); }

  saveGrants(userId: string, statuses: Record<string, string>) {
    return this.planService.saveGrants(userId, statuses);
  }

  getUserVaccineStatus(userId: string) {
    return this.planService.getUserVaccineStatus(userId);
  }

  getVaccinePlans(userId: string, babyId: string) {
    return this.planService.getVaccinePlans(userId, babyId);
  }

  setVaccinePlan(userId: string, babyId: string, scheduleItemId: string, scheduledDate: string) {
    return this.planService.setVaccinePlan(userId, babyId, scheduleItemId, scheduledDate);
  }

  removeVaccinePlan(userId: string, babyId: string, scheduleItemId: string) {
    return this.planService.removeVaccinePlan(userId, babyId, scheduleItemId);
  }

  sendManualVaccine(userId: string, babyId: string | undefined, triggeredBy: string) {
    return this.reminderService.sendManualVaccine(userId, babyId, triggeredBy);
  }

  sendDueVaccines() { return this.reminderService.sendDueVaccines(); }

  sendDailyReviews() { return this.reminderService.sendDailyReviews(); }

  getPosterQrCode(scene: string, envVersion?: string) {
    return this.wechat.getPosterQrCode(scene, envVersion);
  }

  // admin「订阅与唤回」看板：跨表聚合查询，留在门面避免多一处注入接线
  async listSubscribedUsers(page = 1, pageSize = 20, keyword?: string) {
    const templateId = getVaccineTemplateId();
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
}
