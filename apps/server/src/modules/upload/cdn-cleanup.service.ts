import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { UploadService } from './upload.service'

/**
 * 图片清理：DB 行删掉之后，把不再被任何记录引用的图片对象一起删掉。
 *
 * 不做"删行即删文件"的原因：同一个对象可能被多处引用（相册图被里程碑/记录复用、
 * 同一文件写进不同 scheme 的地址）。删图不可逆，所以删前按文件名回查
 * 下面这张引用表，只要有命中就保留。
 *
 * 回查用 SUBSTRING_INDEX(col,'/',-1) IN (?)，函数包列不走索引；当前这几张表是
 * 千行量级、且清理跑在请求之外，先不为它加索引。
 */
@Injectable()
export class CdnCleanupService {
	private readonly logger = new Logger(CdnCleanupService.name)

	/** 全库所有存图片地址的列（表名/列名为写死的常量，不来自任何输入） */
	private static readonly IMAGE_REFS: ReadonlyArray<readonly [string, string]> = [
		['photos', 'url'],
		['photos', 'thumbnail'],
		['baby_milestones', 'photo_url'],
		['records', 'diaper_image'],
		['babies', 'avatar'],
		['users', 'avatar'],
	]

	constructor(
		private readonly upload: UploadService,
		@InjectDataSource() private readonly dataSource: DataSource,
	) {}

	/**
	 * 后台清理，不阻塞删除接口：一次删除最多 100 张，串行打 CDN 会明显拖慢响应，
	 * 而"图没删掉"只是留个孤儿文件，比接口报错或用户删不掉记录轻得多。
	 */
	scheduleDelete(rawUrls: (string | null | undefined)[]) {
		const names = this.ownNames(rawUrls)
		if (names.length === 0) return
		void this.deleteUnreferenced(names).catch((error) =>
			this.logger.warn(`图片清理任务异常：${error?.message ?? error}`),
		)
	}

	/** 只保留本服务自己上传的 uuid 文件名，其余（装饰图、外链、历史遗留）一律不看 */
	private ownNames(rawUrls: (string | null | undefined)[]): string[] {
		return [
			...new Set(
				rawUrls
					.map((raw) => this.upload.storedImageName(raw))
					.filter((name): name is string => !!name),
			),
		]
	}

	private async deleteUnreferenced(names: string[]) {
		const stillUsed = await this.referencedNames(names)
		for (const name of names) {
			if (stillUsed.has(name)) {
				this.logger.log(`图片 ${name} 仍被其他记录引用，保留`)
				continue
			}
			// 单张失败不能中断整批：删宝宝一次要清几十张，第 3 张超时不该让后面 27 张留下孤儿
			try {
				const result = await this.upload.deleteStoredImage(name)
				this.logger.log(`图片 ${name} 清理：${result}`)
			} catch (error: any) {
				this.logger.warn(`图片 ${name} 清理失败：${error?.message ?? error}`)
			}
		}
	}

	private async referencedNames(names: string[]): Promise<Set<string>> {
		const marks = names.map(() => '?').join(',')
		// 位置参数按每个子查询重复展开：query() 在 mysql 驱动下不认命名参数（:names 会原样发出去）
		const sql = CdnCleanupService.IMAGE_REFS.map(
			([table, column]) =>
				`SELECT SUBSTRING_INDEX(${column}, '/', -1) AS name FROM ${table} WHERE SUBSTRING_INDEX(${column}, '/', -1) IN (${marks})`,
		).join(' UNION ')
		const rows: { name: string }[] = await this.dataSource.query(
			sql,
			CdnCleanupService.IMAGE_REFS.flatMap(() => names),
		)
		return new Set(rows.map((row) => String(row.name).toLowerCase()))
	}
}
