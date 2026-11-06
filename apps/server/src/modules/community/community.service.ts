import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Moment } from '../photo/entities/moment.entity';
import { Photo } from '../photo/entities/photo.entity';
import { User } from '../user/entities/user.entity';
import { MomentLike } from './entities/moment-like.entity';
import { MomentComment } from './entities/moment-comment.entity';
import { CommunityReport, ReportStatus } from './entities/community-report.entity';
import { CreateMomentCommentDto } from './dto/create-comment.dto';
import { ReportCommunityContentDto } from './dto/report-community-content.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ContentSecurityService } from '../content-security/content-security.service';
import { RateLimitService } from '../../common/rate-limit.service';

const COMMENT_PAGE_LIMIT = 500;

type PostRow = {
  id: string;
  content: string | null;
  createdAt: Date;
  authorId: string;
  nickname: string | null;
  avatar: string | null;
  likeCount: number | string;
  commentCount: number | string;
  likedByMe: number | boolean;
};

export interface CommunityCommentNode {
  id: string;
  content: string;
  createdAt: Date;
  author: { nickname: string; avatar: string | null };
  canDelete: boolean;
  parentId: string | null;
  replyToNickname: string | null;
  replies: CommunityCommentNode[];
  status?: string;
}

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(Moment)
    private readonly momentRepository: Repository<Moment>,
    @InjectRepository(Photo)
    private readonly photoRepository: Repository<Photo>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MomentLike)
    private readonly likeRepository: Repository<MomentLike>,
    @InjectRepository(MomentComment)
    private readonly commentRepository: Repository<MomentComment>,
    @InjectRepository(CommunityReport)
    private readonly reportRepository: Repository<CommunityReport>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly systemSettings: SystemSettingsService,
    private readonly contentSecurity: ContentSecurityService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private async ensureEnabled() {
    const config = await this.systemSettings.getClientConfig();
    if (!config.communityEnabled) {
      throw new ForbiddenException('育娃圈暂未开启');
    }
  }

  private async getPublicMoment(id: string) {
    const moment = await this.momentRepository.findOne({ where: { id } });
    if (!moment || moment.visibility !== 'public') {
      throw new NotFoundException('瞬间不存在或已设为私密');
    }
    return moment;
  }

  private async photosForMomentIds(ids: string[]) {
    const map = new Map<string, Photo[]>();
    if (ids.length === 0) return map;
    const photos = await this.photoRepository.find({
      where: { momentId: In(ids) },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    photos.forEach((photo) => {
      if (!photo.momentId) return;
      const list = map.get(photo.momentId) ?? [];
      list.push(photo);
      map.set(photo.momentId, list);
    });
    return map;
  }

  private toPhoto(photo: Photo) {
    return {
      id: photo.id,
      url: photo.url,
      thumbnail: photo.thumbnail || null,
      photoDate: photo.photoDate,
    };
  }

  private toAuthor(nickname: string | null, avatar: string | null) {
    return {
      nickname: nickname || '微信用户',
      avatar: avatar || null,
    };
  }

  async getFeed(userId: string, page = 1, pageSize = 10) {
    await this.ensureEnabled();
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 10, 1), 20);
    const offset = (safePage - 1) * safePageSize;
    const visible = `(m.content IS NOT NULL AND m.content <> ''
      OR EXISTS (SELECT 1 FROM photos p WHERE p.moment_id = m.id))`;

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM moments m WHERE m.visibility = 'public' AND ${visible}`,
    );
    const total = Number(countRow.total);

    const rows: PostRow[] = await this.dataSource.query(
      `SELECT m.id, m.content, m.created_at AS createdAt,
              m.user_id AS authorId, u.nickname, u.avatar,
              (SELECT COUNT(*) FROM moment_likes l WHERE l.moment_id = m.id) AS likeCount,
              (SELECT COUNT(*) FROM moment_comments c
                WHERE c.moment_id = m.id AND c.status = 'visible') AS commentCount,
              EXISTS(SELECT 1 FROM moment_likes l
                WHERE l.moment_id = m.id AND l.user_id = ?) AS likedByMe
       FROM moments m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.visibility = 'public' AND ${visible}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [userId, safePageSize, offset],
    );

    const photosByMoment = await this.photosForMomentIds(rows.map((row) => row.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
        photos: (photosByMoment.get(row.id) ?? []).map((photo) => this.toPhoto(photo)),
        likeCount: Number(row.likeCount),
        commentCount: Number(row.commentCount),
        likedByMe: Number(row.likedByMe) === 1,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + rows.length < total,
    };
  }

  private async getPostRow(userId: string, id: string): Promise<PostRow> {
    const rows: PostRow[] = await this.dataSource.query(
      `SELECT m.id, m.content, m.created_at AS createdAt,
              m.user_id AS authorId, u.nickname, u.avatar,
              (SELECT COUNT(*) FROM moment_likes l WHERE l.moment_id = m.id) AS likeCount,
              (SELECT COUNT(*) FROM moment_comments c
                WHERE c.moment_id = m.id AND c.status = 'visible') AS commentCount,
              EXISTS(SELECT 1 FROM moment_likes l
                WHERE l.moment_id = m.id AND l.user_id = ?) AS likedByMe
       FROM moments m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = ? AND m.visibility = 'public'`,
      [userId, id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('瞬间不存在或已设为私密');
    return row;
  }

  private buildCommentTree(
    rows: any[],
    viewerId: string,
    postAuthorId: string,
    includeStatus = false,
  ): CommunityCommentNode[] {
    const roots = new Map<string, CommunityCommentNode>();
    const rootList: CommunityCommentNode[] = [];

    for (const row of rows) {
      if (row.parentId) continue;
      const node: CommunityCommentNode = {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
        canDelete: row.userId === viewerId || postAuthorId === viewerId,
        parentId: null,
        replyToNickname: row.replyToNickname || null,
        replies: [],
      };
      if (includeStatus) node.status = row.status;
      roots.set(node.id, node);
      rootList.push(node);
    }

    for (const row of rows) {
      if (!row.parentId) continue;
      const root = roots.get(row.parentId);
      // 父评论被隐藏/截断时，回复不单独浮出来
      if (!root) continue;
      const node: CommunityCommentNode = {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
        canDelete: row.userId === viewerId || postAuthorId === viewerId,
        parentId: row.parentId,
        replyToNickname: row.replyToNickname || null,
        replies: [],
      };
      if (includeStatus) node.status = row.status;
      root.replies.push(node);
    }

    return rootList;
  }

  private async loadComments(
    momentId: string,
    viewerId: string,
    postAuthorId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT c.id, c.content, c.created_at AS createdAt, c.user_id AS userId,
              c.parent_id AS parentId, c.status, u.nickname, u.avatar,
              ru.nickname AS replyToNickname
       FROM moment_comments c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN users ru ON ru.id = c.reply_to_user_id
       WHERE c.moment_id = ? AND c.status = 'visible'
       ORDER BY c.created_at ASC
       LIMIT ?`,
      [momentId, COMMENT_PAGE_LIMIT],
    );
    return this.buildCommentTree(rows, viewerId, postAuthorId);
  }

  async getPost(userId: string, id: string) {
    await this.ensureEnabled();
    const row = await this.getPostRow(userId, id);
    const photosByMoment = await this.photosForMomentIds([id]);
    const comments = await this.loadComments(id, userId, row.authorId);
    return {
      post: {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
        photos: (photosByMoment.get(id) ?? []).map((photo) => this.toPhoto(photo)),
        likeCount: Number(row.likeCount),
        commentCount: Number(row.commentCount),
        likedByMe: Number(row.likedByMe) === 1,
      },
      comments,
    };
  }

  async setLike(userId: string, momentId: string, liked: boolean) {
    await this.ensureEnabled();
    await this.getPublicMoment(momentId);
    this.rateLimit.assert('community-like', userId);

    if (liked) {
      const existing = await this.likeRepository.findOne({
        where: { momentId, userId },
      });
      if (!existing) {
        try {
          await this.likeRepository.save(
            this.likeRepository.create({ momentId, userId }),
          );
        } catch (error: any) {
          // 并发重复点赞由唯一索引兜底，不是业务失败
          if (error?.code !== 'ER_DUP_ENTRY') throw error;
        }
      }
    } else {
      await this.likeRepository.delete({ momentId, userId });
    }

    const likeCount = await this.likeRepository.count({ where: { momentId } });
    return { liked, likeCount };
  }

  async addComment(userId: string, momentId: string, dto: CreateMomentCommentDto) {
    await this.ensureEnabled();
    await this.getPublicMoment(momentId);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('评论内容不能为空');

    const parentInput = dto.parentId?.trim() || null;
    const replyToInput = dto.replyToCommentId?.trim() || null;
    let parentId: string | null = null;
    let replyToUserId: string | null = null;
    let replyToNickname: string | null = null;

    if (parentInput) {
      const parent = await this.commentRepository.findOne({
        where: { id: parentInput, momentId, status: 'visible' },
      });
      if (!parent || parent.parentId) {
        throw new BadRequestException('只能回复一级评论');
      }
      parentId = parent.id;
      replyToUserId = parent.userId;
    }

    if (replyToInput) {
      const target = await this.commentRepository.findOne({
        where: { id: replyToInput, momentId, status: 'visible' },
      });
      if (!target) {
        throw new BadRequestException('回复的评论不存在');
      }
      const rootId = target.parentId || target.id;
      if (parentId && parentId !== rootId) {
        throw new BadRequestException('回复关系不正确');
      }
      parentId = rootId;
      replyToUserId = target.userId;
    }

    if (parentId && replyToUserId) {
      const replyToUser = await this.userRepository.findOne({
        where: { id: replyToUserId },
        select: ['id', 'nickname'],
      });
      replyToNickname = replyToUser?.nickname ?? null;
    }

    this.rateLimit.assert('community-comment', userId);
    await this.contentSecurity.checkUserTexts(userId, [content], 2);

    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        momentId,
        userId,
        parentId,
        replyToUserId,
        content,
        status: 'visible',
      }),
    );
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'nickname', 'avatar'],
    });
    const commentCount = await this.commentRepository.count({
      where: { momentId, status: 'visible' },
    });
    return {
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: this.toAuthor(user?.nickname ?? null, user?.avatar ?? null),
        canDelete: true,
        parentId,
        replyToNickname,
        replies: [],
      },
      commentCount,
    };
  }

  async hideComment(userId: string, commentId: string) {
    await this.ensureEnabled();
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    const moment = await this.momentRepository.findOne({
      where: { id: comment.momentId },
    });
    if (!moment) throw new NotFoundException('瞬间不存在');
    // 评论作者或瞬间作者都可以删除自己范围内的评论
    if (comment.userId !== userId && moment.userId !== userId) {
      throw new ForbiddenException('无权删除这条评论');
    }

    if (comment.status === 'visible') {
      await this.dataSource.transaction(async (manager) => {
        // 删一级评论时整楼一起隐藏，避免留下无父级的回复
        if (!comment.parentId) {
          await manager.update(
            MomentComment,
            { parentId: comment.id, status: 'visible' },
            { status: 'hidden' },
          );
        }
        await manager.update(MomentComment, { id: comment.id }, { status: 'hidden' });
      });
    }

    const commentCount = await this.commentRepository.count({
      where: { momentId: comment.momentId, status: 'visible' },
    });
    return { success: true, commentCount };
  }

  async report(userId: string, dto: ReportCommunityContentDto) {
    await this.ensureEnabled();

    if (dto.targetType === 'moment') {
      await this.getPublicMoment(dto.targetId);
    } else {
      const comment = await this.commentRepository.findOne({
        where: { id: dto.targetId, status: 'visible' },
      });
      if (!comment) throw new NotFoundException('评论不存在');
      await this.getPublicMoment(comment.momentId);
    }

    // 同一用户重复举报同一目标只记一条，不消耗举报额度
    const existing = await this.reportRepository.findOne({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        reporterUserId: userId,
      },
    });
    if (existing) return { success: true };

    this.rateLimit.assert('community-report', userId);
    const detail = dto.detail?.trim() || null;
    await this.contentSecurity.checkUserTexts(userId, [detail], 2);

    await this.reportRepository.save(
      this.reportRepository.create({
        targetType: dto.targetType,
        targetId: dto.targetId,
        reporterUserId: userId,
        reason: dto.reason,
        detail,
        status: 'pending',
      }),
    );
    return { success: true };
  }

  // ── 后台管理 ──

  async getAdminPosts(page = 1, pageSize = 20) {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM moments WHERE visibility = 'public'`,
    );
    const rows = await this.dataSource.query(
      `SELECT m.id, m.content, m.created_at AS createdAt,
              m.user_id AS authorId, u.nickname, u.avatar,
              (SELECT COUNT(*) FROM moment_likes l WHERE l.moment_id = m.id) AS likeCount,
              (SELECT COUNT(*) FROM moment_comments c
                WHERE c.moment_id = m.id AND c.status = 'visible') AS commentCount
       FROM moments m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.visibility = 'public'
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [safePageSize, offset],
    );
    const photosByMoment = await this.photosForMomentIds(rows.map((row) => row.id));

    return {
      list: rows.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
        photos: (photosByMoment.get(row.id) ?? []).map((photo) => this.toPhoto(photo)),
        likeCount: Number(row.likeCount),
        commentCount: Number(row.commentCount),
      })),
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  private async audit(
    adminUsername: string,
    action: string,
    targetType: string,
    targetId: string,
    detail: Record<string, unknown>,
    clientIp: string | null,
  ) {
    await this.dataSource.query(
      `INSERT INTO admin_audit_logs
        (id, admin_username, action, target_type, target_id, detail, client_ip, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
      [adminUsername, action, targetType, targetId, JSON.stringify(detail), clientIp],
    );
  }

  async getAdminInteractions(momentId: string) {
    const momentRows = await this.dataSource.query(
      `SELECT m.id, m.content, m.visibility, m.user_id AS authorId,
              u.nickname, u.avatar
       FROM moments m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`,
      [momentId],
    );
    const moment = momentRows[0];
    if (!moment) throw new NotFoundException('瞬间不存在');

    const [likeRows, commentRows] = await Promise.all([
      this.dataSource.query(
        `SELECT l.created_at AS createdAt, u.id AS userId, u.nickname, u.avatar
         FROM moment_likes l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.moment_id = ?
         ORDER BY l.created_at DESC
         LIMIT ?`,
        [momentId, COMMENT_PAGE_LIMIT],
      ),
      this.dataSource.query(
        `SELECT c.id, c.content, c.status, c.parent_id AS parentId,
                c.created_at AS createdAt, c.user_id AS userId,
                u.nickname, u.avatar, ru.nickname AS replyToNickname
         FROM moment_comments c
         LEFT JOIN users u ON u.id = c.user_id
         LEFT JOIN users ru ON ru.id = c.reply_to_user_id
         WHERE c.moment_id = ?
         ORDER BY c.created_at ASC
         LIMIT ?`,
        [momentId, COMMENT_PAGE_LIMIT],
      ),
    ]);

    return {
      post: {
        id: moment.id,
        content: moment.content,
        visibility: moment.visibility,
        author: this.toAuthor(moment.nickname, moment.avatar),
      },
      likes: likeRows.map((row) => ({
        userId: row.userId,
        createdAt: row.createdAt,
        author: this.toAuthor(row.nickname, row.avatar),
      })),
      comments: this.buildCommentTree(commentRows, '', '', true),
    };
  }

  async hidePostByAdmin(
    id: string,
    adminUsername: string,
    clientIp: string | null,
  ) {
    const moment = await this.momentRepository.findOne({ where: { id } });
    if (!moment) throw new NotFoundException('瞬间不存在');
    if (moment.visibility !== 'public') return { success: true };

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Moment, { id }, { visibility: 'family' });
      await manager.query(
        `UPDATE community_reports
         SET status = 'handled', handled_by = ?, handled_at = NOW()
         WHERE target_type = 'moment' AND target_id = ? AND status = 'pending'`,
        [adminUsername, id],
      );
    });
    await this.audit(adminUsername, 'hide_community_moment', 'moment', id, {}, clientIp);
    return { success: true };
  }

  private async loadReportTarget(targetType: string, targetId: string) {
    if (targetType === 'moment') {
      const rows = await this.dataSource.query(
        `SELECT m.id, m.content, m.created_at AS createdAt, m.visibility,
                m.user_id AS authorId, u.nickname, u.avatar
         FROM moments m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.id = ?`,
        [targetId],
      );
      const row = rows[0];
      if (!row) return null;
      const photosByMoment = await this.photosForMomentIds([row.id]);
      return {
        type: 'moment',
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        visibility: row.visibility,
        author: this.toAuthor(row.nickname, row.avatar),
        photos: (photosByMoment.get(row.id) ?? []).map((photo) => this.toPhoto(photo)),
      };
    }

    const rows = await this.dataSource.query(
      `SELECT c.id, c.content, c.status, c.created_at AS createdAt,
              c.moment_id AS momentId, c.user_id AS authorId, u.nickname, u.avatar
       FROM moment_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [targetId],
    );
    const row = rows[0];
    if (!row) return null;

    const momentRows = await this.dataSource.query(
      `SELECT m.id, m.content, m.created_at AS createdAt, m.visibility,
              m.user_id AS authorId, u.nickname, u.avatar
       FROM moments m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`,
      [row.momentId],
    );
    const momentRow = momentRows[0];
    const photosByMoment = momentRow
      ? await this.photosForMomentIds([momentRow.id])
      : new Map<string, Photo[]>();

    return {
      type: 'comment',
      id: row.id,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
      author: this.toAuthor(row.nickname, row.avatar),
      moment: momentRow
        ? {
            id: momentRow.id,
            content: momentRow.content,
            createdAt: momentRow.createdAt,
            visibility: momentRow.visibility,
            author: this.toAuthor(momentRow.nickname, momentRow.avatar),
            photos: (photosByMoment.get(momentRow.id) ?? []).map((photo) =>
              this.toPhoto(photo),
            ),
          }
        : null,
    };
  }

  async getAdminReports(page = 1, pageSize = 20, status = 'pending') {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;
    const validStatus = ['pending', 'handled', 'dismissed', 'all'].includes(status)
      ? status
      : 'pending';
    const where = validStatus === 'all' ? '' : 'WHERE r.status = ?';
    const params: any[] = validStatus === 'all' ? [] : [validStatus];

    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM community_reports r ${where}`,
      params,
    );
    const rows = await this.dataSource.query(
      `SELECT r.id, r.target_type AS targetType, r.target_id AS targetId,
              r.reason, r.detail, r.status, r.created_at AS createdAt,
              u.nickname AS reporterNickname, u.avatar AS reporterAvatar
       FROM community_reports r
       LEFT JOIN users u ON u.id = r.reporter_user_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safePageSize, offset],
    );

    const list = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        detail: row.detail,
        status: row.status,
        createdAt: row.createdAt,
        reporter: this.toAuthor(row.reporterNickname, row.reporterAvatar),
        target: await this.loadReportTarget(row.targetType, row.targetId),
      })),
    );

    return {
      list,
      total: Number(countRow.total),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async handleReport(
    id: string,
    action: 'hide' | 'dismiss',
    adminUsername: string,
    clientIp: string | null,
  ) {
    const report = await this.reportRepository.findOne({ where: { id } });
    if (!report) throw new NotFoundException('举报记录不存在');
    if (report.status !== 'pending') return { success: true };

    await this.dataSource.transaction(async (manager) => {
      if (action === 'hide') {
        if (report.targetType === 'moment') {
          await manager.update(Moment, { id: report.targetId }, { visibility: 'family' });
        } else {
          const comment = await manager.findOne(MomentComment, {
            where: { id: report.targetId },
          });
          if (comment) {
            // 下架一级评论时整楼一起隐藏
            if (!comment.parentId) {
              await manager.update(
                MomentComment,
                { parentId: comment.id, status: 'visible' },
                { status: 'hidden' },
              );
            }
            await manager.update(
              MomentComment,
              { id: comment.id },
              { status: 'hidden' },
            );
          }
        }
        await manager.query(
          `UPDATE community_reports
           SET status = 'handled', handled_by = ?, handled_at = NOW()
           WHERE target_type = ? AND target_id = ? AND status = 'pending'`,
          [adminUsername, report.targetType, report.targetId],
        );
      } else {
        await manager.update(
          CommunityReport,
          { id },
          {
            status: 'dismissed' as ReportStatus,
            handledBy: adminUsername,
            handledAt: new Date(),
          },
        );
      }
    });

    await this.audit(
      adminUsername,
      'handle_community_report',
      'community_report',
      id,
      { action, targetType: report.targetType, targetId: report.targetId },
      clientIp,
    );
    return { success: true };
  }
}
