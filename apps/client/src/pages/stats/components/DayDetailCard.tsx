import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { DetailRecord, DetailSummary } from '../../../stores/recordStore'
import { formatDuration, formatDurationLong, formatHM } from '../../../utils/date'
import { getIntervalText, getRecordMainText } from '../../../utils/recordDisplay'
import { getDateLabel, isToday } from '../utils'

interface DayDetailCardProps {
	activeType: string
	growthMetric: 'height' | 'weight'
	selectedDate: string
	items: DetailRecord[]
	summary: DetailSummary | null
	prevDaySummary: DetailSummary | null
	onOpenDetail: () => void
}

// 今日/某日总结卡：统计格（含「较昨日」对比）+ 当日记录时间线
export default function DayDetailCard({
	activeType,
	growthMetric,
	selectedDate,
	items,
	summary,
	prevDaySummary,
	onOpenDetail,
}: DayDetailCardProps) {
	// 身高/体重分开记录后，同一类型下只统计与展示当前指标的记录
	const growthItems =
		activeType === 'height_weight'
			? items.filter(item => item[growthMetric] != null)
			: items

	const avgIntervalText =
		summary?.avgIntervalMinutes != null
			? formatDuration(summary.avgIntervalMinutes)
			: '-'

	// 「较昨日」对比文案：昨日无数据或今日昨日都为 0 时不展示
	const buildDelta = (
		today: number | null | undefined,
		yesterday: number | null | undefined,
		format: (abs: number) => string = n => `${n}`,
	): string | undefined => {
		if (prevDaySummary == null) return undefined
		if (today == null || yesterday == null) return undefined
		if (today === 0 && yesterday === 0) return undefined
		const diff = today - yesterday
		if (diff === 0) return '较昨日 持平'
		return `较昨日 ${diff > 0 ? '+' : '-'}${format(Math.abs(diff))}`
	}

	let summaryTiles: { label: string; value: string; delta?: string }[]
	if (activeType === 'feeding') {
		summaryTiles = [
			{
				label: '总次数',
				value: `${summary?.count ?? 0}次`,
				delta: buildDelta(summary?.count, prevDaySummary?.count),
			},
			{
				label: '总奶量',
				value: `${summary?.totalAmount ?? 0}ml`,
				delta: buildDelta(
					summary?.totalAmount,
					prevDaySummary?.totalAmount,
					n => `${n}ml`,
				),
			},
			{
				label: '平均间隔',
				value: avgIntervalText,
				delta: buildDelta(
					summary?.avgIntervalMinutes,
					prevDaySummary?.avgIntervalMinutes,
					formatDuration,
				),
			},
		]
	} else if (activeType === 'diaper') {
		const breakdown = items.reduce(
			(acc, item) => {
				if (item.diaperStatus === 'wet') acc.wet++
				else if (item.diaperStatus === 'dirty') acc.dirty++
				else if (item.diaperStatus === 'both') acc.both++
				return acc
			},
			{ wet: 0, dirty: 0, both: 0 },
		)
		const breakdownParts: string[] = []
		if (breakdown.wet > 0) breakdownParts.push(`尿${breakdown.wet}`)
		if (breakdown.dirty > 0) breakdownParts.push(`拉${breakdown.dirty}`)
		if (breakdown.both > 0) breakdownParts.push(`都有${breakdown.both}`)
		summaryTiles = [
			{
				label: '总次数',
				value: `${summary?.count ?? 0}次`,
				delta: buildDelta(summary?.count, prevDaySummary?.count),
			},
			{ label: '类型分布', value: breakdownParts.join(' ') || '-' },
			{
				label: '平均间隔',
				value: avgIntervalText,
				delta: buildDelta(
					summary?.avgIntervalMinutes,
					prevDaySummary?.avgIntervalMinutes,
					formatDuration,
				),
			},
		]
	} else if (activeType === 'temperature') {
		summaryTiles = [
			{
				label: '总次数',
				value: `${summary?.count ?? 0}次`,
				delta: buildDelta(summary?.count, prevDaySummary?.count),
			},
			{
				label: '最新体温',
				value:
					summary?.latestTemperature != null
						? `${summary.latestTemperature}°C`
						: '-',
				delta: buildDelta(
					summary?.latestTemperature,
					prevDaySummary?.latestTemperature,
					n => `${n.toFixed(1)}℃`,
				),
			},
			{
				label: '平均间隔',
				value: avgIntervalText,
				delta: buildDelta(
					summary?.avgIntervalMinutes,
					prevDaySummary?.avgIntervalMinutes,
					formatDuration,
				),
			},
		]
	} else {
		summaryTiles = [
			{
				label: '总次数',
				value: `${summary?.count ?? 0}次`,
				delta: buildDelta(summary?.count, prevDaySummary?.count),
			},
			{
				label: '总时长',
				value: formatDurationLong(summary?.totalDuration ?? 0),
				delta: buildDelta(
					summary?.totalDuration,
					prevDaySummary?.totalDuration,
					formatDuration,
				),
			},
			{
				label: '平均清醒间隔',
				value: avgIntervalText,
				delta: buildDelta(
					summary?.avgIntervalMinutes,
					prevDaySummary?.avgIntervalMinutes,
					formatDuration,
				),
			},
		]
	}

	return (
		<View className="detail-card">
			<View className="detail-card-header">
				<View className="section-heading">
					<View className="section-heading-icon summary-heading-icon">
						<View className="summary-icon-bar summary-icon-bar-short" />
						<View className="summary-icon-bar summary-icon-bar-medium" />
						<View className="summary-icon-bar summary-icon-bar-tall" />
					</View>
					<Text className="section-heading-title">
						{isToday(selectedDate)
							? '今日总结'
							: `${getDateLabel(selectedDate)}总结`}
					</Text>
				</View>
				<View className="detail-link" onClick={onOpenDetail}>
					<Text>完整明细 ›</Text>
				</View>
			</View>

			<View className="summary-tiles">
				{summaryTiles.map(tile => (
					<View key={tile.label} className="summary-tile">
						<Text className="summary-tile-value">{tile.value}</Text>
						<Text className="summary-tile-label">{tile.label}</Text>
						{tile.delta && (
							<Text className="summary-tile-delta">{tile.delta}</Text>
						)}
					</View>
				))}
			</View>

			{growthItems.length > 0 ? (
				<View className="timeline">
					{growthItems.map((item, idx) => (
						<View key={item.id} className="timeline-item">
							<View className="timeline-track">
								<View className="timeline-dot" />
								{idx < growthItems.length - 1 && (
									<View className="timeline-line" />
								)}
							</View>
							<View className="timeline-content">
								<View className="timeline-row">
									<Text className="timeline-time">
										{formatHM(item.startTime)}
									</Text>
									<Text className="timeline-interval">
										{getIntervalText(activeType, item.intervalMinutes)}
									</Text>
								</View>
								<View className="timeline-text-row">
									<View className="timeline-text-content">
										<Text className="timeline-text">
											{getRecordMainText(activeType, item, growthMetric)}
										</Text>
										{item.note && (
											<Text className="timeline-note">
												备注：{item.note}
											</Text>
										)}
									</View>
									{activeType === 'diaper' && item.diaperImage && (
										<Image
											className="timeline-thumb"
											src={item.diaperImage}
											mode="aspectFill"
											onClick={() => {
												const url = item.diaperImage
												if (!url) return
												Taro.previewImage({
													current: url,
													urls: [url],
												})
											}}
										/>
									)}
								</View>
							</View>
						</View>
					))}
				</View>
			) : (
				<View className="timeline-empty">
					<Text>这一天还没有记录</Text>
				</View>
			)}
		</View>
	)
}
