import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import { diskStorage } from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const uploadDir = join(process.cwd(), 'uploads')

// 确保目录存在
if (!existsSync(uploadDir)) {
	mkdirSync(uploadDir, { recursive: true })
}

@Module({
	imports: [
		MulterModule.register({
			storage: diskStorage({
				destination: uploadDir,
				filename: (_req, file, cb) => {
					const fileExt = extname(file.originalname || '').toLowerCase()
					const uniqueName = `${uuidv4()}${fileExt || '.jpg'}`
					cb(null, uniqueName)
				},
			}),
			limits: {
				fileSize: 10 * 1024 * 1024, // 10MB
			},
		}),
	],
	controllers: [UploadController],
	providers: [UploadService],
	exports: [UploadService],
})
export class UploadModule {}
