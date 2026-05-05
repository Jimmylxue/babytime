import {
	Controller,
	Post,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	HttpCode,
	BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { UploadService } from './upload.service'

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
	constructor(private readonly uploadService: UploadService) {}

	@Post()
	@HttpCode(200)
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(@UploadedFile() file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException(
				'NO_FILE_RECEIVED: expected multipart/form-data field "file"',
			)
		}

		console.log('upload received', {
			fieldname: file.fieldname,
			originalname: file.originalname,
			mimetype: file.mimetype,
			size: file.size,
		})

		const url = this.uploadService.getFileUrl(file.filename)
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
