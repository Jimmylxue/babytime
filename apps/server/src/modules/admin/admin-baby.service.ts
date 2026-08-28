import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminBabyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getBabies(page: number, pageSize: number, keyword?: string, sort = 'active') {
    const safePage = Math.max(Math.floor(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const whereClause = keyword ? 'WHERE b.name LIKE ? OR u.nickname LIKE ?' : '';
    const likeParam = `%${keyword}%`;
    const whereParams: any[] = keyword ? [likeParam, likeParam] : [];

    // active: 最近有记录的排前面（从未有记录的排最后）
    const orderClause =
      sort === 'records'
        ? 'ORDER BY recordCount DESC, b.created_at DESC'
        : sort === 'created'
          ? 'ORDER BY b.created_at DESC'
          : 'ORDER BY lastRecordAt IS NULL, lastRecordAt DESC, b.created_at DESC';

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM babies b LEFT JOIN users u ON u.id = b.user_id ${whereClause}`,
      whereParams,
    );

    const rows = await this.dataSource.query(
      `SELECT b.id, b.name, b.gender, b.birthday, b.avatar, b.created_at AS createdAt,
        u.id AS parentUserId, u.nickname AS parentNickname, u.avatar AS parentAvatar,
        (SELECT COUNT(*) FROM records r WHERE r.baby_id = b.id) AS recordCount,
        (SELECT COUNT(*) FROM photos p WHERE p.baby_id = b.id) AS photoCount,
        (SELECT COUNT(*) FROM family_members fm WHERE fm.baby_id = b.id AND fm.status = 'accepted') AS familyCount,
        (SELECT MAX(r.start_time) FROM records r WHERE r.baby_id = b.id) AS lastRecordAt
       FROM babies b LEFT JOIN users u ON u.id = b.user_id
       ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...whereParams, safePageSize, offset],
    );

    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        gender: row.gender,
        birthday: row.birthday,
        avatar: row.avatar,
        parent: row.parentUserId
          ? { id: row.parentUserId, nickname: row.parentNickname, avatar: row.parentAvatar }
          : null,
        recordCount: Number(row.recordCount),
        photoCount: Number(row.photoCount),
        familyCount: Number(row.familyCount),
        lastRecordAt: row.lastRecordAt,
        createdAt: row.createdAt,
      })),
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async getBabyDetail(id: string) {
    const [baby] = await this.dataSource.query(
      `SELECT b.id, b.name, b.gender, b.birthday, b.avatar, b.created_at AS createdAt,
        u.id AS parentUserId, u.nickname AS parentNickname, u.avatar AS parentAvatar
       FROM babies b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
      [id],
    );
    if (!baby) {
      throw new NotFoundException('宝宝不存在');
    }

    const [counts] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM records r WHERE r.baby_id = ?) AS recordCount,
        (SELECT COUNT(*) FROM photos p WHERE p.baby_id = ?) AS photoCount,
        (SELECT COUNT(*) FROM family_members fm WHERE fm.baby_id = ? AND fm.status = 'accepted') AS familyCount,
        (SELECT MIN(r.start_time) FROM records r WHERE r.baby_id = ?) AS firstRecordAt,
        (SELECT MAX(r.start_time) FROM records r WHERE r.baby_id = ?) AS lastRecordAt`,
      [id, id, id, id, id],
    );

    const [recordTypes, familyMembers, recentRecords, aiAnalyses] = await Promise.all([
      this.dataSource.query(
        `SELECT type, COUNT(*) AS count FROM records WHERE baby_id = ? GROUP BY type`,
        [id],
      ),
      this.dataSource.query(
        `SELECT fm.role, fm.status, fm.created_at AS createdAt,
          u.id AS userId, u.nickname, u.avatar
         FROM family_members fm LEFT JOIN users u ON u.id = fm.user_id
         WHERE fm.baby_id = ?
         ORDER BY fm.created_at DESC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT id, type, start_time AS startTime, end_time AS endTime, duration, amount, note
         FROM records WHERE baby_id = ?
         ORDER BY start_time DESC LIMIT 20`,
        [id],
      ),
      this.dataSource.query(
        `SELECT id, start_time AS startTime, diaper_analysis AS analysis
         FROM records
         WHERE baby_id = ? AND diaper_analysis IS NOT NULL
         ORDER BY start_time DESC LIMIT 20`,
        [id],
      ),
    ]);

    return {
      baby: {
        id: baby.id,
        name: baby.name,
        gender: baby.gender,
        birthday: baby.birthday,
        avatar: baby.avatar,
        createdAt: baby.createdAt,
        parent: baby.parentUserId
          ? { id: baby.parentUserId, nickname: baby.parentNickname, avatar: baby.parentAvatar }
          : null,
      },
      stats: {
        recordCount: Number(counts.recordCount),
        photoCount: Number(counts.photoCount),
        familyCount: Number(counts.familyCount),
        firstRecordAt: counts.firstRecordAt,
        lastRecordAt: counts.lastRecordAt,
      },
      recordTypes: recordTypes.map((row) => ({ type: row.type, count: Number(row.count) })),
      familyMembers: familyMembers.map((row) => ({
        userId: row.userId,
        nickname: row.nickname,
        avatar: row.avatar,
        role: row.role,
        status: row.status,
        createdAt: row.createdAt,
      })),
      recentRecords: recentRecords.map((row) => ({
        id: row.id,
        type: row.type,
        startTime: row.startTime,
        endTime: row.endTime,
        duration: row.duration == null ? null : Number(row.duration),
        amount: row.amount == null ? null : Number(row.amount),
        note: row.note,
      })),
      aiAnalyses: aiAnalyses.map((row) => ({
        id: row.id,
        startTime: row.startTime,
        analysis: typeof row.analysis === 'string' ? JSON.parse(row.analysis) : row.analysis,
      })),
    };
  }
}
