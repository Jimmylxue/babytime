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

@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private photoRepository: Repository<Photo>,
    @InjectRepository(Moment)
    private momentRepository: Repository<Moment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private babyService: BabyService,
    private contentSecurity: ContentSecurityService,
    private cleanup: CdnCleanupService,
    private systemSettings: SystemSettingsService,
  ) {}

  async create(userId: string, createPhotoDto: CreatePhotoDto) {
    await this.babyService.findOne(createPhotoDto.babyId, userId);
    await this.contentSecurity.checkUserTexts(userId, [createPhotoDto.note]);
    const photo = this.photoRepository.create(createPhotoDto);
    return this.photoRepository.save(photo);
  }

  // 一条瞬间（朋友圈式帖子）：文案 + 最多 9 张照片，一次事务落库
  async createMoment(userId: string, dto: CreateMomentDto) {
    const baby = await this.babyService.findOne(dto.babyId, userId);

    const content = dto.content?.trim() || null;
    const photos = dto.photos ?? [];
    const visibility = dto.visibility || 'family';
    if (!content && photos.length === 0) {
      throw new BadRequestException('写点文案或选张照片吧');
    }
    if (visibility === 'public') {
      const config = await this.systemSettings.getClientConfig();
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

    // 涉及到的每个宝宝都做一次权限校验（创建者或家庭成员）
    const babyIds = [...new Set(photos.map((p) => p.babyId))];
    await Promise.all(babyIds.map((babyId) => this.babyService.findOne(babyId, userId)));

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

    return {
      baby: { id: baby.id, name: baby.name, avatar: baby.avatar || null },
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + rows.length < total,
    };
  }
}
