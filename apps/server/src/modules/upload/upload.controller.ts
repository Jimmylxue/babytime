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

		let url: string

		if (this.uploadService.isUpyun) {
			url = await this.uploadService.uploadToUpyun(
				file.buffer,
				file.originalname,
				file.mimetype,
			)
		} else {
			const protocol = req.protocol
			const host = req.get('host')
			url = `${protocol}://${host}${this.uploadService.getFileUrl(file.filename)}`
		}

		return {
			code: 0,
			message: '上传成功',
			data: {
				url,
				filename: file.filename,
				originalname: file.originalname,
				size: file.size,
			},
		}
	}
}
