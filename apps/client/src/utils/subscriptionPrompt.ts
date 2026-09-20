/**
 * 「记录保存后」订阅引导的策略中枢：频控判定 + 组合授权请求。
 *
 * 三条规则（2026-09-20 与产品侧对齐）：
 * ① 只在「每日回顾额度为 0」时引导（有额度不贪要）；每 7 天最多引导一次；
 *    用户在微信弹窗里点拒绝后 30 天内不再打扰
 * ② 不直接弹微信授权框——先弹自绘的「价值预告」半屏卡（SubscriptionPromptSheet），
 *    用户在卡上主动点「开启提醒」的 tap 回调里才调 requestSubscribeMessage
 * ③ 一次弹窗组合请求 [每日回顾, 疫苗提醒]（都启用的前提下）：用户点一次同意，两模板各 +1 额度
 */
import Taro from '@tarojs/taro'
import { notificationApi, trackEvent } from './request'

const LAST_PROMPT_KEY = 'subscribe:prompt:lastAt'
const REJECT_KEY = 'subscribe:prompt:rejectAt'
const DAY_MS = 24 * 60 * 60 * 1000

export interface SubscriptionPromptPlan {
	/** 要一并申请的模板 ID（按启用状态与额度余量筛过） */
	tmplIds: string[]
	/** 预告卡上展示哪些价值点 */
	showReview: boolean
	showVaccine: boolean
}

const now = () => Date.now()
const elapsed = (key: string) => {
	const at = Number(Taro.getStorageSync(key) || 0)
	return at ? now() - at : Infinity
}

/**
 * 是否应该展示「价值预告」卡。任何一步拿不准都返回 null（不打扰）：
 * 配置/状态接口失败时宁可不弹，也不对着已有额度的用户重复要授权。
 */
export async function getSubscriptionPromptPlan(): Promise<SubscriptionPromptPlan | null> {
	try {
		if (elapsed(LAST_PROMPT_KEY) < 7 * DAY_MS) return null
		if (elapsed(REJECT_KEY) < 30 * DAY_MS) return null

		const configRes = await notificationApi.getConfig()
		const config = configRes.data
		if (!config?.vaccineEnabled && !config?.reviewEnabled) return null
		// 引导的主目的是回流量（每日回顾）；模板没配好就不启动这套
		if (!config?.reviewEnabled || !config.reviewTemplateId) return null

		const [reviewStatus, vaccineStatus] = await Promise.all([
			notificationApi.getStatus('review').then(r => r.data).catch(() => null),
			config.vaccineEnabled && config.vaccineTemplateId
				? notificationApi.getStatus('vaccine').then(r => r.data).catch(() => null)
				: Promise.resolve(null),
		])
		if (!reviewStatus || reviewStatus.availableCount > 0) return null

		const showVaccine =
			!!vaccineStatus && vaccineStatus.availableCount === 0
		const tmplIds = [config.reviewTemplateId]
		if (showVaccine) tmplIds.push(config.vaccineTemplateId)
		return { tmplIds, showReview: true, showVaccine }
	} catch {
		return null
	}
}

/** 预告卡曝光时记一次时间戳（7 天冷却从这里起算，与用户是否操作微信弹窗无关） */
export function markPromptShown() {
	Taro.setStorageSync(LAST_PROMPT_KEY, now())
	void trackEvent('subscription_prompt_show', { source: 'record_saved' })
}

/**
 * 执行微信授权弹窗：必须在按钮 tap 回调里直接调用（不能先 await 网络）。
 * 返回各模板的授权结果；用户在弹窗点「拒绝」时记 30 天冷却。
 */
export async function runCombinedSubscribe(
	plan: SubscriptionPromptPlan,
): Promise<'accept' | 'reject' | 'error'> {
	const requestSubscribeMessage = (Taro as any).requestSubscribeMessage
	if (typeof requestSubscribeMessage !== 'function') return 'error'
	try {
		const result = await requestSubscribeMessage({ tmplIds: plan.tmplIds })
		const statuses: Record<string, string> = {}
		for (const tmplId of plan.tmplIds) {
			statuses[tmplId] = result?.[tmplId] || 'unknown'
		}
		await notificationApi.saveSubscriptions(statuses)
		for (const tmplId of plan.tmplIds) {
			void trackEvent('subscription_prompt_result', {
				template: tmplId === plan.tmplIds[0] ? 'review' : 'vaccine',
				status: statuses[tmplId],
				source: 'record_saved',
			})
		}
		const anyRejected = Object.values(statuses).some(s => s === 'reject')
		if (anyRejected) Taro.setStorageSync(REJECT_KEY, now())
		return anyRejected ? 'reject' : 'accept'
	} catch (error: any) {
		// 用户在微信弹窗点「取消」也走这里：视为一次完整曝光，不额外记拒绝（冷却已记）
		console.error('combined subscribe failed', error)
		void trackEvent('subscription_prompt_result', {
			template: 'review',
			status: 'error',
			source: 'record_saved',
		})
		return 'error'
	}
}
