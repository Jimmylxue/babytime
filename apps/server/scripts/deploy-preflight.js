#!/usr/bin/env node
/**
 * 部署前探活：把「新版能不能真干活」在碰线上进程之前先验一遍。
 *
 * 为什么要它：server.sh 原来是 `pm2 delete` 再 `pm2 start`，老版本先被销毁、新版再起，
 * 起不来就是全站挂 —— 而构建通过完全不代表跑得起来（少跑一个 SQL 迁移、.env 缺一项、
 * DI 接线漏了，都是 nest build 全绿、线上一片 500）。
 * 这个脚本用**生产同一份 .env**、在**临时端口**上起一个禁掉定时器的实例，验完了再放行部署。
 * 任何一项不过 → 退出码非 0 → server.sh 在 `pm2 delete` 之前就中止，线上进程根本没被动过。
 *
 * 用法（在服务器上，仓库根目录）：
 *   node apps/server/scripts/deploy-preflight.js
 * 可调：PREFLIGHT_PORT=3999 node ... （默认取 .env 的 PORT + 1000）
 *
 * 它专抓 pm2 reload / wait-ready 救不了的那一类：进程 boot 正常、但功能或表结构是坏的。
 *
 * 副作用说明（别当成绝对只读）：探针打的都是 GET，但 AnnouncementService.onModuleInit
 * 在种子行缺失时会补写一条公告。生产该行早就存在、是空转；只是"零写入"这话不能说满。
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const SERVER_DIR = path.join(ROOT, 'apps', 'server')
const ENTRY = path.join(SERVER_DIR, 'dist', 'main.js')
const BOOT_TIMEOUT_MS = Number(process.env.PREFLIGHT_BOOT_TIMEOUT_MS || 30000)
const EXIT_TIMEOUT_MS = Number(process.env.PREFLIGHT_EXIT_TIMEOUT_MS || 15000)

const fileEnv = {}
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
	const m = line.match(/^([A-Z_]+)=(.*)$/)
	if (m) fileEnv[m[1]] = m[2].trim()
}

// .env 是基底，但**显式传入的同名变量优先** —— 反过来的话（{...process.env, ...fileEnv}）
// 命令行覆盖会被文件值静默吃掉，受控负例测试就完全测不到东西（第一版就踩了这个）。
const env = { ...fileEnv }
for (const key of Object.keys(fileEnv)) {
	if (process.env[key] !== undefined) env[key] = process.env[key]
}

const LIVE_PORT = Number(env.PORT || 3000)
const PORT = Number(process.env.PREFLIGHT_PORT || LIVE_PORT + 1000)
if (PORT === LIVE_PORT) {
	console.error(`探活端口不能和线上端口相同（都是 ${PORT}）`)
	process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function portFree(port) {
	return new Promise((resolve) => {
		const probe = net.createServer()
		probe.once('error', (e) => resolve(e.code !== 'EADDRINUSE' && e.code !== 'EACCES'))
		probe.once('listening', () => probe.close(() => resolve(true)))
		probe.listen(port, '127.0.0.1')
	})
}

function tryConnect(host, port, timeout = 2000) {
	return new Promise((resolve) => {
		const s = net.connect({ host, port, timeout })
		s.once('connect', () => { s.destroy(); resolve(true) })
		s.once('error', () => { s.destroy(); resolve(false) })
		s.once('timeout', () => { s.destroy(); resolve(false) })
	})
}

function firstNonInternalIPv4() {
	for (const addrs of Object.values(require('os').networkInterfaces())) {
		for (const a of addrs || []) {
			if (a.family === 'IPv4' && !a.internal) return a.address
		}
	}
	return null
}

const get = (p, timeout = 15000) =>
	new Promise((resolve) => {
		const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout }, (res) => {
			let b = ''
			res.on('data', (c) => (b += c))
			res.on('end', () => resolve({ status: res.statusCode, body: b }))
		})
		req.on('error', (e) => resolve({ status: 0, body: '', err: e.code || e.message }))
		req.on('timeout', () => {
			req.destroy()
			resolve({ status: 0, body: '', err: 'TIMEOUT' })
		})
	})

let pass = 0
const failures = []
function check(name, ok, detail = '') {
	console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`)
	if (ok) pass++
	else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 表结构与实体比对：专抓「SQL 没跑就部署」。
 * 生产 DB_SYNCHRONIZE=false，TypeORM 不会替你建表建列；缺一张表就是整条接口 500，
 * 而进程照样启动成功 —— 所以必须单独查，不能靠 boot 不报错来推断。
 */
