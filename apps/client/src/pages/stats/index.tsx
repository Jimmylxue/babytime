import { View, Text, ScrollView, Picker, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore, DailyStat, HeightWeightTrendPoint, TemperatureTrendPoint } from '../../stores/recordStore'
import { formatDate, formatDuration, formatDurationLong, formatHM } from '../../utils/date'
import { needLogin } from '../../utils/needLogin'
import { MOCK_STATS, MOCK_DETAIL } from '../../utils/mock'
import { detailTypeTabs, getRecordMainText, getIntervalText } from '../../utils/recordDisplay'
import TabBar from '../../components/TabBar'
import './index.scss'

function isToday(dateStr: string): boolean {
	return dateStr === formatDate(new Date())
}

function shiftDate(dateStr: string, delta: number): string {
	const d = new Date(dateStr)
	d.setDate(d.getDate() + delta)
	return formatDate(d)
}

function getDateLabel(dateStr: string): string {
	if (isToday(dateStr)) return '今天'
	if (dateStr === shiftDate(formatDate(new Date()), -1)) return '昨天'
	const d = new Date(dateStr)
	const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
	return `${d.getMonth() + 1}月${d.getDate()}日 ${weekLabels[d.getDay()]}`
}

interface GrowthSeriesPoint extends HeightWeightTrendPoint {
	heightMeasured: boolean
	weightMeasured: boolean
}

