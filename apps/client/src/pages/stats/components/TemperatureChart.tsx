import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { TemperatureTrendPoint } from '../../../stores/recordStore'
import { formatDate } from '../../../utils/date'

interface TemperatureChartProps {
	points: TemperatureTrendPoint[]
	days: number
	selectedDate: string
	onDateChange: (date: string) => void
}

// 体温趋势图：纯 DOM + ScrollView 手写（非 LineChart 组件），数据点可点切换日期
export default function TemperatureChart({
	points,
	days,
	selectedDate,
	onDateChange,
}: TemperatureChartProps) {
	// 线段角度换算用的画布宽高比
	const [chartRatio, setChartRatio] = useState(0.46)

	useEffect(() => {
		Taro.nextTick(() => {
			Taro.createSelectorQuery()
				.select('.line-chart')
				.boundingClientRect(rect => {
					if (rect?.width && rect.height) {
						setChartRatio(rect.height / rect.width)
					}
				})
				.exec()
		})
	}, [days, points.length])

	const sortedPoints = points
		.slice()
		.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
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
		const readings = sortedPoints.filter(
			point => formatDate(point.date) === formatDate(date),
		)
		if (readings.length === 0) return null
		return {
			date: date.toISOString(),
			temperature: Math.max(...readings.map(point => point.temperature)),
			lowestTemperature: Math.min(
				...readings.map(point => point.temperature),
			),
		}
	}).filter(
		(
			point,
		): point is {
			date: string
			temperature: number
			lowestTemperature: number
		} => point != null,
	)
	const chartPoints = detailedTimeline ? sortedPoints : dailyPoints
	const values = chartPoints.flatMap(point =>
		'lowestTemperature' in point
			? [point.temperature, point.lowestTemperature]
			: [point.temperature],
	)
	const lowerBound = Math.floor((Math.min(...values) - 0.2) * 10) / 10
	const upperBound = Math.ceil((Math.max(...values) + 0.2) * 10) / 10
	const valueRange = upperBound - lowerBound || 1
	const plotPoints = chartPoints.reduce<
		Array<{
			date: string
			temperature: number
			lowestTemperature?: number
			x: number
			y: number
			lowY?: number
			labelOffset: number
		}>
	>((result, point, index) => {
		const rawX = Math.max(
			0,
			Math.min(
				100,
				((new Date(point.date).getTime() - rangeStart.getTime()) /
					timeRange) *
					100,
			),
		)
		const previous = result[index - 1]
		// 同一时刻或相邻时刻的读数保留顺序，并留出最小可视间距避免重叠。
		const x = detailedTimeline
			? previous && rawX - previous.x < 1.4
				? Math.min(100, previous.x + 1.4)
				: rawX
			: days === 1
				? 50
				: (Math.round(
						(new Date(formatDate(point.date)).getTime() -
							rangeStart.getTime()) /
							(24 * 60 * 60 * 1000),
					) /
						(days - 1)) *
					100
		result.push({
			...point,
			x,
			// 底部留给日期轴，避免最低读数和横坐标重叠。
			y: 15 + ((point.temperature - lowerBound) / valueRange) * 85,
			lowY:
				'lowestTemperature' in point
					? 15 + ((point.lowestTemperature - lowerBound) / valueRange) * 85
					: undefined,
			labelOffset: 24 + (index % 3) * 28,
		})
		return result
	}, [])
	const timeTicks = Array.from({ length: days }, (_, index) => {
		const date = new Date(rangeStart)
		date.setDate(rangeStart.getDate() + index)
		return {
			label:
				days <= 7 ||
				index === 0 ||
				index === days - 1 ||
				index % Math.ceil(days / 6) === 0
					? formatDate(date).slice(5)
					: '',
			x: days === 1 ? 50 : (index / (days - 1)) * 100,
		}
	})
	const showAllValues = !detailedTimeline || plotPoints.length <= 8
	const chartWidth = detailedTimeline
		? Math.max(days * 220, 750)
		: Math.max(days * 100, 750)
	const latestPointId = `temperature-point-${plotPoints.length - 1}`

	return (
		<View className="chart-card growth-chart-card temperature-chart-card">
			<View className="growth-chart-header">
				<Text className="chart-title">
					{detailedTimeline ? '体温趋势' : `近${days}天每日体温范围`}
				</Text>
				<Text className="growth-chart-range">
					{lowerBound.toFixed(1)} - {upperBound.toFixed(1)}°C
				</Text>
			</View>
			<ScrollView
				className="temperature-scroll"
				scrollX
				scrollIntoView={latestPointId}
				showScrollbar={false}
			>
				<View
					className="growth-chart line-chart temperature-chart temperature-chart-wide"
					style={{ width: `${chartWidth}rpx` }}
				>
					{[0, 50, 100].map(position => (
						<View
							key={position}
							className="growth-grid-line"
							style={{ bottom: `${position}%` }}
						/>
					))}
					{Array.from({ length: days - 1 }, (_, index) => (
						<View
							key={index}
							className="temperature-day-divider"
							style={{ left: `${((index + 1) / days) * 100}%` }}
						/>
					))}
					<Text className="temperature-axis-label temperature-axis-top">
						{upperBound.toFixed(1)}°
					</Text>
					<Text className="temperature-axis-label temperature-axis-middle">
						{(lowerBound + valueRange / 2).toFixed(1)}°
					</Text>
					<Text className="temperature-axis-label temperature-axis-bottom">
						{lowerBound.toFixed(1)}°
					</Text>
					{timeTicks.map(tick => (
						<Text
							key={tick.x}
							className="growth-date"
							style={{ left: `${tick.x}%` }}
						>
							{tick.label}
						</Text>
					))}
					{plotPoints.map((point, index) => {
						const previous = plotPoints[index - 1]
						const dx = previous ? point.x - previous.x : 0
						const dy = previous ? point.y - previous.y : 0
						const angle = previous
							? -Math.atan2(dy * chartRatio, dx) * (180 / Math.PI)
							: 0
						const length = previous
							? Math.sqrt(
									dx * dx + dy * chartRatio * (dy * chartRatio),
								)
							: 0
						const showValue =
							showAllValues ||
							index === 0 ||
							index === plotPoints.length - 1 ||
							point.temperature >= 37.5
						const highValueStyle =
							point.y > 80
								? { top: '24rpx', bottom: 'auto' }
								: { bottom: `${point.labelOffset}rpx` }
						return (
							<View key={`${point.date}-${point.temperature}`}>
								{previous && (
									<View
										className="growth-line temperature-line"
										style={{
											left: `${previous.x}%`,
											bottom: `${previous.y}%`,
											width: `${length}%`,
											transform: `rotate(${angle}deg)`,
										}}
									/>
								)}
								{point.lowY != null && point.lowY !== point.y && (
									<>
										<View
											className="temperature-range-bar"
											style={{
												left: `${point.x}%`,
												bottom: `${point.lowY}%`,
												height: `${point.y - point.lowY}%`,
											}}
										/>
										<View
											className="temperature-low-point"
											style={{
												left: `${point.x}%`,
												bottom: `${point.lowY}%`,
											}}
										>
											<Text className="temperature-low-value">
												{point.lowestTemperature?.toFixed(1)}°
											</Text>
										</View>
									</>
								)}
								<View
									id={
										index === plotPoints.length - 1
											? latestPointId
											: undefined
									}
									className={`growth-point temperature-point${
										formatDate(point.date) === formatDate(selectedDate)
											? ' active'
											: ''
									}`}
									style={{ left: `${point.x}%`, bottom: `${point.y}%` }}
									onClick={() => onDateChange(formatDate(point.date))}
								>
									{showValue && (
										<Text className="growth-value" style={highValueStyle}>
											{point.temperature.toFixed(1)}°
										</Text>
									)}
								</View>
							</View>
						)
					})}
				</View>
			</ScrollView>
		</View>
	)
}
