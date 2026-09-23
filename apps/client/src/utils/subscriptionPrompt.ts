/**
 * 「记录保存后」订阅引导的策略中枢：频控判定 + 组合授权请求。
 *
 * 三条规则（2026-09-20 与产品侧对齐）：
 * ① 只在「每日回顾额度为 0」时引导（有额度不贪要）；每 7 天最多引导一次；
 *    用户在微信弹窗里点拒绝后 30 天内不再打扰
 * ② 不直接弹微信授权框——先弹自绘的「价值预告」半屏卡（SubscriptionPromptSheet），
 *    用户在卡上主动点「开启提醒」的 tap 回调里才调 requestSubscribeMessage
 * ③ 一次弹窗组合请求 [每日回顾, 疫苗提醒]（都启用的前提下）：用户点一次同意，两模板各 +1 额度
 * ④ 对勾了「总是保持以上选择」的用户走静默续期：保存记录时同步发起授权请求（不弹窗）+1 额度，
 *    每天最多一次 —— 否则 7 天冷却等于每人每周只能收到一晚回顾
 */
import Taro from '@tarojs/taro'
import { notificationApi, trackEvent } from './request'

const LAST_PROMPT_KEY = 'subscribe:prompt:lastAt'
const REJECT_KEY = 'subscribe:prompt:rejectAt'
const SILENT_DATE_KEY = 'subscribe:silent:lastDate'
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
/** 本地日号，用于「静默续期每天最多试一次」 */
const todayKey = () => {
	const d = new Date()
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
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
		// 勾了「总是保持以上选择」的用户走静默续期，不必再出卡（出了也只是白打扰一次）
		if (await isAlwaysAllowedFor(config.reviewTemplateId)) return null

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

/**
 * ── 静默续期（2026-09-23）────────────────────────────────
 * 用户在微信弹窗里勾过「总是保持以上选择」并允许之后，requestSubscribeMessage 不再弹窗、
 * 直接返回 accept。于是在「保存记录」的 tap 回调里同步调它 = 记一笔攒一晚推送，全程无感。
 * 这是 7 天引导冷却之外唯一合法的提频路径：一次性订阅每次 accept 只给 1 条下发，
 * 同一 tmplId 一次调用传多份会被去重。判定不中就干脆不试（宁可少补一次，绝不骚扰）。
 */
export interface SilentRenewPlan {
	tmplId: string
}

/**
 * itemSettings 历史上有两种形状（数组 / 以模板 ID 为键的对象），两种都认；
 * 认不出来一律判否 —— 判是才会在 tap 里发起调用，误判是"打扰"，误判否只是"少补一次"。
 */
function isAlwaysAllowed(setting: any, tmplId: string): boolean {
	if (!setting || Number(setting.mainSwitch ?? 1) === 0) return false
	const items = setting.itemSettings
	if (!items) return false
	const entries: Array<[string, any]> = Array.isArray(items)
		? items.map((item: any) => [String(item?.templateId ?? ''), item])
		: Object.entries(items)
	const hit = entries.find(([id]) => id === tmplId)
	if (!hit) return false
	const value: any = hit[1]
	const enabled =
		value !== null && typeof value === 'object'
			? (value.pushEnabled ?? value.accept ?? value.status)
			: value
	return enabled === 1 || enabled === true || enabled === 'accept'
}

/** 读微信侧的持久化选择；读不到一律按"没有"处理（不猜） */
async function isAlwaysAllowedFor(tmplId: string): Promise<boolean> {
	const settingRes: any = await Taro.getSetting({ withSubscriptions: true } as any).catch(
		() => null,
	)
	return isAlwaysAllowed(settingRes?.subscriptionsSetting, tmplId)
}

/**
 * 进页面时预取续期资格（tap 回调里不能 await 网络，所以判定必须提前做好）。
 * 全部命中才返回计划：不在拒绝冷却 / 今天还没试过 / 回顾模板可用 / 服务端额度为 0 /
 * 且用户对这张模板做过"总是保持以上选择"的允许。
 */
export async function getSilentRenewPlan(): Promise<SilentRenewPlan | null> {
	try {
		if (elapsed(REJECT_KEY) < 30 * DAY_MS) return null
		if (String(Taro.getStorageSync(SILENT_DATE_KEY) || '') === todayKey()) return null

		const configRes = await notificationApi.getConfig()
		const config = configRes.data
		const tmplId = config?.reviewTemplateId
		if (!config?.reviewEnabled || !tmplId) return null

		const status = await notificationApi
			.getStatus('review')
			.then(r => r.data)
			.catch(() => null)
		if (!status || status.availableCount > 0) return null

		return (await isAlwaysAllowedFor(tmplId)) ? { tmplId } : null
	} catch {
		return null
	}
}

/**
 * 在保存按钮的 tap 回调最开头同步发起（早于任何 await），否则微信判为"非用户手势"。
 * 返回收尾函数：保存成功后 await 它，把自报结果入账。当天只试一次（一晚只需一条，
 * 攒多了也是库存），且无论成败都记时间戳，避免失败后每次保存都撞一遍。
 */
export function startSilentRenew(
	plan: SilentRenewPlan | null,
): (() => Promise<void>) | null {
	if (!plan) return null
	const requestSubscribeMessage = (Taro as any).requestSubscribeMessage
	if (typeof requestSubscribeMessage !== 'function') return null

	Taro.setStorageSync(SILENT_DATE_KEY, todayKey())
	let pending: Promise<any>
	try {
		pending = requestSubscribeMessage({ tmplIds: [plan.tmplId] })
	} catch {
		// 桥接层同步异常不能让保存流程跟着挂：当天作废，静默放弃
		return null
	}
	return async () => {
		try {
			const result = await pending
			const status = result?.[plan.tmplId] || 'unknown'
			if (status === 'accept' || status === 'reject') {
				await notificationApi.saveSubscriptions({ [plan.tmplId]: status })
			}
			if (status === 'reject') Taro.setStorageSync(REJECT_KEY, now())
			void trackEvent('subscription_silent_renew', { status })
		} catch {
			// 静默路径失败一律不打扰：不 toast、不改任何 UI
			void trackEvent('subscription_silent_renew', { status: 'error' })
		}
	}
}
