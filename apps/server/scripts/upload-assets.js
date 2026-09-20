#!/usr/bin/env node
/**
 * 把装饰插画 PNG 上传到又拍云（/baby-time/assets/），供小程序以网络图引用。
 *
 * 背景：打进小程序包内的 webp 在 iOS/Android 真机的 image 组件都不渲染
 * （开发者工具模拟器正常），装饰图已全部转 PNG 走 CDN（2026-09-20）。
 *
 * 用法（在仓库根目录，读根目录 .env 的 UPYUN_* ）：
 *   node apps/server/scripts/upload-assets.js <png文件...>
 * 重复执行会覆盖同名文件，安全。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const env = {}
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
	const m = line.match(/^([A-Z_]+)=(.*)$/)
	if (m) env[m[1]] = m[2].trim()
}
const { UPYUN_BUCKET, UPYUN_OPERATOR, UPYUN_PASSWORD } = env
if (!UPYUN_BUCKET || !UPYUN_OPERATOR || !UPYUN_PASSWORD) {
	console.error('.env 缺少 UPYUN_BUCKET / UPYUN_OPERATOR / UPYUN_PASSWORD')
	process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) {
	console.error('用法: node apps/server/scripts/upload-assets.js <png文件...>')
	process.exit(1)
}

// upyun 依赖装在 apps/server 下（pnpm workspace），按解析顺序找
function loadUpyun() {
	for (const p of [
		path.join(ROOT, 'apps/server/node_modules/upyun'),
		path.join(ROOT, 'node_modules/upyun'),
	]) {
		try {
			return require(p)
		} catch {}
	}
	throw new Error('找不到 upyun 包，请先在仓库根目录执行 pnpm install')
}
const Upyun = loadUpyun()
const service = new Upyun.Service(UPYUN_BUCKET, UPYUN_OPERATOR, UPYUN_PASSWORD)
const client = new Upyun.Client(service)

;(async () => {
	let ok = 0
	for (const file of files) {
		const abs = path.resolve(file)
		const name = path.basename(abs)
		const remotePath = `/baby-time/assets/${name}`
		const buf = fs.readFileSync(abs)
		try {
			const result = await client.putFile(remotePath, buf, {
				'Content-Type': 'image/png',
			})
			// 成功时返回文件元数据（{width,height,file-type,...}），失败会 throw
			console.log(`✅ ${name} (${Math.round(buf.length / 1024)}KB) → ${result?.['file-type'] || 'OK'}`)
			ok++
		} catch (error) {
			console.error(`❌ ${name}: ${error.message}`)
		}
	}
	console.log(`完成 ${ok}/${files.length}`)
	process.exit(ok === files.length ? 0 : 1)
})()
