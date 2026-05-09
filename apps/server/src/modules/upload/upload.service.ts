import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import * as Upyun from 'upyun'

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

	getUploadPath(): string {
		return this.uploadDir
	}

	getFileUrl(filename: string): string {
		return `/uploads/${filename}`
	}

	async uploadToUpyun(
		buffer: Buffer,
		filename: string,
		mimetype: string,
	): Promise<string> {
		if (!this.upyunService) {
			throw new Error('又拍云未配置')
		}
		const client = new Upyun.Client(this.upyunService)
		const remotePath = `/baby-time/${filename}`
		await client.putFile(remotePath, buffer, { 'Content-Type': mimetype })

		const domain = this.configService.get('UPYUN_DOMAIN')
		return `${domain}${remotePath}`
	}
}
