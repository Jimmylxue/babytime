import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const ACTIVE_USER_FROM = `
  FROM records r
  INNER JOIN babies b ON b.id = r.baby_id
`;
const ACTIVE_USER_ID = 'COALESCE(r.actor_user_id, b.user_id)';

@Injectable()
export class AdminStatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getOverview() {
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()) AS todayUsers,
        (SELECT COUNT(*) FROM babies) AS totalBabies,
        (SELECT COUNT(*) FROM babies WHERE DATE(created_at) = CURDATE()) AS todayBabies,
        (SELECT COUNT(*) FROM records) AS totalRecords,
        (SELECT COUNT(*) FROM records WHERE DATE(created_at) = CURDATE()) AS todayRecords,
        (SELECT COUNT(DISTINCT ${ACTIVE_USER_ID}) ${ACTIVE_USER_FROM} WHERE DATE(r.created_at) = CURDATE()) AS todayActiveUsers,
        (SELECT COUNT(DISTINCT ${ACTIVE_USER_ID}) ${ACTIVE_USER_FROM} WHERE r.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekActiveUsers,
        (SELECT COUNT(*) FROM records WHERE diaper_analysis IS NOT NULL) AS aiAnalysisTotal,
        (SELECT COUNT(*) FROM records WHERE diaper_analysis IS NOT NULL AND DATE(created_at) = CURDATE()) AS aiAnalysisToday,
        (SELECT COUNT(*) FROM photos) AS totalPhotos,
        (SELECT COUNT(*) FROM family_members WHERE status = 'accepted') AS familyMembers,
        (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekNewUsers
      `,
    );

    return {
      totalUsers: Number(row.totalUsers),
      todayUsers: Number(row.todayUsers),
      weekNewUsers: Number(row.weekNewUsers),
      totalBabies: Number(row.totalBabies),
      todayBabies: Number(row.todayBabies),
      totalRecords: Number(row.totalRecords),
      todayRecords: Number(row.todayRecords),
      todayActiveUsers: Number(row.todayActiveUsers),
      weekActiveUsers: Number(row.weekActiveUsers),
      aiAnalysisTotal: Number(row.aiAnalysisTotal),
      aiAnalysisToday: Number(row.aiAnalysisToday),
      totalPhotos: Number(row.totalPhotos),
      familyMembers: Number(row.familyMembers),
    };
  }

  async getTrends(days: number) {
    const safeDays = Math.min(Math.max(Math.floor(days) || 30, 1), 90);

    // 日期轴以本地时区的自然日为准，缺失的日期补 0。
    const dateList: string[] = [];
    const today = new Date();
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      dateList.push(this.formatDate(d));
    }
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - safeDays + 1);

    const [newUsers, newRecords, activeUsers] = await Promise.all([
      this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
         FROM users WHERE created_at >= ? GROUP BY date`,
        [startDate],
      ),
      this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
         FROM records WHERE created_at >= ? GROUP BY date`,
        [startDate],
      ),
      this.dataSource.query(
        `SELECT DATE_FORMAT(r.created_at, '%Y-%m-%d') AS date, COUNT(DISTINCT ${ACTIVE_USER_ID}) AS count
         ${ACTIVE_USER_FROM} WHERE r.created_at >= ? GROUP BY date`,
        [startDate],
      ),
    ]);

    const toSeries = (rows: any[]) => {
      const countMap = new Map(rows.map((row) => [row.date, Number(row.count)]));
      return dateList.map((date) => ({ date, count: countMap.get(date) ?? 0 }));
    };

    return {
      days: safeDays,
      newUsers: toSeries(newUsers),
      newRecords: toSeries(newRecords),
      activeUsers: toSeries(activeUsers),
    };
  }

  async getDistribution() {
    const [recordTypes, babyGenders] = await Promise.all([
      this.dataSource.query(`SELECT type, COUNT(*) AS count FROM records GROUP BY type`),
      this.dataSource.query(`SELECT gender, COUNT(*) AS count FROM babies GROUP BY gender`),
    ]);

    return {
      recordTypes: recordTypes.map((row) => ({ type: row.type, count: Number(row.count) })),
      babyGenders: babyGenders.map((row) => ({ gender: row.gender, count: Number(row.count) })),
    };
  }

  async getUsers(page: number, pageSize: number, keyword?: string) {
    const safePage = Math.max(Math.floor(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const whereClause = keyword ? 'WHERE u.nickname LIKE ?' : '';
    const likeParam = `%${keyword}%`;
    const params: any[] = keyword ? [likeParam] : [];

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params,
    );

    const rows = await this.dataSource.query(
      `SELECT u.id, u.nickname, u.avatar, u.open_id AS openId, u.created_at AS createdAt,
        (SELECT COUNT(*) FROM babies b WHERE b.user_id = u.id) AS babyCount,
        (SELECT COUNT(*) FROM records r INNER JOIN babies b ON b.id = r.baby_id WHERE b.user_id = u.id) AS recordCount
       FROM users u ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safePageSize, offset],
    );

    return {
      list: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        avatar: row.avatar,
        openId: row.openId ? `${String(row.openId).slice(0, 6)}****` : null,
        babyCount: Number(row.babyCount),
        recordCount: Number(row.recordCount),
        createdAt: row.createdAt,
      })),
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // 转化漏斗：注册 → 创建宝宝档案 → 产生首条记录
  async getFunnel() {
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(DISTINCT b.user_id) FROM babies b WHERE b.user_id IS NOT NULL) AS usersWithBaby,
        (SELECT COUNT(DISTINCT b.user_id) FROM babies b INNER JOIN records r ON r.baby_id = b.id) AS usersWithRecord
      `,
    );

    return {
      totalUsers: Number(row.totalUsers),
      usersWithBaby: Number(row.usersWithBaby),
      usersWithRecord: Number(row.usersWithRecord),
    };
  }

  // 新用户活跃情况：注册后 N 天内是否产生过记录
  async getRetention(days: number) {
    const safeDays = Math.min(Math.max(Math.floor(days) || 90, 7), 365);
    const getExactDay = async (offset: number) => {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) AS eligible,
          COALESCE(SUM(CASE WHEN
            EXISTS(
              SELECT 1 FROM records r INNER JOIN babies b ON b.id = r.baby_id
              WHERE COALESCE(r.actor_user_id, b.user_id) = u.id
                AND DATE(r.created_at) = DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
            ) OR EXISTS(
              SELECT 1 FROM user_events e WHERE e.user_id = u.id
                AND DATE(e.created_at) = DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
            ) THEN 1 ELSE 0 END), 0) AS returned
         FROM users u
         WHERE u.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           AND DATE(u.created_at) <= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
        [offset, offset, safeDays, offset],
      );
      return { eligible: Number(row.eligible), returned: Number(row.returned) };
    };
    const [d1, d7, d30] = await Promise.all([getExactDay(1), getExactDay(7), getExactDay(30)]);

    return {
      days: safeDays,
      cohortSize: d1.eligible,
      activeIn1Day: d1.returned,
      activeIn7Day: d7.returned,
      activeIn30Day: d30.returned,
      eligibleIn1Day: d1.eligible,
      eligibleIn7Day: d7.eligible,
      eligibleIn30Day: d30.eligible,
    };
  }

  async getEngagement() {
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(DISTINCT user_id) FROM subscription_grants WHERE accepted_count > 0) AS subscribedUsers,
        (SELECT COALESCE(SUM(available_count), 0) FROM subscription_grants) AS acceptedGrants,
        (SELECT COALESCE(SUM(rejected_count), 0) FROM subscription_grants) AS rejectedGrants,
        (SELECT COUNT(*) FROM notification_deliveries WHERE status = 'sent') AS sentMessages,
        (SELECT COUNT(*) FROM notification_deliveries WHERE status = 'failed') AS failedMessages,
        (SELECT COUNT(*) FROM user_events WHERE name = 'app_open' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekOpens,
        (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE name = 'app_open' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekOpenUsers`
    );
    const [openRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS notificationOpens, COUNT(DISTINCT user_id) AS notificationOpenUsers
       FROM user_events WHERE name = 'notification_open'`
    );
    return {
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])),
      notificationOpens: Number(openRow.notificationOpens),
      notificationOpenUsers: Number(openRow.notificationOpenUsers),
    };
  }

  // 疫苗提醒漏斗：授权 → 发送 → 点击，含错误码分布与近 7 天发送趋势
  async getVaccineFunnel() {
    const templateId = process.env.WECHAT_SUBSCRIBE_VACCINE_TEMPLATE_ID || '';
    if (!templateId) {
      return {
        configured: false,
        totalUsers: 0,
        subscribedUsers: 0,
        rejectedUsers: 0,
        authRate: 0,
        planBabies: 0,
        deliveries: 0,
        sent: 0,
        failed: 0,
        sendSuccessRate: 0,
        clicks: 0,
        clickUsers: 0,
        clickRate: 0,
        errorCodes: [],
        weekTrend: [],
      };
    }

    const pct = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

    const [userRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS totalUsers FROM users`,
    );
    const [grantRow] = await this.dataSource.query(
      `SELECT
        COUNT(DISTINCT CASE WHEN accepted_count > 0 THEN user_id END) AS subscribedUsers,
        COUNT(DISTINCT CASE WHEN rejected_count > 0 THEN user_id END) AS rejectedUsers
       FROM subscription_grants WHERE template_id = ?`,
      [templateId],
    );
    const [planRow] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT baby_id) AS planBabies FROM vaccine_plans`,
    );
    const [deliveryRow] = await this.dataSource.query(
      `SELECT
        COUNT(*) AS deliveries,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
       FROM notification_deliveries WHERE template_id = ?`,
      [templateId],
    );
    const errorRows = await this.dataSource.query(
      `SELECT COALESCE(wechat_code, 'unknown') AS code, COUNT(*) AS count
       FROM notification_deliveries
       WHERE template_id = ? AND status = 'failed'
       GROUP BY wechat_code ORDER BY count DESC LIMIT 8`,
      [templateId],
    );
    const [clickRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS clicks, COUNT(DISTINCT user_id) AS clickUsers
       FROM user_events
       WHERE name = 'notification_open'
         AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = 'notification_vaccine'`,
    );

    // 近 7 天发送趋势，缺失日期补 0
    const trendRows = await this.dataSource.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
       FROM notification_deliveries
       WHERE template_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY date`,
      [templateId],
    );
    const trendMap = new Map<string, { sent: number; failed: number }>(
      trendRows.map((row): [string, { sent: number; failed: number }] => [
        row.date,
        { sent: Number(row.sent), failed: Number(row.failed) },
      ]),
    );
    const weekTrend: { date: string; sent: number; failed: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.formatDate(d);
      const hit = trendMap.get(key) || { sent: 0, failed: 0 };
      weekTrend.push({ date: key, ...hit });
    }

    const totalUsers = Number(userRow.totalUsers);
    const subscribedUsers = Number(grantRow.subscribedUsers);
    const deliveries = Number(deliveryRow.deliveries);
    const sent = Number(deliveryRow.sent);
    const clicks = Number(clickRow.clicks);

    return {
      configured: true,
      totalUsers,
      subscribedUsers,
      rejectedUsers: Number(grantRow.rejectedUsers),
      authRate: pct(subscribedUsers, totalUsers),
      planBabies: Number(planRow.planBabies),
      deliveries,
      sent,
      failed: Number(deliveryRow.failed),
      sendSuccessRate: pct(sent, deliveries),
      clicks,
      clickUsers: Number(clickRow.clickUsers),
      clickRate: pct(clicks, sent),
      errorCodes: errorRows.map((row) => ({ code: row.code, count: Number(row.count) })),
      weekTrend,
    };
  }

  // 相册模块指标：总量、人均、近 7 天趋势、入口点击与上传成功率
  async getAlbumMetrics() {
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM photos) AS totalPhotos,
        (SELECT COUNT(DISTINCT b.user_id) FROM photos p INNER JOIN babies b ON b.id = p.baby_id) AS usersWithPhotos,
        (SELECT COUNT(*) FROM photos WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS photos7,
        (SELECT COUNT(*) FROM photos WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)) AS photos30,
        (SELECT COUNT(*) FROM user_events WHERE name = 'photo_add_click' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS entryClicks7,
        (SELECT COUNT(*) FROM user_events WHERE name = 'photo_add_click' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.from')) = 'home') AS entryClicks7FromHome,
        (SELECT COUNT(*) FROM user_events WHERE name = 'photo_upload' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND JSON_EXTRACT(properties, '$.success') = TRUE) AS uploadSuccess7,
        (SELECT COUNT(*) FROM user_events WHERE name = 'photo_upload' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND JSON_EXTRACT(properties, '$.success') = FALSE) AS uploadFail7
      `,
    );

    const photoRows = await this.dataSource.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
       FROM photos WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY date`,
    );
    const photoMap = new Map<string, number>(
      photoRows.map((row): [string, number] => [row.date, Number(row.count)]),
    );
    const today = new Date();
    const daily7: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.formatDate(d);
      daily7.push({ date: key, count: photoMap.get(key) ?? 0 });
    }

    const totalPhotos = Number(row.totalPhotos);
    const usersWithPhotos = Number(row.usersWithPhotos);
    const uploadSuccess7 = Number(row.uploadSuccess7);
    const uploadFail7 = Number(row.uploadFail7);

    return {
      totalPhotos,
      usersWithPhotos,
      avgPerUser: usersWithPhotos > 0 ? Math.round((totalPhotos / usersWithPhotos) * 10) / 10 : 0,
      photos7: Number(row.photos7),
      photos30: Number(row.photos30),
      daily7,
      entryClicks7: Number(row.entryClicks7),
      entryClicks7FromHome: Number(row.entryClicks7FromHome),
      uploadSuccess7,
      uploadFail7,
      uploadSuccessRate:
        uploadSuccess7 + uploadFail7 > 0
          ? Math.round((uploadSuccess7 / (uploadSuccess7 + uploadFail7)) * 1000) / 10
          : 0,
    };
  }

  private formatDate(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
