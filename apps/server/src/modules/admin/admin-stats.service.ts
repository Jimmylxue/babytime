import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const ACTIVE_USER_FROM = `
  FROM records r
  INNER JOIN babies b ON b.id = r.baby_id
`;
const ACTIVE_USER_ID = 'COALESCE(r.actor_user_id, b.user_id)';

/**
 * 「今天」一律写成半开区间。DATE(created_at) = CURDATE() 把列包进了函数，
 * created_at 上的索引会直接失效，看板上每一个今日指标都变成全表扫。
 */
const isToday = (column = 'created_at') =>
  `${column} >= CURDATE() AND ${column} < CURDATE() + INTERVAL 1 DAY`;

/** 看板数据分钟级新鲜度就够看，但每个端点每次都要重跑十几个聚合子查询 */
const STATS_CACHE_TTL_MS = 60 * 1000;

@Injectable()
export class AdminStatsService {
  /**
   * 进程内 TTL 缓存（照抄 OpsHealthService 的做法）。存的是 Promise 而不是结果：
   * 看板打开时并发打来的同一端点只会真正查一次库，失败则立刻丢弃、不缓存 60 秒的错误。
   * 只缓存聚合端点，/admin/users 那类带分页与搜索的不缓存。
   */
  private readonly cache = new Map<string, { at: number; pending: Promise<unknown> }>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < STATS_CACHE_TTL_MS) return hit.pending as Promise<T>;
    const pending = loader().catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { at: Date.now(), pending });
    return pending;
  }

  getOverview() {
    return this.cached('overview', () => this.loadOverview());
  }

  private async loadOverview() {
    // 疫苗订阅模板未配置时，模板 ID 用空串匹配不到任何行，统计自然为 0。
    const vaccineTemplateId = process.env.WECHAT_SUBSCRIBE_VACCINE_TEMPLATE_ID || '';
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE ${isToday()}) AS todayUsers,
        (SELECT COUNT(*) FROM babies) AS totalBabies,
        (SELECT COUNT(*) FROM babies WHERE ${isToday()}) AS todayBabies,
        (SELECT COUNT(*) FROM records) AS totalRecords,
        (SELECT COUNT(*) FROM records WHERE ${isToday()}) AS todayRecords,
        (SELECT COUNT(DISTINCT ${ACTIVE_USER_ID}) ${ACTIVE_USER_FROM} WHERE ${isToday('r.created_at')}) AS todayActiveUsers,
        (SELECT COUNT(DISTINCT ${ACTIVE_USER_ID}) ${ACTIVE_USER_FROM} WHERE r.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekActiveUsers,
        (SELECT COUNT(*) FROM photos) AS totalPhotos,
        (SELECT COUNT(*) FROM family_members WHERE status = 'accepted') AS familyMembers,
        (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS weekNewUsers,
        (SELECT COUNT(DISTINCT user_id) FROM subscription_grants WHERE template_id = ? AND accepted_count > 0) AS vaccineSubscribedUsers,
        (SELECT COUNT(DISTINCT user_id) FROM subscription_grants WHERE template_id = ? AND available_count > 0) AS vaccineAvailableUsers
      `,
      [vaccineTemplateId, vaccineTemplateId],
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
      totalPhotos: Number(row.totalPhotos),
      familyMembers: Number(row.familyMembers),
      // 订阅过疫苗提醒的人数（累计授权 ≥1 次的去重用户）与当前仍有可发送额度的用户数
      vaccineSubscribedUsers: Number(row.vaccineSubscribedUsers),
      vaccineAvailableUsers: Number(row.vaccineAvailableUsers),
      vaccineConfigured: Boolean(vaccineTemplateId),
    };
  }

  getTrends(days: number) {
    // 先归一再当缓存键：否则 days 是任意数字，Map 会被无界的键撑大
    const safeDays = Math.min(Math.max(Math.floor(days) || 30, 1), 90);
    return this.cached(`trends:${safeDays}`, () => this.loadTrends(safeDays));
  }

  private async loadTrends(safeDays: number) {
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

  getDistribution() {
    return this.cached('distribution', () => this.loadDistribution());
  }

  private async loadDistribution() {
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
        u.acquisition_source AS acquisitionSource,
        (SELECT COUNT(*) FROM babies b WHERE b.user_id = u.id) AS babyCount,
        (SELECT COUNT(*) FROM records r INNER JOIN babies b ON b.id = r.baby_id WHERE b.user_id = u.id) AS recordCount
       FROM users u ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safePageSize, offset],
    );

    // 按来源汇总：光有一列看不出「纪念册到底带来多少人」，这里给个总数
    const sourceRows = await this.dataSource.query(
      `SELECT acquisition_source AS source, COUNT(*) AS count FROM users GROUP BY acquisition_source`,
    );
    const sourceCounts = sourceRows.map((row) => ({
      source: row.source || null,
      count: Number(row.count),
    }));

    return {
      list: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        avatar: row.avatar,
        openId: row.openId ? `${String(row.openId).slice(0, 6)}****` : null,
        acquisitionSource: row.acquisitionSource || null,
        babyCount: Number(row.babyCount),
        recordCount: Number(row.recordCount),
        createdAt: row.createdAt,
      })),
      sourceCounts,
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // 用户名下宝宝列表（用户列表点「宝宝数」弹窗用）
  async getUserBabies(userId: string) {
    const [user] = await this.dataSource.query(`SELECT id FROM users WHERE id = ?`, [userId]);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const rows = await this.dataSource.query(
      `SELECT id, name, gender, birthday, avatar, created_at AS createdAt
       FROM babies WHERE user_id = ?
       ORDER BY created_at`,
      [userId],
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        gender: row.gender,
        birthday: row.birthday,
        avatar: row.avatar,
        createdAt: row.createdAt,
      })),
    };
  }

  // 转化漏斗：注册 → 创建宝宝档案 → 产生首条记录
  getFunnel() {
    return this.cached('funnel', () => this.loadFunnel());
  }

  private async loadFunnel() {
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
  getRetention(days: number) {
    const safeDays = Math.min(Math.max(Math.floor(days) || 90, 7), 365);
    return this.cached(`retention:${safeDays}`, () => this.loadRetention(safeDays));
  }

  private async loadRetention(safeDays: number) {
    const getExactDay = async (offset: number) => {
      // 三处 DATE(列) = ... 全部换成半开区间，理由同 isToday：包了函数索引就用不上。
      // 这里尤其值：user_events 新建的 (user_id, created_at) 就是为这条相关子查询准备的，
      // 写成 DATE(e.created_at) 的话它只剩 user_id 前缀能用，等于白建。
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) AS eligible,
          COALESCE(SUM(CASE WHEN
            EXISTS(
              SELECT 1 FROM records r INNER JOIN babies b ON b.id = r.baby_id
              WHERE COALESCE(r.actor_user_id, b.user_id) = u.id
                AND r.created_at >= DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
                AND r.created_at < DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
            ) OR EXISTS(
              SELECT 1 FROM user_events e WHERE e.user_id = u.id
                AND e.created_at >= DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
                AND e.created_at < DATE_ADD(DATE(u.created_at), INTERVAL ? DAY)
            ) THEN 1 ELSE 0 END), 0) AS returned
         FROM users u
         WHERE u.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           AND u.created_at < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL ? DAY), INTERVAL 1 DAY)`,
        [offset, offset + 1, offset, offset + 1, safeDays, offset],
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

  getEngagement() {
    return this.cached('engagement', () => this.loadEngagement());
  }

  private async loadEngagement() {
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
  getVaccineFunnel() {
    return this.cached('vaccine-funnel', () => this.loadVaccineFunnel());
  }

  private async loadVaccineFunnel() {
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
  getAlbumMetrics() {
    return this.cached('album', () => this.loadAlbumMetrics());
  }

  private async loadAlbumMetrics() {
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

  // 小应用（应用 tab）使用情况。埋点：tools_hub_view（应用页访问）、
  // tool_click（宫格点击，properties.name）、tool_view（工具页到达，properties.name）、
  // stool_analyze_click（发起便便识别）。按 properties.name 分组聚合，
  // 后续新增小应用不需要改这里就会自动出现在列表中。
  getToolsMetrics() {
    return this.cached('tools', () => this.loadToolsMetrics());
  }

  private async loadToolsMetrics() {
    const [summary] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM user_events WHERE name = 'tools_hub_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS hubViews7,
        (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE name = 'tools_hub_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS hubUsers7,
        (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE name = 'tool_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS toolUsers7,
        (SELECT COUNT(DISTINCT ${ACTIVE_USER_ID}) ${ACTIVE_USER_FROM} WHERE r.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS activeUsers7
      `,
    );

    const extractApp = `JSON_UNQUOTE(JSON_EXTRACT(properties, '$.name'))`;
    const [clickRows, openRows7, userRows30, hubDailyRows, openDailyRows] = await Promise.all([
      this.dataSource.query(
        `SELECT ${extractApp} AS app, COUNT(*) AS count, COUNT(DISTINCT user_id) AS users
         FROM user_events
         WHERE name = 'tool_click' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND ${extractApp} IS NOT NULL
         GROUP BY app`,
      ),
      this.dataSource.query(
        `SELECT ${extractApp} AS app, COUNT(*) AS count, COUNT(DISTINCT user_id) AS users
         FROM user_events
         WHERE name = 'tool_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND ${extractApp} IS NOT NULL
         GROUP BY app`,
      ),
      this.dataSource.query(
        `SELECT ${extractApp} AS app, COUNT(DISTINCT user_id) AS users
         FROM user_events
         WHERE name = 'tool_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND ${extractApp} IS NOT NULL
         GROUP BY app`,
      ),
      this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
         FROM user_events WHERE name = 'tools_hub_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
         GROUP BY date`,
      ),
      this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
         FROM user_events WHERE name = 'tool_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
         GROUP BY date`,
      ),
    ]);

    const TOOL_LABELS: Record<string, string> = {
      age_calc: '月龄计算器',
      vaccine_table: '疫苗接种时间表',
      milk_calc: '奶量估算器',
    };

    const clickMap = new Map<string, { count: number; users: number }>(
      clickRows.map((row): [string, { count: number; users: number }] => [
        row.app,
        { count: Number(row.count), users: Number(row.users) },
      ]),
    );
    const openMap7 = new Map<string, { count: number; users: number }>(
      openRows7.map((row): [string, { count: number; users: number }] => [
        row.app,
        { count: Number(row.count), users: Number(row.users) },
      ]),
    );
    const userMap30 = new Map<string, number>(
      userRows30.map((row): [string, number] => [row.app, Number(row.users)]),
    );

    // 点击与到达取并集，排序按近 7 天打开次数降序；已下线的便便 AI 不再出现在明细里
    const appKeys = Array.from(new Set([...clickMap.keys(), ...openMap7.keys()])).filter(
      (key) => key !== 'stool_ai',
    );
    const apps = appKeys
      .map((key) => {
        const click = clickMap.get(key) ?? { count: 0, users: 0 };
        const open = openMap7.get(key) ?? { count: 0, users: 0 };
        return {
          key,
          label: TOOL_LABELS[key] ?? key,
          clicks7: click.count,
          clickUsers7: click.users,
          opens7: open.count,
          openUsers7: open.users,
          users30: userMap30.get(key) ?? 0,
          openRate: click.count > 0 ? Math.round((open.count / click.count) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.opens7 - a.opens7 || b.clicks7 - a.clicks7);

    const hubDailyMap = new Map<string, number>(
      hubDailyRows.map((row): [string, number] => [row.date, Number(row.count)]),
    );
    const openDailyMap = new Map<string, number>(
      openDailyRows.map((row): [string, number] => [row.date, Number(row.count)]),
    );
    const today = new Date();
    const daily14: { date: string; hubViews: number; opens: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.formatDate(d);
      daily14.push({
        date: key,
        hubViews: hubDailyMap.get(key) ?? 0,
        opens: openDailyMap.get(key) ?? 0,
      });
    }

    const hubUsers7 = Number(summary.hubUsers7);
    const toolUsers7 = Number(summary.toolUsers7);
    const activeUsers7 = Number(summary.activeUsers7);

    return {
      hubViews7: Number(summary.hubViews7),
      hubUsers7,
      toolUsers7,
      activeUsers7,
      // 使用率＝近 7 天打开过任一小应用的用户 / 近 7 天活跃用户（活跃口径同数据看板：产生过记录的用户）
      usageRate: activeUsers7 > 0 ? Math.round((toolUsers7 / activeUsers7) * 1000) / 10 : 0,
      apps,
      daily14,
    };
  }

  // 成长里程碑：有没有人在用、用了多少、谁在用。
  // 打卡事实取 baby_milestones；页面访问 / 海报分享 / 删除行为取 user_events。
  // 打卡用户按 actor_user_id 归属（家人代记算实际打卡人），注销账号后作者会被置空。
  getMilestoneMetrics(days: number) {
    const safeDays = Math.min(Math.max(Math.floor(days) || 30, 7), 90);
    return this.cached(`milestones:${safeDays}`, () => this.loadMilestoneMetrics(safeDays));
  }

  private async loadMilestoneMetrics(safeDays: number) {
    const pct = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
    const round1 = (value: number) => Math.round(value * 10) / 10;
    const weekStart = 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
    const monthStart = 'DATE_SUB(CURDATE(), INTERVAL 29 DAY)';

    const [row] = await this.dataSource.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT actor_user_id) AS users,
        COUNT(DISTINCT baby_id) AS babies,
        COALESCE(SUM(${isToday()}), 0) AS today,
        COALESCE(SUM(created_at >= ${weekStart}), 0) AS weekNew,
        COALESCE(SUM(created_at >= ${monthStart}), 0) AS monthNew,
        COALESCE(SUM(is_custom = 1), 0) AS customCount,
        COALESCE(SUM(photo_url IS NOT NULL), 0) AS photoCount,
        COALESCE(SUM(actor_user_id IS NULL), 0) AS deletedActorCount,
        COUNT(DISTINCT CASE WHEN created_at >= ${weekStart} THEN actor_user_id END) AS users7,
        COUNT(DISTINCT CASE WHEN created_at >= ${monthStart} THEN actor_user_id END) AS users30,
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM babies) AS totalBabies
      FROM baby_milestones`,
    );

    const [trendRows, categoryRows, topRows, actions] = await Promise.all([
      this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
                COUNT(*) AS count,
                COUNT(DISTINCT actor_user_id) AS users
         FROM baby_milestones
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
        [safeDays - 1],
      ),
      this.dataSource.query(
        `SELECT category, COUNT(*) AS count, COUNT(DISTINCT actor_user_id) AS users
         FROM baby_milestones
         GROUP BY category
         ORDER BY count DESC`,
      ),
      this.dataSource.query(
        `SELECT COALESCE(code, 'custom') AS code,
                MAX(CASE WHEN code IS NULL THEN '自定义里程碑' ELSE title END) AS title,
                COUNT(*) AS count,
                COUNT(DISTINCT actor_user_id) AS users,
                COALESCE(SUM(photo_url IS NOT NULL), 0) AS photoCount
         FROM baby_milestones
         GROUP BY COALESCE(code, 'custom')
         ORDER BY count DESC
         LIMIT 12`,
      ),
      this.loadMilestoneActions(),
    ]);

    const trendMap = new Map<string, { count: number; users: number }>(
      trendRows.map((item): [string, { count: number; users: number }] => [
        item.date,
        { count: Number(item.count), users: Number(item.users) },
      ]),
    );
    const today = new Date();
    const daily: { date: string; count: number; users: number }[] = [];
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.formatDate(d);
      const hit = trendMap.get(key) || { count: 0, users: 0 };
      daily.push({ date: key, ...hit });
    }

    const total = Number(row.total);
    const users = Number(row.users);
    const babies = Number(row.babies);
    const weekNew = Number(row.weekNew);
    const monthNew = Number(row.monthNew);
    const customCount = Number(row.customCount);
    const photoCount = Number(row.photoCount);
    const users7 = Number(row.users7);
    const users30 = Number(row.users30);
    const totalUsers = Number(row.totalUsers);
    const totalBabies = Number(row.totalBabies);

    return {
      total,
      users,
      babies,
      today: Number(row.today),
      weekNew,
      monthNew,
      customCount,
      photoCount,
      deletedActorCount: Number(row.deletedActorCount),
      users7,
      users30,
      totalUsers,
      totalBabies,
      userCoverageRate: pct(users, totalUsers),
      babyCoverageRate: pct(babies, totalBabies),
      avgPerBaby: babies > 0 ? round1(total / babies) : 0,
      customRate: pct(customCount, total),
      photoRate: pct(photoCount, total),
      daily,
      categories: categoryRows.map((item) => ({
        key: item.category,
        count: Number(item.count),
        users: Number(item.users),
      })),
      top: topRows.map((item) => ({
        code: item.code,
        title: item.title,
        count: Number(item.count),
        users: Number(item.users),
        photoCount: Number(item.photoCount),
      })),
      funnel: {
        ...actions,
        checkIns7: weekNew,
        checkInUsers7: users7,
        conversionRate7: pct(users7, actions.viewUsers7),
      },
    };
  }

  // 里程碑页的行为漏斗（近 7 天）：页面访问 → 打卡 → 海报分享 / 删除
  private async loadMilestoneActions() {
    const weekStart = 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM user_events WHERE name = 'milestone_view' AND created_at >= ${weekStart}) AS views7,
        (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE name = 'milestone_view' AND created_at >= ${weekStart}) AS viewUsers7,
        (SELECT COUNT(*) FROM user_events WHERE name = 'milestone_poster_share' AND created_at >= ${weekStart}) AS posterShares7,
        (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE name = 'milestone_poster_share' AND created_at >= ${weekStart}) AS posterUsers7,
        (SELECT COUNT(*) FROM user_events WHERE name = 'milestone_deleted' AND created_at >= ${weekStart}) AS deletes7`,
    );
    return {
      views7: Number(row.views7),
      viewUsers7: Number(row.viewUsers7),
      posterShares7: Number(row.posterShares7),
      posterUsers7: Number(row.posterUsers7),
      deletes7: Number(row.deletes7),
    };
  }

  // 使用用户明细：按实际打卡人聚合，附带其打过卡的宝宝（可跳宝宝详情）
  async getMilestoneUsage(page: number, pageSize: number, keyword?: string, sort?: string) {
    const safePage = Math.max(Math.floor(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;
    const kw = keyword?.trim();
    const whereClause = kw ? 'WHERE (u.nickname LIKE ? OR b.name LIKE ?)' : '';
    const params: any[] = kw ? [`%${kw}%`, `%${kw}%`] : [];
    const orderClause =
      sort === 'count' ? 'milestoneCount DESC, lastAt DESC' : 'lastAt DESC, milestoneCount DESC';

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT COALESCE(m.actor_user_id, '__deleted__')) AS total
       FROM baby_milestones m
       INNER JOIN babies b ON b.id = m.baby_id
       LEFT JOIN users u ON u.id = m.actor_user_id
       ${whereClause}`,
      params,
    );

    const rows = await this.dataSource.query(
      `SELECT
        MAX(m.actor_user_id) AS userId,
        MAX(u.nickname) AS nickname,
        MAX(u.open_id) AS openId,
        COUNT(*) AS milestoneCount,
        COALESCE(SUM(m.is_custom = 1), 0) AS customCount,
        COUNT(DISTINCT m.baby_id) AS babyCount,
        MIN(m.created_at) AS firstAt,
        MAX(m.created_at) AS lastAt
       FROM baby_milestones m
       INNER JOIN babies b ON b.id = m.baby_id
       LEFT JOIN users u ON u.id = m.actor_user_id
       ${whereClause}
       GROUP BY COALESCE(m.actor_user_id, '__deleted__')
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, safePageSize, offset],
    );

    const userIds = rows
      .map((row) => row.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const hasDeleted = rows.some((row) => !row.userId);
    const babiesByUser = new Map<string, { id: string; name: string; count: number }[]>();

    if (rows.length > 0) {
      const scope: string[] = [];
      const scopeParams: any[] = [];
      if (userIds.length > 0) {
        scope.push(`m.actor_user_id IN (${userIds.map(() => '?').join(',')})`);
        scopeParams.push(...userIds);
      }
      if (hasDeleted) scope.push('m.actor_user_id IS NULL');

      const babyWhere = `${whereClause ? `${whereClause} AND ` : 'WHERE '}(${scope.join(' OR ')})`;
      const babyRows = await this.dataSource.query(
        `SELECT COALESCE(m.actor_user_id, '__deleted__') AS userKey,
                b.id AS babyId,
                b.name AS babyName,
                COUNT(*) AS count
         FROM baby_milestones m
         INNER JOIN babies b ON b.id = m.baby_id
         LEFT JOIN users u ON u.id = m.actor_user_id
         ${babyWhere}
         GROUP BY COALESCE(m.actor_user_id, '__deleted__'), b.id, b.name
         ORDER BY count DESC`,
        [...params, ...scopeParams],
      );
      babyRows.forEach((item) => {
        const list = babiesByUser.get(item.userKey) ?? [];
        list.push({ id: item.babyId, name: item.babyName, count: Number(item.count) });
        babiesByUser.set(item.userKey, list);
      });
    }

    return {
      list: rows.map((row) => ({
        userId: row.userId || null,
        nickname: row.nickname || null,
        openId: row.openId ? `${String(row.openId).slice(0, 6)}****` : null,
        count: Number(row.milestoneCount),
        customCount: Number(row.customCount),
        babyCount: Number(row.babyCount),
        firstAt: row.firstAt,
        lastAt: row.lastAt,
        babies: babiesByUser.get(row.userId || '__deleted__') ?? [],
      })),
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }
}
