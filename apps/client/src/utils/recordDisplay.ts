import { formatDuration, formatDurationLong } from './date'

// 支持"明细+间隔"展示的记录类型；身高/体重为独立入口，用 metric 区分（type 同为 height_weight）
export interface DetailTypeTab {
	type: string
	metric?: 'height' | 'weight'
	label: string
	icon: string
}

// 统计页 tab 用的类型列表（保持原有 6 类，新类型不上统计页 tab）
export const detailTypeTabs: DetailTypeTab[] = [
	{ type: 'feeding', label: '喂奶', icon: '🍼' },
	{ type: 'diaper', label: '尿布', icon: '💩' },
	{ type: 'sleep', label: '睡觉', icon: '😴' },
	{ type: 'height_weight', metric: 'height', label: '身高', icon: '📏' },
	{ type: 'height_weight', metric: 'weight', label: '体重', icon: '⚖️' },
	{ type: 'temperature', label: '体温', icon: '🌡️' },
	{ type: 'vaccine', label: '疫苗', icon: '💉' },
]

// 记录明细页标题用的全量类型信息（含所有可记录类型；height/weight 共用 height_weight 类型、按 metric 区分）
export const detailTypeInfo: DetailTypeTab[] = [
	...detailTypeTabs,
	{ type: 'food', label: '辅食', icon: '🍚' },
	{ type: 'water', label: '喝水', icon: '💧' },
	{ type: 'medicine', label: '用药', icon: '💊' },
	{ type: 'bath', label: '洗澡', icon: '🛁' },
	{ type: 'outdoor', label: '户外活动', icon: '🌳' },
]

export const feedingMethodLabel: Record<string, string> = {
	breast: '母乳',
	formula: '奶粉',
	mixed: '混合',
}
export const diaperStatusLabel: Record<string, string> = {
	wet: '尿了',
	dirty: '拉了',
	both: '都有',
}

/** 某条明细记录的主要展示文案，如 "母乳 150ml" / "混合 · 母乳80ml + 奶粉60ml" / "尿了" / "睡了 1小时30分"；身高体重可传 metric 只展示对应一项 */
export function getRecordMainText(
	type: string,
	item: any,
	metric?: string | null,
): string {
	if (type === 'feeding') {
		if (item.feedingMethod === 'mixed') {
			return `混合 · 母乳${item.breastAmount || 0}ml + 奶粉${item.formulaAmount || 0}ml`
		}
		const method = feedingMethodLabel[item.feedingMethod] || item.feedingMethod
		return `${method}${item.amount ? ` ${item.amount}ml` : ''}`
	}
	if (type === 'diaper') {
		return diaperStatusLabel[item.diaperStatus] || item.diaperStatus
	}
	if (type === 'sleep') {
		return `睡了 ${formatDurationLong(item.duration || 0)}`
	}
	if (type === 'height_weight') {
		const parts: string[] = []
		if (item.height != null && metric !== 'weight') parts.push(`${item.height}cm`)
		if (item.weight != null && metric !== 'height') parts.push(`${item.weight}kg`)
		return parts.join(' / ') || '-'
	}
	if (type === 'temperature') {
		return item.temperature != null ? `${item.temperature}°C` : '-'
	}
	if (type === 'vaccine') {
		const dose = item.vaccineDose ? ` 第${item.vaccineDose}剂` : ''
		return `${item.vaccineName || '疫苗'}${dose}`
	}
	if (type === 'food') {
		return item.foodName || '-'
	}
	if (type === 'water') {
		return item.amount != null ? `${item.amount}ml` : '-'
	}
	if (type === 'medicine') {
		return [item.medicineName, item.medicineDose].filter(Boolean).join(' · ') || '-'
	}
	if (type === 'bath') {
		return '洗澡'
	}
	if (type === 'outdoor') {
		const parts: string[] = []
		if (item.outdoorLocation) parts.push(item.outdoorLocation)
		if (item.duration != null) parts.push(formatDurationLong(item.duration))
		return parts.join(' · ') || '-'
	}
	return ''
}

/** 间隔展示文案，睡眠类型展示的是"清醒"时长，其余是"距上次" */
export function getIntervalText(
	type: string,
	intervalMinutes: number | null,
): string {
	if (intervalMinutes == null) return '首次记录'
	const labelMap: Record<string, string> = {
		sleep: '清醒',
		height_weight: '距上次',
		temperature: '距上次',
	}
	const label = labelMap[type] || '距上次'
	return `${label} ${formatDuration(intervalMinutes)}`
}

/** 表格等紧凑场景下的间隔展示文案，无"首次记录"时返回 "-" */
export function getIntervalShortText(intervalMinutes: number | null): string {
	return intervalMinutes == null ? '-' : formatDuration(intervalMinutes)
}