async function checkSchema() {
	const { DataSource } = require('typeorm')
	const ds = new DataSource({
		type: 'mysql',
		host: env.DB_HOST || 'localhost',
		port: Number(env.DB_PORT || 3306),
		username: env.DB_USERNAME || 'root',
		password: env.DB_PASSWORD || '',
		database: env.DB_DATABASE || 'baby_time',
		entities: [path.join(SERVER_DIR, 'dist', '**', '*.entity.js')],
		synchronize: false,
		dropSchema: false,
	})
	await ds.initialize()
	try {
		const rows = await ds.query(
			'SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()',
		)
		const have = new Map()
		for (const r of rows) {
			if (!have.has(r.t)) have.set(r.t, new Set())
			have.get(r.t).add(String(r.c).toLowerCase())
		}
		const missingTables = []
		const missingColumns = []
		for (const md of ds.entityMetadatas) {
			const cols = have.get(md.tableName)
			if (!cols) {
				missingTables.push(md.tableName)
				continue
			}
			for (const col of md.columns) {
				const name = String(col.databaseName || col.propertyName).toLowerCase()
				if (!cols.has(name)) missingColumns.push(`${md.tableName}.${name}`)
			}
		}
		check(
			`实体表全部存在于库中（${ds.entityMetadatas.length} 张表）`,
			missingTables.length === 0,
			missingTables.length ? `缺表: ${missingTables.join(', ')}` : '',
		)
		check(
			`实体列全部存在于库中`,
			missingColumns.length === 0,
			missingColumns.length ? `缺列: ${missingColumns.slice(0, 12).join(', ')}` : '',
		)
	} finally {
		await ds.destroy()
	}
}

