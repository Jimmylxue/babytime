import { View, Text, ScrollView, Picker, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore, DailyStat } from '../../stores/recordStore'
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

export default function StatsPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const {
		dailyStats,
		latestHeightWeight,
		latestTemperature,
		fetchStats,
		detailItems,
		detailSummary,
		fetchDetail,
	} = useRecordStore()
	const [days, setDays] = useState(7)
	const [activeType, setActiveType] = useState('feeding')
	const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))

	// 每次进入统计页都重新拉一次最新的宝宝信息和数据，避免拿到切换宝宝前的旧数据
	useDidShow(() => {
		if (!isLoggedIn) return
		useBabyStore.getState().fetchBabies().then(() => {
			const baby = useBabyStore.getState().currentBaby
			if (baby) {
				fetchStats(baby.id, days)
				fetchDetail(baby.id, activeType, { date: selectedDate })
			}
		})
	})

	useEffect(() => {
		if (isLoggedIn && currentBaby) {
			fetchDetail(currentBaby.id, activeType, { date: selectedDate })
		}
	}, [isLoggedIn, currentBaby?.id, activeType, selectedDate])

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

	const goToFullDetail = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
			return
		}
		Taro.navigateTo({ url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=${activeType}` })
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

	// 未登录时使用 mock 数据
	const displayDailyStats = isLoggedIn && currentBaby ? dailyStats : MOCK_STATS.dailyStats
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
						<View className="latest-card">
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
						<View className="latest-card">
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
					<View className="detail-link" onClick={goToFullDetail}>
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
										<Text className="timeline-text">{getRecordMainText(activeType, item)}</Text>
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
				</View>
			)}

			<TabBar />
		</View>
	)
}
