import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CdnCleanupService } from '../upload/cdn-cleanup.service';

/** 不可逆操作：接口必须原样带上确认词，脚本打错参数不至于删掉一个真实用户 */
const CONFIRM_WORD = '注销';

/**
 * 「他名下的宝宝」统一用这个子查询表达：带 baby_id 外键的表都用它界定范围，
 * 顺带绕开「一个宝宝都没有」时 `IN ()` 的语法错误。
 */
const OWNED_BABIES = '(SELECT id FROM babies WHERE user_id = ?)';

/**
 * 本服务的每条语句占位符填的都是同一个 userId，按 ? 的个数生成参数即可，
 * 避免十几处手写参数表错位（错一位就是删错人）。
 */
const scoped = (sql: string, userId: string) =>
  new Array((sql.match(/\?/g) || []).length).fill(userId);

@Injectable()
export class AdminUserDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cleanup: CdnCleanupService,
  ) {}

  /** 删除前预览：把「会删掉什么、影响到谁」摊开给管理员看，也是真正删除时写审计日志的同一份数据 */
  async getPlan(userId: string) {
    const user = await this.findUser(userId);
    const babies = await this.dataSource.query(
      `SELECT id, name, birthday, avatar FROM babies WHERE user_id = ? ORDER BY created_at`,
      [userId],
    );
    const counts = await this.countScoped(userId);
    const images = await this.collectImages(user);
    const impact = await this.loadImpact(userId);

    return {
      confirmWord: CONFIRM_WORD,
      user: {
        id: user.id,
        nickname: user.nickname,
        openId: user.openId ? `${String(user.openId).slice(0, 6)}****` : null,
        createdAt: user.createdAt,
      },
      babies: babies.map((baby) => ({
        id: baby.id,
        name: baby.name,
        birthday: baby.birthday,
      })),
      counts: { ...counts, images: images.length },
      impact,
    };
  }

  async delete(
    userId: string,
    adminUsername: string,
    clientIp: string | null,
    confirm?: string,
  ) {
    if (confirm !== CONFIRM_WORD) {
      throw new BadRequestException(`请在确认框中输入「${CONFIRM_WORD}」`);
    }
    const user = await this.findUser(userId);
    const counts = await this.countScoped(userId);
    const images = await this.collectImages(user);
    // 审计与响应报同一份数字，事后对账时不会被两套口径绕晕
    const deleted = { ...counts, images: images.length };

    await this.dataSource.transaction(async (manager) => {
      // 1) 他在别人家宝宝上记的记录/打卡留给那个家庭，只把作者置空。
      //    不置空的话，活跃统计里的 COALESCE(r.actor_user_id, b.user_id) 会把已注销用户算成一个活跃用户。
      await manager.query(
        `UPDATE records SET actor_user_id = NULL
         WHERE actor_user_id = ? AND baby_id NOT IN ${OWNED_BABIES}`,
        [userId, userId],
      );
      await manager.query(
        `UPDATE baby_milestones SET actor_user_id = NULL
         WHERE actor_user_id = ? AND baby_id NOT IN ${OWNED_BABIES}`,
        [userId, userId],
      );

      // 2) 名下的流水与素材（baby_id 外键是 NO ACTION，必须先于 babies 删）
      await manager.query(`DELETE FROM records WHERE baby_id IN ${OWNED_BABIES}`, [userId]);
      await manager.query(`DELETE FROM photos WHERE baby_id IN ${OWNED_BABIES}`, [userId]);
      await manager.query(
        `DELETE FROM baby_milestones WHERE baby_id IN ${OWNED_BABIES}`,
        [userId],
      );
      await manager.query(
        `DELETE FROM vaccine_plans WHERE baby_id IN ${OWNED_BABIES}`,
        [userId],
      );

      // 3) 家庭关系：他发出的邀请、他在任何家庭的成员行（含别人创建的家庭，注销后他不再是家人）、
      //    以及涉及他的备注名（他自己起的 + 别人给他起的，人都没了留着只会指向空账号）
      await manager.query(
        `DELETE FROM family_invites WHERE inviter_id = ? OR baby_id IN ${OWNED_BABIES}`,
        [userId, userId],
      );
      await manager.query(
        `DELETE FROM family_members WHERE inviter_id = ? OR user_id = ? OR baby_id IN ${OWNED_BABIES}`,
        [userId, userId, userId],
      );
      await manager.query(
        `DELETE FROM family_member_aliases WHERE family_owner_id = ? OR target_user_id = ?`,
        [userId, userId],
      );

      // 4) 宝宝档案
      await manager.query(`DELETE FROM babies WHERE user_id = ?`, [userId]);

      // 5) 订阅额度、推送明细、埋点
      await manager.query(`DELETE FROM notification_deliveries WHERE user_id = ?`, [userId]);
      await manager.query(`DELETE FROM subscription_grants WHERE user_id = ?`, [userId]);
      await manager.query(`DELETE FROM user_events WHERE user_id = ?`, [userId]);

      // 6) 账号本身（open_id 唯一索引随之释放，本人日后可以从头注册一个新账号）
      await manager.query(`DELETE FROM users WHERE id = ?`, [userId]);
    });

    // 事务提交后再删图：CdnCleanupService 要回查全库引用，行还在的时候删会误伤共用图片
    this.cleanup.scheduleDelete(images);

    // 审计只留脱敏后的标识 + 删除量，注销完的库里不该再存他的 openId
    await this.dataSource.query(
      `INSERT INTO admin_audit_logs
        (id, admin_username, action, target_type, target_id, detail, client_ip, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
      [
        adminUsername,
        'delete_user',
        'user',
        userId,
        JSON.stringify({
          nickname: user.nickname,
          openIdPrefix: String(user.openId || '').slice(0, 6),
          counts: deleted,
        }),
        clientIp,
      ],
    );

    return { success: true, nickname: user.nickname, counts: deleted };
  }

  private async findUser(userId: string) {
    const [user] = await this.dataSource.query(
      `SELECT id, nickname, avatar, open_id AS openId, created_at AS createdAt FROM users WHERE id = ?`,
      [userId],
    );
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  private async countScoped(userId: string) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM babies WHERE user_id = ?) AS babies,
        (SELECT COUNT(*) FROM records WHERE baby_id IN ${OWNED_BABIES}) AS records,
        (SELECT COUNT(*) FROM photos WHERE baby_id IN ${OWNED_BABIES}) AS photos,
        (SELECT COUNT(*) FROM baby_milestones WHERE baby_id IN ${OWNED_BABIES}) AS milestones,
        (SELECT COUNT(*) FROM vaccine_plans WHERE baby_id IN ${OWNED_BABIES}) AS vaccinePlans,
        (SELECT COUNT(*) FROM family_invites WHERE inviter_id = ? OR baby_id IN ${OWNED_BABIES}) AS invites,
        (SELECT COUNT(*) FROM family_members WHERE baby_id IN ${OWNED_BABIES}) AS familyMembers,
        (SELECT COUNT(*) FROM family_members
         WHERE user_id = ? AND baby_id NOT IN ${OWNED_BABIES}) AS joinedFamilies,
        (SELECT COUNT(*) FROM family_member_aliases WHERE family_owner_id = ? OR target_user_id = ?) AS aliases,
        (SELECT COUNT(*) FROM notification_deliveries WHERE user_id = ?) AS deliveries,
        (SELECT COUNT(*) FROM subscription_grants WHERE user_id = ?) AS grants,
        (SELECT COUNT(*) FROM user_events WHERE user_id = ?) AS events,
        (SELECT COUNT(*) FROM records WHERE actor_user_id = ? AND baby_id NOT IN ${OWNED_BABIES}) AS externalRecords,
        (SELECT COUNT(*) FROM baby_milestones
         WHERE actor_user_id = ? AND baby_id NOT IN ${OWNED_BABIES}) AS externalMilestones
    `;
    const [row] = await this.dataSource.query(sql, scoped(sql, userId));
    const num = (key: string) => Number(row[key]);
    return {
      babies: num('babies'),
      records: num('records'),
      photos: num('photos'),
      milestones: num('milestones'),
      vaccinePlans: num('vaccinePlans'),
      invites: num('invites'),
      familyMembers: num('familyMembers'),
      joinedFamilies: num('joinedFamilies'),
      aliases: num('aliases'),
      deliveries: num('deliveries'),
      grants: num('grants'),
      events: num('events'),
      externalActorRows: num('externalRecords') + num('externalMilestones'),
    };
  }

  /** 名下所有图片地址。预览与删除走同一个方法，两边报出来的数字才对得上 */
  private async collectImages(user: { id: string; avatar: string | null }): Promise<string[]> {
    const sql = `
      SELECT url AS url FROM photos WHERE baby_id IN ${OWNED_BABIES} AND url IS NOT NULL
      UNION ALL SELECT thumbnail FROM photos WHERE baby_id IN ${OWNED_BABIES} AND thumbnail IS NOT NULL
      UNION ALL SELECT photo_url FROM baby_milestones WHERE baby_id IN ${OWNED_BABIES} AND photo_url IS NOT NULL
      UNION ALL SELECT diaper_image FROM records WHERE baby_id IN ${OWNED_BABIES} AND diaper_image IS NOT NULL
      UNION ALL SELECT avatar FROM babies WHERE user_id = ? AND avatar IS NOT NULL
    `;
    const rows: { url: string }[] = await this.dataSource.query(sql, scoped(sql, user.id));
    return [user.avatar, ...rows.map((row) => row.url)].filter((url): url is string => !!url);
  }

  private async loadImpact(userId: string) {
    const [shared] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT user_id) AS n FROM family_members
       WHERE user_id IS NOT NULL AND user_id <> ? AND status = 'accepted'
         AND baby_id IN ${OWNED_BABIES}`,
      [userId, userId],
    );
    const joinedRows = await this.dataSource.query(
      `SELECT b.name AS babyName, u.nickname AS ownerNickname
       FROM family_members fm
       LEFT JOIN babies b ON b.id = fm.baby_id
       LEFT JOIN users u ON u.id = fm.inviter_id
       WHERE fm.user_id = ? AND fm.baby_id NOT IN ${OWNED_BABIES}
       ORDER BY fm.created_at`,
      [userId, userId],
    );
    return {
      // 他创建的家庭里还有其他已加入的家人：注销后这些人一并失去对宝宝的访问
      sharedMemberUsers: Number(shared.n),
      joinedFamilies: joinedRows.map((row) => ({
        babyName: row.babyName || '（宝宝已删除）',
        ownerNickname: row.ownerNickname || '未知创建者',
      })),
    };
  }
}