export default function StatsPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const {
		dailyStats,
		heightWeightTrend,
		temperatureTrend,
		latestHeightWeight,
		latestTemperature,
		fetchStats,
		detailItems,
		detailSummary,
		fetchDetail,
		fetchDetailSummary,
	} = useRecordStore()
	const [days, setDays] = useState(7)
	const [activeType, setActiveType] = useState('feeding')
	const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
	const [growthChartRatio, setGrowthChartRatio] = useState(0.46)

	// 每次进入统计页都重新拉一次最新的宝宝信息和数据，避免拿到切换宝宝前的旧数据
	useDidShow(() => {
		if (!isLoggedIn) return
		useBabyStore.getState().fetchBabies().then(() => {
			const baby = useBabyStore.getState().currentBaby
			if (baby) {
				fetchStats(baby.id, days)
				fetchDetail(baby.id, activeType, { date: selectedDate })
				fetchDetailSummary(baby.id, activeType, { date: selectedDate })
			}
		})
	})

	useEffect(() => {
		if (isLoggedIn && currentBaby) {
			fetchDetail(currentBaby.id, activeType, { date: selectedDate })
			fetchDetailSummary(currentBaby.id, activeType, { date: selectedDate })
		}
	}, [isLoggedIn, currentBaby?.id, activeType, selectedDate])

	useEffect(() => {
		if (activeType !== 'height_weight' && activeType !== 'temperature') return
		Taro.nextTick(() => {
			Taro.createSelectorQuery()
				.select('.line-chart')
				.boundingClientRect((rect) => {
					if (rect?.width && rect.height) {
						setGrowthChartRatio(rect.height / rect.width)
					}
				})
				.exec()
		})
	}, [activeType, days, heightWeightTrend.length, temperatureTrend.length])

	const handleDaysChange = (newDays: number) => {
		setDays(newDays)
		if (currentBaby) {
			fetchStats(currentBaby.id, newDays)
		}
	}

	const handleDateChange = (newDate: string) => {
		const today = formatDate(new Date())
		if (newDate > today) return
		setSelectedDate(newDate)
	}

	const goToFullDetail = (overrideType?: string) => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
			return
		}
		const t = overrideType || activeType
		Taro.navigateTo({ url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=${t}` })
	}

	const getMaxValue = (stats: DailyStat[], key: keyof DailyStat) => {
		return Math.max(...stats.map(s => (s[key] as number) || 0), 1)
	}

	const renderBarChart = (
		stats: DailyStat[],
		key: keyof DailyStat,
		label: string,
		unit: string = '',
	) => {
		const maxValue = getMaxValue(stats, key)
		const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

		return (
			<View className="chart-card">
				<Text className="chart-title">{label}</Text>
				<ScrollView scrollX className="chart-scroll-view" showScrollbar={false}>
					<View className="chart-container">
						{stats.map((stat) => {
							const value = (stat[key] as number) || 0
							const height = maxValue > 0 ? (value / maxValue) * 100 : 0
							const date = new Date(stat.date)
							const dayName = dayLabels[date.getDay()]

							return (
								<View key={stat.date} className="bar-group">
									<View className="bar-wrapper">
										<View className="bar" style={{ height: `${height}%` }}>
											{value > 0 && (
												<Text className="bar-value">
													{unit === '时'
														? formatDuration(value)
														: `${value}${unit}`}
												</Text>
											)}
										</View>
									</View>
									<Text className="bar-label">{dayName}</Text>
								</View>
							)
						})}
					</View>
				</ScrollView>
			</View>
		)
	}

	const buildGrowthSeries = (points: HeightWeightTrendPoint[], rangeDays: number): GrowthSeriesPoint[] => {
		const sortedPoints = points.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
		const start = new Date()
		start.setHours(0, 0, 0, 0)
		start.setDate(start.getDate() - rangeDays + 1)
		const heightValues: Array<number | null> = Array(rangeDays).fill(null)
		const weightValues: Array<number | null> = Array(rangeDays).fill(null)
		const heightMeasured = Array(rangeDays).fill(false)
		const weightMeasured = Array(rangeDays).fill(false)
		let baselineHeight: number | null = null
		let baselineWeight: number | null = null

		sortedPoints.forEach((point) => {
			const pointDate = new Date(formatDate(point.date))
			const index = Math.round((pointDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
			if (index < 0) {
				if (point.height != null) baselineHeight = point.height
				if (point.weight != null) baselineWeight = point.weight
				return
			}
			if (index >= rangeDays) return
			if (point.height != null) {
				heightValues[index] = point.height
				heightMeasured[index] = true
			}
			if (point.weight != null) {
				weightValues[index] = point.weight
				weightMeasured[index] = true
			}
		})

		const fillTrendValues = (values: Array<number | null>, baseline: number | null) => {
			const result = values.slice()
			const knownIndexes = values
				.map((value, index) => value == null ? null : index)
				.filter((index): index is number => index != null)
			if (baseline != null && !knownIndexes.includes(0)) {
				result[0] = baseline
				knownIndexes.unshift(0)
			}
			if (knownIndexes.length === 0) return result

			for (let index = 0; index < knownIndexes[0]; index++) {
				result[index] = result[knownIndexes[0]]
			}
			for (let index = 1; index < knownIndexes.length; index++) {
				const from = knownIndexes[index - 1]
				const to = knownIndexes[index]
				const fromValue = result[from] as number
				const toValue = result[to] as number
				for (let day = from + 1; day < to; day++) {
					result[day] = fromValue + ((toValue - fromValue) * (day - from)) / (to - from)
				}
			}
			for (let index = knownIndexes[knownIndexes.length - 1] + 1; index < rangeDays; index++) {
				result[index] = result[knownIndexes[knownIndexes.length - 1]]
			}
			return result
		}

		const filledHeights = fillTrendValues(heightValues, baselineHeight)
		const filledWeights = fillTrendValues(weightValues, baselineWeight)
		return Array.from({ length: rangeDays }, (_, index) => {
			const date = new Date(start)
			date.setDate(start.getDate() + index)
			return {
				date: date.toISOString(),
				height: filledHeights[index],
				weight: filledWeights[index],
				heightMeasured: heightMeasured[index],
				weightMeasured: weightMeasured[index],
			}
		})
	}

	const renderHeightWeightLineChart = (
		points: HeightWeightTrendPoint[],
		key: 'height' | 'weight',
		label: string,
		unit: string,
		lineClassName: string,
	) => {
		const values = points
			.map(point => point[key])
			.filter((value): value is number => value != null)
		if (values.length === 0) return null

		const minValue = Math.min(...values)
		const maxValue = Math.max(...values)
		const padding = Math.max((maxValue - minValue) * 0.2, key === 'height' ? 1 : 0.2)
		const lowerBound = minValue - padding
		const upperBound = maxValue + padding
		const range = upperBound - lowerBound || 1
		const plotPoints = points
			.map((point, index) => {
				const value = point[key]
				if (value == null) return null
				return {
					...point,
					value,
					x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
					y: ((value - lowerBound) / range) * 100,
				}
			})
			.filter((point): point is NonNullable<typeof point> => point != null)

		return (
			<View className="chart-card growth-chart-card">
				<View className="growth-chart-header">
					<Text className="chart-title">{label}</Text>
					<Text className="growth-chart-range">{lowerBound.toFixed(1)} - {upperBound.toFixed(1)}{unit}</Text>
				</View>
				<View className="growth-chart line-chart">
					<View className="growth-grid-line growth-grid-line-top" />
					<View className="growth-grid-line growth-grid-line-middle" />
					<View className="growth-grid-line growth-grid-line-bottom" />
					{points.map((point, index) => {
						const showDate = points.length <= 7 || index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0
						return showDate && <Text key={`${point.date}-date-${key}`} className="growth-date" style={{ left: `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100}%` }}>{formatDate(point.date).slice(5)}</Text>
					})}
					{plotPoints.map((point, index) => {
						const previous = plotPoints[index - 1]
						const dx = previous ? point.x - previous.x : 0
						const dy = previous ? point.y - previous.y : 0
						const angle = previous ? -Math.atan2(dy * growthChartRatio, dx) * (180 / Math.PI) : 0
						const length = previous ? Math.sqrt(dx * dx + (dy * growthChartRatio) * (dy * growthChartRatio)) : 0
						const measured = key === 'height'
							? (point as GrowthSeriesPoint).heightMeasured
							: (point as GrowthSeriesPoint).weightMeasured
						return (
							<View key={`${point.date}-${key}`}>
								{previous && (
									<View
										className={`growth-line ${lineClassName}`}
										style={{ left: `${previous.x}%`, bottom: `${previous.y}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }}
									/>
								)}
								{measured && (
									<View className={`growth-point ${lineClassName}`} style={{ left: `${point.x}%`, bottom: `${point.y}%` }}>
										<Text className="growth-value">{point.value}{unit}</Text>
									</View>
								)}
							</View>
						)
					})}
				</View>
			</View>
		)
	}

	const renderTemperatureLineChart = (points: TemperatureTrendPoint[]) => {
		const sortedPoints = points.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
		if (sortedPoints.length === 0) return null
		const rangeStart = new Date()
		rangeStart.setHours(0, 0, 0, 0)
		rangeStart.setDate(rangeStart.getDate() - days + 1)
		const rangeEnd = new Date()
		rangeEnd.setHours(23, 59, 59, 999)
		const timeRange = rangeEnd.getTime() - rangeStart.getTime()
		const detailedTimeline = days <= 7
		const dailyPoints = Array.from({ length: days }, (_, index) => {
			const date = new Date(rangeStart)
			date.setDate(rangeStart.getDate() + index)
			const readings = sortedPoints.filter(point => formatDate(point.date) === formatDate(date))
			if (readings.length === 0) return null
			return {
				date: date.toISOString(),
				temperature: Math.max(...readings.map(point => point.temperature)),
				lowestTemperature: Math.min(...readings.map(point => point.temperature)),
			}
		}).filter((point): point is { date: string; temperature: number; lowestTemperature: number } => point != null)
		const chartPoints = detailedTimeline ? sortedPoints : dailyPoints
		const values = chartPoints.flatMap(point => 'lowestTemperature' in point ? [point.temperature, point.lowestTemperature] : [point.temperature])
		const lowerBound = Math.floor((Math.min(...values) - 0.2) * 10) / 10
		const upperBound = Math.ceil((Math.max(...values) + 0.2) * 10) / 10
		const valueRange = upperBound - lowerBound || 1
		const plotPoints = chartPoints.reduce<Array<{ date: string; temperature: number; lowestTemperature?: number; x: number; y: number; lowY?: number; labelOffset: number }>>((result, point, index) => {
			const rawX = Math.max(0, Math.min(100, ((new Date(point.date).getTime() - rangeStart.getTime()) / timeRange) * 100))
			const previous = result[index - 1]
			// 同一时刻或相邻时刻的读数保留顺序，并留出最小可视间距避免重叠。
			const x = detailedTimeline
				? (previous && rawX - previous.x < 1.4 ? Math.min(100, previous.x + 1.4) : rawX)
				: (days === 1 ? 50 : Math.round((new Date(formatDate(point.date)).getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) / (days - 1) * 100)
			result.push({
				...point,
				x,
				// 底部留给日期轴，避免最低读数和横坐标重叠。
				y: 15 + ((point.temperature - lowerBound) / valueRange) * 85,
				lowY: 'lowestTemperature' in point ? 15 + ((point.lowestTemperature - lowerBound) / valueRange) * 85 : undefined,
				labelOffset: 24 + (index % 3) * 28,
			})
			return result
		}, [])
		const timeTicks = Array.from({ length: days }, (_, index) => {
			const date = new Date(rangeStart)
			date.setDate(rangeStart.getDate() + index)
			return { label: days <= 7 || index === 0 || index === days - 1 || index % Math.ceil(days / 6) === 0 ? formatDate(date).slice(5) : '', x: days === 1 ? 50 : (index / (days - 1)) * 100 }
		})
		const showAllValues = !detailedTimeline || plotPoints.length <= 8
		const chartWidth = detailedTimeline ? Math.max(days * 220, 750) : Math.max(days * 100, 750)
		const latestPointId = `temperature-point-${plotPoints.length - 1}`

		return (
			<View className="chart-card growth-chart-card temperature-chart-card">
				<View className="growth-chart-header">
					<Text className="chart-title">{detailedTimeline ? '体温趋势' : `近${days}天每日体温范围`}</Text>
					<Text className="growth-chart-range">{lowerBound.toFixed(1)} - {upperBound.toFixed(1)}°C</Text>
				</View>
				<ScrollView className="temperature-scroll" scrollX scrollIntoView={latestPointId} showScrollbar={false}>
				<View className="growth-chart line-chart temperature-chart temperature-chart-wide" style={{ width: `${chartWidth}rpx` }}>
					{[0, 50, 100].map(position => <View key={position} className="growth-grid-line" style={{ bottom: `${position}%` }} />)}
					{Array.from({ length: days - 1 }, (_, index) => <View key={index} className="temperature-day-divider" style={{ left: `${((index + 1) / days) * 100}%` }} />)}
					<Text className="temperature-axis-label temperature-axis-top">{upperBound.toFixed(1)}°</Text>
					<Text className="temperature-axis-label temperature-axis-middle">{(lowerBound + valueRange / 2).toFixed(1)}°</Text>
					<Text className="temperature-axis-label temperature-axis-bottom">{lowerBound.toFixed(1)}°</Text>
					{timeTicks.map(tick => <Text key={tick.x} className="growth-date" style={{ left: `${tick.x}%` }}>{tick.label}</Text>)}
					{plotPoints.map((point, index) => {
						const previous = plotPoints[index - 1]
						const dx = previous ? point.x - previous.x : 0
						const dy = previous ? point.y - previous.y : 0
						const angle = previous ? -Math.atan2(dy * growthChartRatio, dx) * (180 / Math.PI) : 0
						const length = previous ? Math.sqrt(dx * dx + (dy * growthChartRatio) * (dy * growthChartRatio)) : 0
						const showValue = showAllValues || index === 0 || index === plotPoints.length - 1 || point.temperature >= 37.5
						const highValueStyle = point.y > 80
							? { top: '24rpx', bottom: 'auto' }
							: { bottom: `${point.labelOffset}rpx` }
						return (
							<View key={`${point.date}-${point.temperature}`}>
								{previous && <View className="growth-line temperature-line" style={{ left: `${previous.x}%`, bottom: `${previous.y}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }} />}
								{point.lowY != null && point.lowY !== point.y && (
									<>
										<View className="temperature-range-bar" style={{ left: `${point.x}%`, bottom: `${point.lowY}%`, height: `${point.y - point.lowY}%` }} />
										<View className="temperature-low-point" style={{ left: `${point.x}%`, bottom: `${point.lowY}%` }}>
											<Text className="temperature-low-value">{point.lowestTemperature?.toFixed(1)}°</Text>
										</View>
									</>
								)}
								<View id={index === plotPoints.length - 1 ? latestPointId : undefined} className="growth-point temperature-point" style={{ left: `${point.x}%`, bottom: `${point.y}%` }}>
									{showValue && <Text className="growth-value" style={highValueStyle}>{point.temperature.toFixed(1)}°</Text>}
								</View>
							</View>
						)
					})}
				</View>
				</ScrollView>
			</View>
		)
	}

	// 未登录时使用 mock 数据
	const displayDailyStats = isLoggedIn && currentBaby ? dailyStats : MOCK_STATS.dailyStats
	const displayHeightWeightTrend = isLoggedIn && currentBaby ? heightWeightTrend : MOCK_STATS.heightWeightTrend
	const displayTemperatureTrend = isLoggedIn && currentBaby ? temperatureTrend : MOCK_STATS.temperatureTrend
	const displayHeightWeightSeries = buildGrowthSeries(displayHeightWeightTrend, days)
	const displayHeightWeight = isLoggedIn && currentBaby ? latestHeightWeight : MOCK_STATS.latestHeightWeight
	const displayTemperature = isLoggedIn && currentBaby ? latestTemperature : MOCK_STATS.latestTemperature
	const displayItems = isLoggedIn && currentBaby ? detailItems : MOCK_DETAIL[activeType].items
	const summary = isLoggedIn && currentBaby ? detailSummary : MOCK_DETAIL[activeType].summary

	const avgIntervalText = summary?.avgIntervalMinutes != null ? formatDuration(summary.avgIntervalMinutes) : '-'

	let summaryTiles: { label: string; value: string }[]
	if (activeType === 'feeding') {
		summaryTiles = [
			{ label: '总次数', value: `${summary?.count ?? 0}次` },
			{ label: '总奶量', value: `${summary?.totalAmount ?? 0}ml` },
			{ label: '平均间隔', value: avgIntervalText },
		]
	} else if (activeType === 'diaper') {
		const breakdown = displayItems.reduce(
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
			{ label: '总次数', value: `${summary?.count ?? 0}次` },
			{ label: '类型分布', value: breakdownParts.join(' ') || '-' },
			{ label: '平均间隔', value: avgIntervalText },
		]
	} else if (activeType === 'height_weight') {
		summaryTiles = [
			{ label: '总次数', value: `${summary?.count ?? 0}次` },
			{ label: '最新身高', value: summary?.latestHeight != null ? `${summary.latestHeight}cm` : '-' },
			{ label: '最新体重', value: summary?.latestWeight != null ? `${summary.latestWeight}kg` : '-' },
		]
	} else if (activeType === 'temperature') {
		summaryTiles = [
			{ label: '总次数', value: `${summary?.count ?? 0}次` },
			{ label: '最新体温', value: summary?.latestTemperature != null ? `${summary.latestTemperature}°C` : '-' },
			{ label: '平均间隔', value: avgIntervalText },
		]
	} else {
		summaryTiles = [
			{ label: '总次数', value: `${summary?.count ?? 0}次` },
			{ label: '总时长', value: formatDurationLong(summary?.totalDuration ?? 0) },
			{ label: '平均清醒间隔', value: avgIntervalText },
		]
	}

	return (
		<View className="page">
			{/* 最新数据 */}
			<View className="latest-section">
				<Text className="section-title">最新数据</Text>
				<View className="latest-grid">
					{displayHeightWeight && (
						<View className="latest-card" onClick={goToFullDetail.bind(null, 'height_weight')}>
							<Text className="latest-icon">📏</Text>
							<View className="latest-info">
								<Text className="latest-value">
									{displayHeightWeight.height}cm / {displayHeightWeight.weight}kg
								</Text>
								<Text className="latest-date">
									{new Date(displayHeightWeight.date).toLocaleDateString()}
								</Text>
							</View>
						</View>
					)}
					{displayTemperature && (
						<View className="latest-card" onClick={goToFullDetail.bind(null, 'temperature')}>
							<Text className="latest-icon">🌡️</Text>
							<View className="latest-info">
								<Text className="latest-value">
									{displayTemperature.temperature}°C
								</Text>
								<Text className="latest-date">
									{new Date(displayTemperature.date).toLocaleDateString()}
								</Text>
							</View>
						</View>
					)}
					{!displayHeightWeight && !displayTemperature && (
						<View className="latest-empty">
							<Text className="latest-empty-text">暂无身高体重和体温记录</Text>
						</View>
					)}
				</View>
			</View>

			{/* 类型切换 */}
			<View className="type-tabs">
				{detailTypeTabs.map(tab => (
					<View
						key={tab.type}
						className={`type-tab ${activeType === tab.type ? 'active' : ''}`}
						onClick={() => setActiveType(tab.type)}
					>
						<Text className="type-tab-icon">{tab.icon}</Text>
						<Text className="type-tab-label">{tab.label}</Text>
					</View>
				))}
			</View>

			{/* 日期切换 */}
			<View className="date-nav">
				<View className="date-arrow" onClick={() => handleDateChange(shiftDate(selectedDate, -1))}>
					<Text>‹</Text>
				</View>
				<Picker
					mode="date"
					value={selectedDate}
					end={formatDate(new Date())}
					onChange={e => handleDateChange(e.detail.value as string)}
				>
					<View className="date-label-wrap">
						<Text className="date-label">{getDateLabel(selectedDate)}</Text>
						<Text className="date-icon">📅</Text>
					</View>
				</Picker>
				<View
					className={`date-arrow ${isToday(selectedDate) ? 'disabled' : ''}`}
					onClick={() => !isToday(selectedDate) && handleDateChange(shiftDate(selectedDate, 1))}
				>
					<Text>›</Text>
				</View>
			</View>

			{/* 明细卡 */}
			<View className="detail-card">
				<View className="detail-card-header">
					<Text className="section-title">{isToday(selectedDate) ? '今日总结' : `${getDateLabel(selectedDate)}总结`}</Text>
					<View className="detail-link" onClick={() => goToFullDetail()}>
						<Text>完整明细 ›</Text>
					</View>
				</View>

				<View className="summary-tiles">
					{summaryTiles.map(tile => (
						<View key={tile.label} className="summary-tile">
							<Text className="summary-tile-value">{tile.value}</Text>
							<Text className="summary-tile-label">{tile.label}</Text>
						</View>
					))}
				</View>

				{displayItems.length > 0 ? (
					<View className="timeline">
						{displayItems.map((item, idx) => (
							<View key={item.id} className="timeline-item">
								<View className="timeline-track">
									<View className="timeline-dot" />
									{idx < displayItems.length - 1 && <View className="timeline-line" />}
								</View>
								<View className="timeline-content">
									<View className="timeline-row">
										<Text className="timeline-time">{formatHM(item.startTime)}</Text>
										<Text className="timeline-interval">{getIntervalText(activeType, item.intervalMinutes)}</Text>
									</View>
								<View className="timeline-text-row">
									<View className="timeline-text-content">
										<Text className="timeline-text">{getRecordMainText(activeType, item)}</Text>
										{item.note && <Text className="timeline-note">备注：{item.note}</Text>}
									</View>
									{activeType === 'diaper' && item.diaperImage && (
											<Image
												className="timeline-thumb"
												src={item.diaperImage}
												mode="aspectFill"
												onClick={() => Taro.previewImage({ current: item.diaperImage, urls: [item.diaperImage] })}
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

			{/* 统计图表 */}
			{displayDailyStats.length > 0 && (
				<View className="charts-section">
					<Text className="section-title">趋势图表</Text>
					<View className="time-range">
						{[7, 14, 30].map(d => (
							<View
								key={d}
								className={`range-item ${days === d ? 'active' : ''}`}
								onClick={() => handleDaysChange(d)}
							>
								<Text>{d}天</Text>
							</View>
						))}
					</View>
					{activeType === 'feeding' && renderBarChart(displayDailyStats, 'feedingCount', '喂奶次数', '次')}
					{activeType === 'feeding' && renderBarChart(displayDailyStats, 'totalMilk', '奶量', 'ml')}
					{activeType === 'diaper' && renderBarChart(displayDailyStats, 'diaperCount', '换尿布次数', '次')}
					{activeType === 'sleep' && renderBarChart(displayDailyStats, 'sleepTotal', '睡眠时长', '时')}
					{activeType === 'height_weight' && displayHeightWeightSeries.some(point => point.height != null || point.weight != null) && (
						<>
							{renderHeightWeightLineChart(displayHeightWeightSeries, 'height', '身高趋势', 'cm', 'growth-height')}
							{renderHeightWeightLineChart(displayHeightWeightSeries, 'weight', '体重趋势', 'kg', 'growth-weight')}
						</>
					)}
					{activeType === 'height_weight' && !displayHeightWeightSeries.some(point => point.height != null || point.weight != null) && (
						<View className="chart-card growth-empty"><Text>所选时间内暂无身高体重记录</Text></View>
					)}
					{activeType === 'temperature' && displayTemperatureTrend.length > 0 && renderTemperatureLineChart(displayTemperatureTrend)}
					{activeType === 'temperature' && displayTemperatureTrend.length === 0 && (
						<View className="chart-card growth-empty"><Text>所选时间内暂无体温记录</Text></View>
					)}
				</View>
			)}

			<TabBar />
		</View>
	)
}
