import { View, Text, ScrollView } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore, DailyStat } from '../../stores/recordStore'
import TabBar from '../../components/TabBar'
import './index.scss'

export default function StatsPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const { dailyStats, latestHeightWeight, latestTemperature, fetchStats } =
		useRecordStore()
	const [days, setDays] = useState(7)

	useDidShow(() => {
		if (isLoggedIn && currentBaby) {
			fetchStats(currentBaby.id, days)
		}
	})

	const handleDaysChange = (newDays: number) => {
		setDays(newDays)
		if (currentBaby) {
			fetchStats(currentBaby.id, newDays)
		}
	}

	const formatSleepTime = (minutes: number) => {
		if (minutes < 60) return `${minutes}分`
		const hours = Math.floor(minutes / 60)
		const mins = minutes % 60
		return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
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
						{stats.map((stat, index) => {
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
														? formatSleepTime(value)
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

	if (!isLoggedIn || !currentBaby) {
		return (
			<View className="page">
				<View className="empty-state">
					<Text className="empty-icon">📊</Text>
					<Text className="empty-text">暂无数据</Text>
					<Text className="empty-desc">请先登录并添加宝贝</Text>
				</View>
				<TabBar />
			</View>
		)
	}

	return (
		<View className="page">
			{/* 时间范围选择 */}
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

			{/* 最新数据 */}
			<View className="latest-section">
				<Text className="section-title">最新数据</Text>
				<View className="latest-grid">
					{latestHeightWeight && (
						<View className="latest-card">
							<Text className="latest-icon">📏</Text>
							<View className="latest-info">
								<Text className="latest-value">
									{latestHeightWeight.height}cm / {latestHeightWeight.weight}kg
								</Text>
								<Text className="latest-date">
									{new Date(latestHeightWeight.date).toLocaleDateString()}
								</Text>
							</View>
						</View>
					)}
					{latestTemperature && (
						<View className="latest-card">
							<Text className="latest-icon">🌡️</Text>
							<View className="latest-info">
								<Text className="latest-value">
									{latestTemperature.temperature}°C
								</Text>
								<Text className="latest-date">
									{new Date(latestTemperature.date).toLocaleDateString()}
								</Text>
							</View>
						</View>
					)}
					{!latestHeightWeight && !latestTemperature && (
						<View className="latest-empty">
							<Text className="latest-empty-text">暂无身高体重和体温记录</Text>
						</View>
					)}
				</View>
			</View>

			{/* 统计图表 */}
			{dailyStats.length > 0 && (
				<View className="charts-section">
					<Text className="section-title">趋势图表</Text>
					{renderBarChart(dailyStats, 'feedingCount', '喂奶次数', '次')}
					{renderBarChart(dailyStats, 'totalMilk', '奶量', 'ml')}
					{renderBarChart(dailyStats, 'diaperCount', '换尿布次数', '次')}
					{renderBarChart(dailyStats, 'sleepTotal', '睡眠时长', '时')}
				</View>
			)}

			<TabBar />
		</View>
	)
}
