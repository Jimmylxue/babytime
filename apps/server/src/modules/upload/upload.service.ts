import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { basename, join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import * as Upyun from 'upyun'

// 上传文件类型白名单：扩展名一律由 MIME + 文件内容魔数决定，绝不信任客户端文件名。
// 若信任客户端扩展名，.html/.svg 会以本站同源页面被静态服务打开（存储型 XSS/钓鱼入口）。
export const IMAGE_EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif',
}

const MIME_BY_EXT: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
}

// 魔数识别（图片内容自证身份）：wx.uploadFile 可能只给 application/octet-stream
function detectImageExt(buffer: Buffer): string | null {
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return '.jpg'
	}
	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer.subarray(1, 4).toString('ascii') === 'PNG'
	) {
		return '.png'
	}
	if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
		return '.gif'
	}
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return '.webp'
	}
	return null
}

// 我们自己生成的对象文件名：<uuid>.<ext>。
// 删图不可逆，所以清理只认这个形状 —— 同桶的装饰图（/baby-time/assets/*.png）、
// 历史遗留文件、任何带路径分隔符的输入，全都对不上这条正则，天然删不到。
const STORED_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i

@Injectable()
export class UploadService implements OnModuleInit {
	private readonly uploadDir = join(process.cwd(), 'uploads')
	private readonly driver: string
	private upyunService: Upyun.Service | null = null

	constructor(private readonly configService: ConfigService) {
		this.driver = this.configService.get('UPLOAD_DRIVER', 'local')
	}

	onModuleInit() {
		if (this.driver === 'upyun') {
			const operator = this.configService.get('UPYUN_OPERATOR')
			const password = this.configService.get('UPYUN_PASSWORD')
			const bucket = this.configService.get('UPYUN_BUCKET')
			this.upyunService = new Upyun.Service(bucket, operator, password)
		} else {
			if (!existsSync(this.uploadDir)) {
				mkdirSync(this.uploadDir, { recursive: true })
			}
		}
	}

	get isUpyun(): boolean {
		return this.driver === 'upyun'
	}

	/** 图片对象的存放位置；storeImage 与 deleteStoredImage 必须用同一个值 */
	private readonly remotePrefix = '/baby-time/'

	getFileUrl(filename: string): string {
		return `/uploads/${filename}`
	}

	/**
	 * 从任意形态的 URL（完整地址 / 相对路径 / 带查询串）里取出我们自己生成的文件名。
	 * 形状不对就返回 null，调用方据此跳过 —— 删图不可逆，认不准就不动。
	 */
	storedImageName(rawUrl: string | null | undefined): string | null {
		if (!rawUrl) return null
		const tail = basename(rawUrl.split('?')[0].split('#')[0]).toLowerCase()
		return STORED_IMAGE_NAME.test(tail) ? tail : null
	}

	/**
	 * 删除一个已确认无人引用的图片对象。本地驱动也支持，便于开发环境验证整条链路。
	 * SDK 对 404 不抛错、只返回 false，所以 false 一律按"对象本来就不在"处理。
	 */
	async deleteStoredImage(name: string): Promise<'deleted' | 'missing' | 'skipped'> {
		if (!STORED_IMAGE_NAME.test(name)) return 'skipped'

		if (this.isUpyun) {
			if (!this.upyunService) return 'skipped'
			const client = new Upyun.Client(this.upyunService)
			const ok = await client.deleteFile(`${this.remotePrefix}${name}`)
			return ok ? 'deleted' : 'missing'
		}

		try {
			await unlink(join(this.uploadDir, name))
			return 'deleted'
		} catch (error: any) {
			if (error?.code === 'ENOENT') return 'missing'
			throw error
		}
	}

	/**
	 * 校验并存储图片，返回安全文件名与（upyun 模式下的）完整 URL。
	 * 本地模式返回 url=null，由控制器用请求 host 拼出访问地址。
	 */
	async storeImage(
		buffer: Buffer,
		mimetype: string,
	): Promise<{ filename: string; url: string | null }> {
		const ext = IMAGE_EXT_BY_MIME[mimetype] ?? detectImageExt(buffer)
		if (!ext) {
			throw new BadRequestException(
				'UNRECOGNIZED_FILE_TYPE: 文件内容不是 jpg / png / webp / gif 图片',
			)
		}
		const filename = `${uuidv4()}${ext}`

		if (this.isUpyun) {
			if (!this.upyunService) {
				throw new Error('又拍云未配置')
			}
			const client = new Upyun.Client(this.upyunService)
			const remotePath = `${this.remotePrefix}${filename}`
			await client.putFile(remotePath, buffer, {
				'Content-Type': MIME_BY_EXT[ext],
			})
			const domain = this.configService.get('UPYUN_DOMAIN')
			return { filename, url: `${domain}${remotePath}` }
		}

		writeFileSync(join(this.uploadDir, filename), buffer)
		return { filename, url: null }
	}
}
