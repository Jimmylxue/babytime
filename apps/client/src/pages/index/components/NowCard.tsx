import { Image, View, Text } from '@tarojs/components'
import clockWhiteIcon from '../../../assets/ui-icons/clock-white.svg'
import { FeedingRhythm, TodaySummary } from '../../../stores/recordStore'
import {
	calculateAge,
	formatDuration,
	formatDurationLong,
	formatHM,
} from '../../../utils/date'
import { getWakeWindow } from '../../../utils/wakeWindow'

interface NowCardProps {
	birthday: string
	summary: TodaySummary | null
	rhythm: FeedingRhythm | null
	now: number
	onOpenHandoff: () => void
}

export default function NowCard({
	birthday,
	summary,
	rhythm,
	now,
	onOpenHandoff,
}: NowCardProps) {
	const minutesSince = (value?: string | null) => {
		if (!value) return null
		const diff = Math.floor((now - new Date(value).getTime()) / 60000)
		return diff >= 0 ? diff : null
	}

	const feedingMinutes = minutesSince(summary?.lastFeedingAt)
	const awakeMinutes = minutesSince(summary?.lastSleepEndAt)

	const intervalMinutes = rhythm?.intervalMinutes ?? null
	const nextFeedingAt =
		summary?.lastFeedingAt && intervalMinutes != null
			? new Date(
					new Date(summary.lastFeedingAt).getTime() + intervalMinutes * 60000,
				)
			: null

	const wakeWindow = getWakeWindow(calculateAge(birthday).months)
	// 清醒时间明显超出参考窗口时更可能漏记了睡眠，不再给出闹觉提示
	const awakeForHint =
		awakeMinutes != null &&
		wakeWindow &&
		awakeMinutes <= wakeWindow.maxMinutes + 120
			? awakeMinutes
			: null

	// 喂奶文案统一带上次的钟点时间，方便交接时直接说「几点喂的」
	const lastFeedingClock = summary?.lastFeedingAt
		? formatHM(summary.lastFeedingAt)
		: null

	let insight = '宝宝节奏平稳'
	let insightDetail = nextFeedingAt
		? `上次喂奶 ${lastFeedingClock} · 下次约 ${formatHM(nextFeedingAt)}`
		: feedingMinutes != null
			? `上次喂奶 ${lastFeedingClock} · ${formatDurationLong(feedingMinutes)}前`
			: '记下吃睡日常，这里会慢慢看出宝宝的节奏'
	let insightTone = 'calm'
	if (
		feedingMinutes != null &&
		intervalMinutes != null &&
		feedingMinutes >= intervalMinutes + 30
	) {
		insight = '差不多该喂奶了'
		insightDetail = `上次喂奶 ${lastFeedingClock} · 平时约 ${formatDuration(intervalMinutes)}一次`
		insightTone = 'warm'
	} else if (
		awakeForHint != null &&
		wakeWindow &&
		awakeForHint >= wakeWindow.maxMinutes
	) {
		insight = '可能有点闹觉'
		insightDetail = `已醒 ${formatDurationLong(awakeForHint)}，可以留意睡眠信号`
		insightTone = 'warm'
	} else if (
		awakeForHint != null &&
		wakeWindow &&
		awakeForHint >= wakeWindow.minMinutes
	) {
		insight = '可能快困了'
		insightDetail = `已醒 ${formatDurationLong(awakeForHint)}，可以留意揉眼、打哈欠`
		insightTone = 'warm'
	} else if (feedingMinutes == null) {
		insight = '先记一笔，慢慢看出规律'
		insightDetail =
			awakeMinutes == null
				? '从喂奶、睡眠或尿布开始都可以'
				: '再记几顿奶，就能看到宝宝的喂奶节奏'
	}

	return (
		<View className={`now-card ${insightTone}`}>
			<View className="now-card-icon">
				<Image className="now-card-icon-img" src={clockWhiteIcon} />
			</View>
			<View className="now-card-copy">
				<Text className={`now-insight ${insightTone}`}>{insight}</Text>
				<Text className="now-insight-detail">{insightDetail}</Text>
			</View>
			<View className="now-handoff" onClick={onOpenHandoff}>
				<Text className="now-handoff-text">交接给家人</Text>
				<Text className="now-handoff-arrow">›</Text>
			</View>
		</View>
	)
}
