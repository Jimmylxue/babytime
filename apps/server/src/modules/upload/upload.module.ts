import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { UploadController } from './upload.controller'
import { UploadService, IMAGE_EXT_BY_MIME } from './upload.service'

// 类型准入：MIME 白名单；application/octet-stream 放行到服务层，
// 由文件内容魔数复检 —— wx.uploadFile 在部分机型/版本不带正确的图片 MIME。
const fileFilter = (
	_req: unknown,
	file: { mimetype: string },
	cb: (err: Error | null, acceptFile: boolean) => void,
) => {
	const ok =
		file.mimetype in IMAGE_EXT_BY_MIME ||
		file.mimetype === 'application/octet-stream'
	cb(ok ? null : new Error(`UNSUPPORTED_FILE_TYPE: ${file.mimetype}`), ok)
}

@Module({
	imports: [
		MulterModule.register({
			// 统一内存存储：本地驱动也在通过内容校验后再落盘，
			// 避免 diskStorage 在落盘前无法确定安全扩展名的问题
			storage: memoryStorage(),
			fileFilter,
			limits: { fileSize: 10 * 1024 * 1024 },
		}),
	],
	controllers: [UploadController],
	providers: [UploadService],
	exports: [UploadService],
})
export class UploadModule {}
