import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import { diskStorage, memoryStorage } from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const uploadDir = join(process.cwd(), 'uploads')

if (!existsSync(uploadDir)) {
	mkdirSync(uploadDir, { recursive: true })
}

@Module({
	imports: [
		MulterModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const driver = configService.get('UPLOAD_DRIVER', 'local')

				if (driver === 'upyun') {
					return {
						storage: memoryStorage(),
						limits: { fileSize: 10 * 1024 * 1024 },
					}
				}

				return {
					storage: diskStorage({
						destination: uploadDir,
						filename: (_req, file, cb) => {
							const fileExt = extname(file.originalname || '').toLowerCase()
							const uniqueName = `${uuidv4()}${fileExt || '.jpg'}`
							cb(null, uniqueName)
						},
					}),
					limits: { fileSize: 10 * 1024 * 1024 },
				}
			},
		}),
	],
	controllers: [UploadController],
	providers: [UploadService],
	exports: [UploadService],
})
export class UploadModule {}
