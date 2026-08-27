import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const ACTIVE_USER_FROM = `
  FROM records r
  INNER JOIN babies b ON b.id = r.baby_id
`;

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
        (SELECT COUNT(DISTINCT b.user_id) ${ACTIVE_USER_FROM} WHERE DATE(r.created_at) = CURDATE()) AS todayActiveUsers,
        (SELECT COUNT(DISTINCT b.user_id) ${ACTIVE_USER_FROM} WHERE r.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekActiveUsers,
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
        `SELECT DATE_FORMAT(r.created_at, '%Y-%m-%d') AS date, COUNT(DISTINCT b.user_id) AS count
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

  private formatDate(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