async function main() {
	console.log(`\n部署前探活  目标库=${env.DB_DATABASE || 'baby_time'}  探活端口=${PORT}（线上端口=${LIVE_PORT}，不冲突）\n`)

	// 端口被占就必须先停下：否则探针打到别人身上，验的是残留进程，
	// 结果照样全绿 —— 一个会撒谎的闸门比没有闸门更危险。
	if (!(await portFree(PORT))) {
		console.error(`✗ 探活端口 ${PORT} 已被占用，中止。`)
		console.error('  常见原因：上一次跑本脚本时父进程被打断（管道截断 / Ctrl-C），子进程成了孤儿还占着端口。')
		console.error(`  先看是谁：lsof -nP -iTCP:${PORT} -sTCP:LISTEN`)
		process.exit(1)
	}

	if (!fs.existsSync(ENTRY)) {
		console.error(`找不到 ${ENTRY} —— 先跑构建（nest build）再探活`)
		process.exit(1)
	}

	console.log('— 表结构（抓「SQL 没跑就部署」）—')
	try {
		await checkSchema()
	} catch (error) {
		check('连接数据库并比对实体表结构', false, error?.message)
	}

	console.log('\n— 起一个临时实例（禁定时器，只读探活）—')
	const child = spawn('node', ['dist/main.js'], {
		cwd: SERVER_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, ...env, PORT: String(PORT), LISTEN_HOST: '127.0.0.1', OPS_DISABLE_SCHEDULER: '1' },
	})
	let log = ''
	child.stdout.on('data', (d) => (log += d))
	child.stderr.on('data', (d) => (log += d))
	let exited = null
	child.on('exit', (code, signal) => (exited = { code, signal, at: Date.now() }))

	// 父进程被打断（输出被管道截断、Ctrl-C）时绝不能留下一个占着探活端口的孤儿 ——
	// 那会让下一次运行去验一个不属于它的旧进程。
	const ensureDead = () => {
		try {
			child.kill('SIGKILL')
		} catch {}
	}
	process.once('exit', ensureDead)
	process.once('SIGINT', () => {
		ensureDead()
		process.exit(130)
	})
	process.once('SIGTERM', () => {
		ensureDead()
		process.exit(143)
	})
	// 子进程自己因端口冲突等原因退出时，把原因摊开说，不要留给下一轮猜
	setTimeout(() => {
		if (!exited && /EADDRINUSE/.test(log)) check('探活端口未被占用', false, `子进程报 EADDRINUSE（${PORT}）`)
	}, 3000)

	const killAndLeave = async () => {
		if (!exited) child.kill('SIGKILL')
		for (let i = 0; i < 50 && !exited; i++) await sleep(100)
	}

	try {
		// 等就绪：/health 会真查库，所以「200」同时代表 HTTP 栈、DI、DB 连接都通
		const deadline = Date.now() + BOOT_TIMEOUT_MS
		let health = null
		while (Date.now() < deadline) {
			if (exited) break // 启动即崩，别再等
			health = await get('/api/health')
			if (health.status === 200) break
			await sleep(300)
		}
		if (exited) {
			check('临时实例启动成功', false, `进程在就绪前退出 code=${exited.code} signal=${exited.signal}`)
			console.log('\n———— 启动日志尾部 ————\n' + log.split('\n').slice(-25).join('\n'))
		} else {
			check('临时实例启动成功并完成监听', health?.status === 200, health ? `${health.status} ${health.err || ''}` : '超时未就绪')
			check('/api/health 查库通过（DB 连接可用）', health?.status === 200 && /"status":"ok"/.test(health.body), `${health?.ms || ''} ${health?.body?.slice(0, 70)}`)
			check('OPS_DISABLE_SCHEDULER 生效（不会真发订阅消息）', /OPS_DISABLE_SCHEDULER=1/.test(log))

			// 探活实例只跑几秒，但默认 listen(port) 绑的是所有网卡，
			// 等于在那几秒里多开一个公网可达端口（能不能真被连上取决于安全组）。
			// 既然只是本机自检，就要求它只绑回环，别把判断押在防火墙配置上。
			const lan = firstNonInternalIPv4()
			if (lan) {
				const reachable = await tryConnect(lan, PORT)
				check(`探活实例只在回环可见（非回环地址 ${lan} 连不上）`, !reachable,
					reachable ? '仍可达，LISTEN_HOST 未生效' : '')
			} else {
				console.log('  · 本机无非回环 IPv4，跳过绑定范围检查')
			}

			// 两个公开只读接口：走完整的 HTTP + 控制器 + DB 链路
			const ann = await get('/api/announcement/current')
			check('GET /api/announcement/current 返回 200', ann.status === 200, `${ann.status} ${ann.err || ann.body.slice(0, 60)}`)
			const cfg = await get('/api/notification/config')
			check('GET /api/notification/config 返回 200', cfg.status === 200, `${cfg.status} ${cfg.err || cfg.body.slice(0, 60)}`)
			const guard = await get('/api/record/stats/00000000-0000-0000-0000-000000000000')
			check('受保护接口仍会拦（401 而非 500，说明守卫在位）', guard.status === 401, `实际 ${guard.status}`)
		}

		console.log('\n— 排空回归（每次部署都顺手验一遍优雅退出）—')
		if (!exited) {
			const t0 = Date.now()
			child.kill('SIGINT')
			for (let i = 0; i < EXIT_TIMEOUT_MS / 100 && !exited; i++) await sleep(100)
			const ms = exited ? exited.at - t0 : null
			check('收到 SIGINT 后自行干净退出（未被 SIGKILL）', !!exited && exited.signal !== 'SIGKILL', exited ? `${ms}ms signal=${exited.signal}` : `${EXIT_TIMEOUT_MS}ms 仍未退出`)
			check('退出够快（空闲连接没拖住 5s）', ms !== null && ms < 5000, ms === null ? '' : `${ms}ms`)
			check('订阅消息定时器被清掉（onModuleDestroy 真跑了）', /定时器已停止|OPS_DISABLE_SCHEDULER=1/.test(log))
		} else {
			check('排空回归', false, '实例未能启动，无从验证')
		}
	} finally {
		await killAndLeave()
	}

	console.log(
		`\n结果：${failures.length === 0 ? `✅ ${pass} 项全过，可以部署` : `❌ ${failures.length} 项失败 / ${pass} 项通过`}`,
	)
	if (failures.length) {
		console.log('\n失败项：')
		for (const f of failures) console.log(`  · ${f}`)
		console.log('\n线上进程未被触碰。修好后重跑本脚本，或直接中止本次部署。')
	}
	process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((error) => {
	console.error('探活脚本自身异常：', error)
	process.exit(1)
})
