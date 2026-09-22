import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'

/**
 * 按用户的固定窗口计数限流。
 *
 * 为什么自己写：项目里没有任何 cron/调度依赖，后台登录锁定也是进程内计数，
 * 引 @nestjs/throttler 要为四个端点新增一层装饰器 + 全局 Guard，收益一样、依赖多一个；
 * Nest 10 也没有 TooManyRequestsException，这里直接抛 429。
 *
 * 计数在内存里，`pm2 restart` 后清零 —— 与 admin 登录锁同一套取舍：
 * 这些限制目的是"挡住脚本刷"，不是"绝对不许超"，重启带来的窗口重置可接受。
 * 阈值都按真实使用量的数倍留余量（正常家长每天记录几十条、传图远不到 200 张）。
 */
const RULES = {
	/** 查邀请卡信息：爆破邀请码的主要探测面 */
	'family-invite-lookup': { limit: 30, windowMs: 60 * 60 * 1000 },
	/** 接受邀请：命中即拿到别人宝宝的全部数据，卡得最紧 */
	'family-invite-accept': { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
	/** 图片上传：每张都会写进又拍云并算流量 */
	upload: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
	/** 便便 AI：每次一发智谱请求，直接对应额度与费用 */
	'stool-analysis': { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
	/** 订阅授权入账（客户端自报）：刷的是我们自己的统计口径 */
	'subscription-grant': { limit: 20, windowMs: 24 * 60 * 60 * 1000 },
} as const

type Bucket = keyof typeof RULES

@Injectable()
export class RateLimitService {
	private readonly logger = new Logger(RateLimitService.name)
	private readonly hits = new Map<string, { count: number; resetAt: number }>()

	/** 超限抛 429；正常用户碰不到这条线 */
	assert(bucket: Bucket, userId: string) {
		const rule = RULES[bucket]
		const now = Date.now()
		const key = `${bucket}:${userId}`
		const current = this.hits.get(key)

		if (!current || current.resetAt <= now) {
			this.hits.set(key, { count: 1, resetAt: now + rule.windowMs })
			this.cleanup(now)
			return
		}
		current.count += 1
		if (current.count > rule.limit) {
			const hours = Math.max(1, Math.ceil((current.resetAt - now) / 3_600_000))
			this.logger.warn(`限流命中 ${bucket} user=${userId}（${rule.limit} 次窗口内）`)
			throw new HttpException(
				`操作太频繁，请 ${hours} 小时后再试`,
				HttpStatus.TOO_MANY_REQUESTS,
			)
		}
	}

	/** 键会随用户数增长，超过阈值时清掉已过期的窗口 */
	private cleanup(now: number) {
		if (this.hits.size < 5000) return
		for (const [key, value] of this.hits) {
			if (value.resetAt <= now) this.hits.delete(key)
		}
	}
}
