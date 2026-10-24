import { TodaySummary } from '../../stores/recordStore'
import { formatDuration, formatHM } from '../../utils/date'

export interface HandoffRow {
	label: string
	value: string
}

export interface HandoffPayload {
	rows: HandoffRow[]
	text: string
	shareTitle: string
}

const RECENT_WINDOW_MINUTES = 24 * 60

interface BuildHandoffParams {
	summary: TodaySummary | null
	latestTemperature: { temperature: number; date: string } | null
	now: number
}

function clockNear(now: number, value: string) {
	const date = new Date(value)
	const today = new Date(now)
	const sameDay = date.toDateString() === today.toDateString()
	return `${sameDay ? '今天' : '昨天'} ${formatHM(date)}`
}

// 交接班要一眼看完：状态 → 上一顿 → 今日合计 → 尿布 → 24h 内的体温/用药
export function buildHandoff({
	summary,
	latestTemperature,
	now,
}: BuildHandoffParams): HandoffPayload {
	const minutesSince = (value?: string | null) => {
		if (!value) return null
		const diff = Math.floor((now - new Date(value).getTime()) / 60000)
		return diff >= 0 ? diff : null
	}

	const feedingMinutes = minutesSince(summary?.lastFeedingAt)
	const awakeMinutes = minutesSince(summary?.lastSleepEndAt)
	const diaperMinutes = minutesSince(summary?.lastDiaperAt)
	const medicineMinutes = minutesSince(summary?.lastMedicineAt)

	const statusValue =
		awakeMinutes == null ? '还没有睡眠记录' : `醒着，已醒 ${formatDuration(awakeMinutes)}`

	const feedingAmount =
		summary?.lastFeedingAmount != null ? `${summary.lastFeedingAmount}ml · ` : ''
	const feedingValue =
		feedingMinutes == null
			? '还没有喂奶记录'
			: `${feedingAmount}${formatHM(summary!.lastFeedingAt!)}（${formatDuration(feedingMinutes)}前）`

	const todayParts = [
		`喂奶 ${summary?.feedingCount || 0} 次${
			summary?.totalMilk ? ` ${summary.totalMilk}ml` : ''
		}`,
		`睡眠 ${formatDuration(summary?.sleepTotal || 0)}`,
		`尿布 ${summary?.diaperCount || 0} 次`,
	]

	const rows: HandoffRow[] = [
		{ label: '宝宝状态', value: statusValue },
		{ label: '上次喂奶', value: feedingValue },
		{ label: '今日已记', value: todayParts.join(' · ') },
		{
			label: '上次尿布',
			value:
				diaperMinutes == null
					? '还没有尿布记录'
					: `${formatHM(summary!.lastDiaperAt!)}（${formatDuration(diaperMinutes)}前）`,
		},
	]

	const tempMinutes = latestTemperature
		? minutesSince(latestTemperature.date)
		: null
	if (
		latestTemperature &&
		tempMinutes != null &&
		tempMinutes <= RECENT_WINDOW_MINUTES
	) {
		rows.push({
			label: '最近体温',
			value: `${latestTemperature.temperature}℃（${clockNear(now, latestTemperature.date)}）`,
		})
	}

	if (
		summary?.lastMedicineAt &&
		medicineMinutes != null &&
		medicineMinutes <= RECENT_WINDOW_MINUTES
	) {
		const name = summary.lastMedicineName || '用药'
		const dose = summary.lastMedicineDose ? ` ${summary.lastMedicineDose}` : ''
		rows.push({
			label: '最近用药',
			value: `${name}${dose}（${clockNear(now, summary.lastMedicineAt)}）`,
		})
	}

	const text = [
		`【宝宝交接】${formatHM(new Date(now))}`,
		...rows.map(row => `${row.label}：${row.value}`),
		'—— 来自育娃手记',
	].join('\n')

	const shareHeadline =
		feedingMinutes != null
			? `${formatHM(summary!.lastFeedingAt!)} 喂了${
					summary?.lastFeedingAmount != null
						? ` ${summary.lastFeedingAmount}ml`
						: '奶'
				}`
			: statusValue
	const shareTitle = `宝宝交接：${shareHeadline}${
		awakeMinutes != null ? `，已醒 ${formatDuration(awakeMinutes)}` : ''
	}`

	return { rows, text, shareTitle }
}
