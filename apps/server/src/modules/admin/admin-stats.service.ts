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

  private formatDate(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
