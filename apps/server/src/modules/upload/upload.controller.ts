import {
	Controller,
	Post,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	HttpCode,
	BadRequestException,
	Req,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RateLimitService } from '../../common/rate-limit.service'
import { ContentSecurityService } from '../content-security/content-security.service'
import { UploadService, IMAGE_EXT_BY_MIME } from './upload.service'
import { Request } from 'express'

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
	constructor(
		private readonly uploadService: UploadService,
		private readonly contentSecurity: ContentSecurityService,
		private readonly rateLimit: RateLimitService,
	) {}

	@Post()
	@HttpCode(200)
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(
		@UploadedFile() file: Express.Multer.File,
		// JwtStrategy.validate 挂上来的用户，Express 的类型定义里没有这一层
		@Req() req: Request & { user: { id: string } },
	) {
		if (!file) {
			throw new BadRequestException(
				'NO_FILE_RECEIVED: expected multipart/form-data field "file"',
			)
		}

		// 每张图都会写进又拍云并算流量，按人按天给一个正常记录用不到的上限
		this.rateLimit.assert('upload', req.user.id)

		// 先审再存：违规图不落 CDN。multipart 里的文件名不取客户端 originalname，
		// 只用白名单扩展名拼一个固定名，避免任意字符串进请求头
		const ext = IMAGE_EXT_BY_MIME[file.mimetype] ?? '.jpg'
		await this.contentSecurity.checkImage(file.buffer, `media${ext}`)

		// 安全命名与类型校验在 UploadService.storeImage 内完成（MIME 白名单 + 内容魔数）
		const { filename, url } = await this.uploadService.storeImage(
			file.buffer,
			file.mimetype,
		)
		const finalUrl = url
			? url
			: `${req.protocol}://${req.get('host')}${this.uploadService.getFileUrl(filename)}`

		return {
			code: 0,
			message: '上传成功',
			data: {
				url: finalUrl,
				filename,
				originalname: file.originalname,
				size: file.size,
			},
		}
	}
}
