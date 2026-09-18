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
import { UploadService } from './upload.service'
import { Request } from 'express'

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
	constructor(private readonly uploadService: UploadService) {}

	@Post()
	@HttpCode(200)
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(
		@UploadedFile() file: Express.Multer.File,
		@Req() req: Request,
	) {
		if (!file) {
			throw new BadRequestException(
				'NO_FILE_RECEIVED: expected multipart/form-data field "file"',
			)
		}

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
