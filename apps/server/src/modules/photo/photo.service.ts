import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { Photo } from './entities/photo.entity';
import { Moment } from './entities/moment.entity';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { CreateMomentDto } from './dto/create-moment.dto';
import { BabyService } from '../baby/baby.service';
import { ContentSecurityService } from '../content-security/content-security.service';
import { CdnCleanupService } from '../upload/cdn-cleanup.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MomentLike } from '../community/entities/moment-like.entity';
import { MomentComment } from '../community/entities/moment-comment.entity';
import { User } from '../user/entities/user.entity';
import { RateLimitService } from '../../common/rate-limit.service';

@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private photoRepository: Repository<Photo>,
    @InjectRepository(Moment)
    private momentRepository: Repository<Moment>,
    @InjectRepository(MomentLike)
    private likeRepository: Repository<MomentLike>,
    @InjectRepository(MomentComment)
    private commentRepository: Repository<MomentComment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private rateLimit: RateLimitService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private babyService: BabyService,
    private contentSecurity: ContentSecurityService,
    private cleanup: CdnCleanupService,
    private systemSettings: SystemSettingsService,
  ) {}

  async create(userId: string, createPhotoDto: CreatePhotoDto) {
    await this.babyService.findOne(createPhotoDto.babyId, userId);
    await this.babyService.assertCanWrite(createPhotoDto.babyId, userId);
    await this.contentSecurity.checkUserTexts(userId, [createPhotoDto.note]);
    const photo = this.photoRepository.create(createPhotoDto);
    return this.photoRepository.save(photo);
  }

  // 一条瞬间（朋友圈式帖子）：文案 + 最多 9 张照片，一次事务落库
  async createMoment(userId: string, dto: CreateMomentDto) {
    const baby = await this.babyService.findOne(dto.babyId, userId);
    await this.babyService.assertCanWrite(dto.babyId, userId);

    const content = dto.content?.trim() || null;
    const photos = dto.photos ?? [];
    const visibility = dto.visibility || 'family';
    if (!content && photos.length === 0) {
      throw new BadRequestException('写点文案或选张照片吧');
    }
    const config = await this.systemSettings.getClientConfig();
    if (!config.momentPublishEnabled) {
      throw new ForbiddenException('发布瞬间暂未开启');
    }
    if (visibility === 'public') {
      if (!config.communityEnabled) {
        throw new ForbiddenException('育娃圈暂未开启');
      }
      // 防止家庭成员未经创建者同意把宝宝照片公开
      if (baby.userId !== userId) {
        throw new ForbiddenException('只有宝宝创建者可以公开瞬间');
      }
    }
    await this.contentSecurity.checkUserTexts(userId, [content]);

    return this.dataSource.transaction(async (manager) => {
      const moment = await manager.save(
        manager.create(Moment, {
          babyId: dto.babyId,
          userId,
          content,
          photoDate: dto.photoDate,
          visibility,
        }),
      );
      const photoRows = photos.map((item, index) =>
        manager.create(Photo, {
          babyId: dto.babyId,
          momentId: moment.id,
          url: item.url,
          thumbnail: item.thumbnail || undefined,
          photoDate: dto.photoDate,
          sortOrder: index,
        }),
      );
      const savedPhotos = photoRows.length ? await manager.save(photoRows) : [];
      return {
        id: moment.id,
        babyId: moment.babyId,
        content: moment.content,
        photoDate: moment.photoDate,
        visibility: moment.visibility,
        createdAt: moment.createdAt,
        photos: savedPhotos,
      };
    });
  }

  // 作者随时可以把瞬间公开到育娃圈 / 收回为家庭可见
  async updateMomentVisibility(
    userId: string,
    id: string,
    visibility: 'family' | 'public',
  ) {
    const moment = await this.momentRepository.findOne({ where: { id } });
    if (!moment) {
      throw new NotFoundException('瞬间不存在');
    }
    const baby = await this.babyService.findOne(moment.babyId, userId);
    await this.babyService.assertCanWrite(moment.babyId, userId);

    if (visibility === 'public') {
      const config = await this.systemSettings.getClientConfig();
      if (!config.communityEnabled) {
        throw new ForbiddenException('育娃圈暂未开启');
      }
      // 只有宝宝创建者本人发布的内容才能公开，家庭成员不能替宝宝公开
      if (baby.userId !== userId || moment.userId !== userId) {
        throw new ForbiddenException('只有宝宝创建者可以公开瞬间');
      }
    } else if (moment.userId !== userId && baby.userId !== userId) {
      // 收回公开权限放宽到宝宝创建者，避免家人误公开后无法处理
      throw new ForbiddenException('无权修改这条瞬间');
    }

    if (moment.visibility !== visibility) {
      moment.visibility = visibility;
      await this.momentRepository.save(moment);
    }
    return { id: moment.id, visibility: moment.visibility };
  }

  async findAllByBaby(userId: string, babyId: string, page: number = 1, pageSize: number = 20) {
    await this.babyService.findOne(babyId, userId);

    const [items, total] = await this.photoRepository.findAndCount({
      where: { babyId },
      order: { photoDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, userId: string) {
    const photo = await this.photoRepository.findOne({
      where: { id },
      relations: ['baby'],
    });

    if (!photo) {
      throw new NotFoundException('照片不存在');
    }

    // 通过 babyService.findOne 检查权限（创建者或家庭成员均可）
    await this.babyService.findOne(photo.babyId, userId);

    return photo;
  }

  async remove(id: string, userId: string) {
    const photo = await this.findOne(id, userId);
    await this.babyService.assertCanWrite(photo.babyId, userId);
    await this.photoRepository.remove(photo);
    // 先删行、后清图：引用回查要等这条记录消失才判得准
    this.cleanup.scheduleDelete([photo.url, photo.thumbnail]);
    return { success: true };
  }

  async removeMoment(id: string, userId: string) {
    const moment = await this.momentRepository.findOne({ where: { id } });
    if (!moment) {
      throw new NotFoundException('瞬间不存在');
    }
    await this.babyService.findOne(moment.babyId, userId);
    await this.babyService.assertCanWrite(moment.babyId, userId);

    const photos = await this.photoRepository.find({
      where: { momentId: id },
      select: ['url', 'thumbnail'],
    });

    // 先删照片再删瞬间：与 babies 的删除链路保持同一顺序，避免留下孤立文案
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Photo, { momentId: id });
      await manager.delete(Moment, { id });
    });
    this.cleanup.scheduleDelete(photos.flatMap((photo) => [photo.url, photo.thumbnail]));
    return { success: true };
  }

  async batchRemove(ids: string[], userId: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids 不能为空');
    }
    if (ids.length > 100) {
      throw new BadRequestException('单次最多删除 100 张');
    }

    const photos = await this.photoRepository.find({ where: { id: In(ids) } });
    if (photos.length === 0) {
      throw new NotFoundException('照片不存在');
    }

    // 涉及到的每个宝宝都做一次权限校验（创建者或家庭成员），批量删还要过写权限
    const babyIds = [...new Set(photos.map((p) => p.babyId))];
    await Promise.all(
      babyIds.map(async (babyId) => {
        await this.babyService.findOne(babyId, userId);
        await this.babyService.assertCanWrite(babyId, userId);
      }),
    );

    // 单条 DELETE ... WHERE id IN，不存在的照片视为已删除，直接忽略
    const result = await this.photoRepository.delete({ id: In(photos.map((p) => p.id)) });
    this.cleanup.scheduleDelete(photos.flatMap((p) => [p.url, p.thumbnail]));
    return { deleted: result.affected ?? 0 };
  }

  async getTimeline(userId: string, babyId: string, page = 1, pageSize = 30) {
    await this.babyService.findOne(babyId, userId);

    const [photos, total] = await this.photoRepository.findAndCount({
      where: { babyId },
      order: { photoDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 当前页内按日期分组；同一日期跨页时由前端合并
    const timeline: { [key: string]: Photo[] } = {};
    photos.forEach((photo) => {
      const date = photo.photoDate;
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(photo);
    });

    return {
      items: Object.entries(timeline).map(([date, photos]) => ({ date, photos })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  // 瞬间信息流：moment（文案 + 多图）与改造前的单张照片混排。
  // 旧照片不改数据，读时包装成「无文案、单图」的瞬间，保证历史内容连续。
  async getFeed(userId: string, babyId: string, page = 1, pageSize = 20) {
    const baby = await this.babyService.findOne(babyId, userId);
    const config = await this.systemSettings.getClientConfig();
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize) || 20));
    const offset = (safePage - 1) * safePageSize;

    // 可见瞬间：有文案，或还有照片。旧版客户端把照片逐张删光后，空文案的
    // moment 会留在库里，这里不参与计数和分页，避免信息流出现空卡片。
    const visibleMoment = `(m.content IS NOT NULL AND m.content <> ''
      OR EXISTS (SELECT 1 FROM photos p WHERE p.moment_id = m.id))`;

    const [countRow] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM moments m WHERE m.baby_id = ? AND ${visibleMoment}) +
         (SELECT COUNT(*) FROM photos WHERE baby_id = ? AND moment_id IS NULL) AS total`,
      [babyId, babyId],
    );
    const total = Number(countRow?.total ?? 0);

    // 两种数据源统一按「拍摄日期 + 创建时间」倒序分页，保证顺序稳定
    const rows: Array<{ kind: 'moment' | 'photo'; id: string }> =
      await this.dataSource.query(
        `SELECT 'moment' AS kind, m.id AS id, m.photo_date AS postDate, m.created_at AS createdAt
           FROM moments m
          WHERE m.baby_id = ? AND ${visibleMoment}
         UNION ALL
         SELECT 'photo' AS kind, p.id AS id, p.photo_date AS postDate, p.created_at AS createdAt
           FROM photos p
          WHERE p.baby_id = ? AND p.moment_id IS NULL
         ORDER BY postDate DESC, createdAt DESC, id DESC
         LIMIT ? OFFSET ?`,
        [babyId, babyId, safePageSize, offset],
      );

    const momentIds = rows.filter((row) => row.kind === 'moment').map((row) => row.id);
    const legacyPhotoIds = rows.filter((row) => row.kind === 'photo').map((row) => row.id);

    const [moments, momentPhotos, legacyPhotos] = await Promise.all([
      momentIds.length
        ? this.momentRepository.find({ where: { id: In(momentIds) } })
        : Promise.resolve([] as Moment[]),
      momentIds.length
        ? this.photoRepository.find({
            where: { momentId: In(momentIds) },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
          })
        : Promise.resolve([] as Photo[]),
      legacyPhotoIds.length
        ? this.photoRepository.find({ where: { id: In(legacyPhotoIds) } })
        : Promise.resolve([] as Photo[]),
    ]);

    const momentMap = new Map(moments.map((moment) => [moment.id, moment]));
    const photosByMoment = new Map<string, Photo[]>();
    momentPhotos.forEach((photo) => {
      if (!photo.momentId) return;
      const list = photosByMoment.get(photo.momentId) ?? [];
      list.push(photo);
      photosByMoment.set(photo.momentId, list);
    });
    const legacyMap = new Map(legacyPhotos.map((photo) => [photo.id, photo]));

    const toPhoto = (photo: Photo) => ({
      id: photo.id,
      url: photo.url,
      thumbnail: photo.thumbnail || null,
      photoDate: photo.photoDate,
    });

    type FeedItem = {
      id: string;
      kind: 'moment' | 'photo';
      content: string | null;
      photoDate: string;
      createdAt: Date;
      visibility: 'family' | 'public';
      canToggleVisibility: boolean;
      photos: ReturnType<typeof toPhoto>[];
    };

    const items: FeedItem[] = [];
    rows.forEach((row) => {
      if (row.kind === 'moment') {
        const moment = momentMap.get(row.id);
        if (!moment) return;
        items.push({
          id: moment.id,
          kind: 'moment',
          content: moment.content,
          photoDate: moment.photoDate,
          createdAt: moment.createdAt,
          visibility: moment.visibility,
          canToggleVisibility:
            moment.userId === userId &&
            baby.userId === userId &&
            (moment.visibility === 'public' || config.communityEnabled),
          photos: (photosByMoment.get(moment.id) ?? []).map(toPhoto),
        });
        return;
      }
      const photo = legacyMap.get(row.id);
      if (!photo) return;
      items.push({
        id: photo.id,
        kind: 'photo',
        content: photo.note?.trim() || null,
        photoDate: photo.photoDate,
        createdAt: photo.createdAt,
        visibility: 'family',
        canToggleVisibility: false,
        photos: [toPhoto(photo)],
      });
    });

    // 互动数据：家庭流也要显示点赞/评论数，按本页 moment id 批量取，不逐条查
    const momentIdList = items.filter((item) => item.kind === 'moment').map((item) => item.id);
    const likeCountMap = new Map<string, number>();
    const commentCountMap = new Map<string, number>();
    const likedByMeSet = new Set<string>();
    if (momentIdList.length > 0) {
      const [likeRows, commentRows, mineRows]: Array<Array<{ momentId: string; n: string }>> =
        await Promise.all([
          this.dataSource.query(
            `SELECT moment_id AS momentId, COUNT(*) AS n FROM moment_likes
              WHERE moment_id IN (?) GROUP BY moment_id`,
            [momentIdList],
          ),
          this.dataSource.query(
            `SELECT moment_id AS momentId, COUNT(*) AS n FROM moment_comments
              WHERE moment_id IN (?) AND status = 'visible' GROUP BY moment_id`,
            [momentIdList],
          ),
          this.dataSource.query(
            `SELECT moment_id AS momentId, COUNT(*) AS n FROM moment_likes
              WHERE moment_id IN (?) AND user_id = ? GROUP BY moment_id`,
            [momentIdList, userId],
          ),
        ]);
      likeRows.forEach((row) => likeCountMap.set(row.momentId, Number(row.n)));
      commentRows.forEach((row) => commentCountMap.set(row.momentId, Number(row.n)));
      mineRows.forEach((row) => likedByMeSet.add(row.momentId));
    }

    return {
      baby: { id: baby.id, name: baby.name, avatar: baby.avatar || null },
      items: items.map((item) => ({
        ...item,
        likeCount: likeCountMap.get(item.id) || 0,
        commentCount: commentCountMap.get(item.id) || 0,
        likedByMe: likedByMeSet.has(item.id),
        // 家庭流里只有 moment 能互动（旧版单张照片没有 moment 行）
        canInteract: item.kind === 'moment' && config.momentInteractionEnabled,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * 家庭时光流的互动：点赞 / 评论。
   *
   * 与育娃圈（community.service）的区别只有一个，但很关键：
   * 育娃圈要求 moment.visibility === 'public' 且后台开关打开；
   * 家庭流**不要求公开** —— 只要是「你能访问的这个宝宝的瞬间」就能互动。
   * 所以不能复用 community.service，那里面到处是 getPublicMoment()。
   *
   * 复用同一张 moment_likes / moment_comments 表：
   * 一条瞬间如果后来被公开，之前的家庭点赞会自然带进育娃圈计数，语义是一致的。
   */
  private async getInteractableMoment(userId: string, momentId: string) {
    const config = await this.systemSettings.getClientConfig();
    if (!config.momentInteractionEnabled) {
      throw new ForbiddenException('家庭互动暂未开启');
    }
    const moment = await this.momentRepository.findOne({ where: { id: momentId } });
    if (!moment) {
      throw new NotFoundException('瞬间不存在');
    }
    // 能访问这个宝宝 = 创建者或已加入的家庭成员；不能访问就不该知道这条瞬间存在
    await this.babyService.findOne(moment.babyId, userId);
    return moment;
  }

  async setMomentLike(userId: string, momentId: string, liked: boolean) {
    const moment = await this.getInteractableMoment(userId, momentId);
    await this.babyService.assertCanWrite(moment.babyId, userId);
    // 与育娃圈共用一个限流桶：同一个人在这两处的点赞总量一起算
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

  async addMomentComment(userId: string, momentId: string, content: string) {
    const moment = await this.getInteractableMoment(userId, momentId);
    await this.babyService.assertCanWrite(moment.babyId, userId);
    const text = (content || '').trim();
    if (!text) throw new BadRequestException('评论内容不能为空');
    if (text.length > 200) throw new BadRequestException('评论最多 200 字');

    this.rateLimit.assert('community-comment', userId);
    await this.contentSecurity.checkUserTexts(userId, [text], 2);

    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        momentId,
        userId,
        content: text,
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
        author: {
          nickname: user?.nickname || '微信用户',
          avatar: user?.avatar || null,
        },
      },
      commentCount,
    };
  }

  async getMomentComments(userId: string, momentId: string) {
    const moment = await this.getInteractableMoment(userId, momentId);
    const comments = await this.commentRepository.find({
      where: { momentId, status: 'visible' },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const users = userIds.length
      ? await this.userRepository.find({
          where: { id: In(userIds) },
          select: ['id', 'nickname', 'avatar'],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      // 谁能删：评论作者本人，或宝宝创建者（家庭内的管理权）
      items: comments.map((comment) => {
        const author = userMap.get(comment.userId);
        return {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            nickname: author?.nickname || '微信用户',
            avatar: author?.avatar || null,
          },
          canDelete: comment.userId === userId || moment.userId === userId,
        };
      }),
      total: comments.length,
    };
  }

  async removeMomentComment(userId: string, momentId: string, commentId: string) {
    const moment = await this.getInteractableMoment(userId, momentId);
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, momentId },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    // 本人删自己的，或宝宝创建者删家庭内的任意评论
    if (comment.userId !== userId && moment.userId !== userId) {
      throw new ForbiddenException('无权删除这条评论');
    }
    // 软删除保留证据，与育娃圈同一口径
    comment.status = 'hidden';
    await this.commentRepository.save(comment);
    return { success: true };
  }
}
