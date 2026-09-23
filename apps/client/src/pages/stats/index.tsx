import { View, Text, Canvas } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import {
	useRecordStore,
	HeightWeightTrendPoint,
	DetailRecord,
	DetailSummary,
} from '../../stores/recordStore'
import { formatDate } from '../../utils/date'
import { formatMeasurement } from '../../utils/format'
import { needLogin } from '../../utils/needLogin'
import { MOCK_STATS, MOCK_DETAIL } from '../../utils/mock'
import { detailTypeTabs } from '../../utils/recordDisplay'
import { recordApi } from '../../utils/request'
import TabBar from '../../components/TabBar'
import { ChartPosterOptions, deliverChartPoster } from '../../utils/chartExport'
import { fetchPosterQrCode } from '../../utils/posterQr'
import { buildGrowthSeries, shiftDate } from './utils'
import GrowthHeroCard from './components/GrowthHeroCard'
import DateNav from './components/DateNav'
import DayDetailCard from './components/DayDetailCard'
import WhoSection from './components/WhoSection'
import DailyBarChart from './components/DailyBarChart'
import GrowthTrendChart from './components/GrowthTrendChart'
import TemperatureChart from './components/TemperatureChart'
import './index.scss'

export default function StatsPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const {
		dailyStats,
		heightWeightTrend,
		temperatureTrend,
		fetchStats,
		fetchDetail,
		fetchDetailSummary,
	} = useRecordStore()
	const [days, setDays] = useState(7)
	const [activeType, setActiveType] = useState('feeding')
	// 身高/体重为独立入口，metric 记录当前选中项；非身高体重类型时为 null
	const [activeMetric, setActiveMetric] = useState<'height' | 'weight' | null>(
		null,
	)
	// 身高体重分支内使用的当前指标（兜底身高）
	const growthMetric = activeMetric === 'weight' ? 'weight' : 'height'
	const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
	// 当天的明细/汇总保存在本页状态：完整明细页共用 store 的 detailItems（按天数查询），
	// 若直接读 store，从明细页返回时会把"今日总结"的次数和列表覆盖成明细页的数据
	const [dayItems, setDayItems] = useState<DetailRecord[]>([])
	const [daySummary, setDaySummary] = useState<DetailSummary | null>(null)
	// 前一日汇总，用于总结卡片的「较昨日」对比
	const [prevDaySummary, setPrevDaySummary] = useState<DetailSummary | null>(
		null,
	)
	// 成长曲线用全量身高体重历史（/record/growth 无天数窗口，直接查这一种记录）
	const [whoSeries, setWhoSeries] = useState<HeightWeightTrendPoint[]>([])
	// 同参数的在途明细请求，用来合成 useDidShow 与 useEffect 撞车的重复调用
	const dayDetailInflight = useRef<{ key: string; promise: Promise<unknown> } | null>(
		null,
	)
	// 身高/体重趋势图点按选中的点（该页签没有明细卡，只用来把数值显示出来）
	const [growthPointIndex, setGrowthPointIndex] = useState<number | null>(null)

	// 拉取选中日期的明细/汇总，完成后拷贝到本页状态，之后 store 再被谁覆盖都不影响本页展示
	const loadDayDetail = (babyId: string, type: string, date: string) => {
		// 身高/体重页签只看趋势图（单日明细/汇总视图已移除），不发明细请求
		if (type === 'height_weight') return Promise.resolve()
		// 进本页时 useDidShow 与下面监听 currentBaby 的 useEffect 会各来一次同参数请求，
		// 这里把同 key 的在途请求合成一个；换日期/换页签/下次再进本页照常重新取
		const key = `${babyId}|${type}|${date}`
		if (dayDetailInflight.current?.key === key) return dayDetailInflight.current.promise

		// 三个请求互不依赖，直接并行。值取 fetch* 的返回值而不是 store 的 detailSummary ——
		// 那个槽位是单值的，正是原来「前一日必须先取完、再取当日覆盖」被迫串行的原因
		const promise = Promise.all([
			fetchDetail(babyId, type, { date }),
			fetchDetailSummary(babyId, type, { date }),
			fetchDetailSummary(babyId, type, { date: shiftDate(date, -1) }),
		])
			.then(([items, todaySummary, prevSummary]) => {
				setDayItems(items)
				setDaySummary(todaySummary)
				setPrevDaySummary(prevSummary)
			})
			.finally(() => {
				if (dayDetailInflight.current?.key === key) dayDetailInflight.current = null
			})
		dayDetailInflight.current = { key, promise }
		return promise
	}

	// 每次进入统计页都重新拉一次最新的宝宝信息和数据，避免拿到切换宝宝前的旧数据
	useDidShow(() => {
		if (!isLoggedIn) return
		useBabyStore
			.getState()
			.fetchBabies()
			.then(() => {
				const baby = useBabyStore.getState().currentBaby
				if (baby) {
					fetchStats(baby.id, days)
					loadDayDetail(baby.id, activeType, selectedDate)
				}
			})
	})

	useEffect(() => {
		if (isLoggedIn && currentBaby && activeType !== 'vaccine') {
			loadDayDetail(currentBaby.id, activeType, selectedDate)
		}
	}, [isLoggedIn, currentBaby?.id, activeType, activeMetric, selectedDate])

	// 身高/体重页签：成长曲线直接展示，进入页签即拉全量身高体重历史
	useEffect(() => {
		if (!isLoggedIn || !currentBaby || activeType !== 'height_weight') {
			return
		}
		recordApi
			.getGrowth(currentBaby.id)
			.then(res => {
				setWhoSeries(res.data || [])
			})
			.catch(() => setWhoSeries([]))
	}, [isLoggedIn, currentBaby?.id, activeType])

	// 切换宝宝、指标或时间范围后，重置趋势图的选中点
	useEffect(() => {
		setGrowthPointIndex(null)
	}, [currentBaby?.id, growthMetric, days])

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
		// 身高/体重独立入口，把当前指标带给完整明细页
		const metricParam =
			activeType === 'height_weight' && activeMetric
				? `&metric=${activeMetric}`
				: ''
		Taro.navigateTo({
			url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=${activeType}${metricParam}`,
		})
	}

	// 英雄卡「记录身高/体重」：跳转记录页并带上当前指标
	const handleGrowthRecord = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
			return
		}
		Taro.navigateTo({
			url: `/pages/record/index?type=height_weight&babyId=${currentBaby.id}&metric=${growthMetric}`,
			fail: err => {
				console.error('跳转记录页失败', err)
				Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
			},
		})
	}

	// 海报头部统计周期文案
	const dateRangeText = (() => {
		const end = new Date()
		const start = new Date()
		start.setDate(end.getDate() - days + 1)
		const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
		return `${f(start)} - ${f(end)}`
	})()
	const genderText = currentBaby
		? currentBaby.gender === 'male'
			? '男宝'
			: '女宝'
		: undefined

	// 生成带宝宝信息的分享海报，并保存/分享
	const handleChartExport = async (
		opts: ChartPosterOptions,
		action: 'save' | 'share',
	) => {
		try {
			// 带场景值的码（来源=图表海报），失败自动回退静态码
			const miniProgramCode = await fetchPosterQrCode('chart')
			await deliverChartPoster(
				{ ...opts, miniProgramCodeUrl: miniProgramCode },
				action,
			)
		} catch (error) {
			Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
		}
	}

	// 未登录时使用 mock 数据
	const displayDailyStats =
		isLoggedIn && currentBaby ? dailyStats : MOCK_STATS.dailyStats
	const displayHeightWeightTrend =
		isLoggedIn && currentBaby ? heightWeightTrend : MOCK_STATS.heightWeightTrend
	const displayTemperatureTrend =
		isLoggedIn && currentBaby ? temperatureTrend : MOCK_STATS.temperatureTrend
	const displayHeightWeightSeries = buildGrowthSeries(
		displayHeightWeightTrend,
		days,
	)
	const displayItems =
		isLoggedIn && currentBaby ? dayItems : MOCK_DETAIL[activeType].items
	const summary =
		isLoggedIn && currentBaby ? daySummary : MOCK_DETAIL[activeType].summary

	// 英雄卡：最新一次身高/体重测量（登录取成长曲线的全量历史，未登录示例退回窗口数据）
	const growthHistory =
		isLoggedIn && whoSeries.length > 0 ? whoSeries : displayHeightWeightTrend
	const measuredGrowthPoints = growthHistory.filter(
		point => point[growthMetric] != null,
	)
	const latestGrowth =
		measuredGrowthPoints.length > 0
			? measuredGrowthPoints[measuredGrowthPoints.length - 1]
			: null
	const latestGrowthValue = latestGrowth
		? formatMeasurement(latestGrowth[growthMetric] as number)
		: null
	const latestGrowthDate = latestGrowth
		? formatDate(latestGrowth.date).replace(/-/g, '.')
		: null
	const daysSinceLastGrowth = latestGrowth
		? Math.max(
				0,
				Math.floor(
					(Date.now() - new Date(latestGrowth.date).getTime()) / 86400000,
				),
			)
		: null

	// 各图表卡片共用的海报上下文
	const posterContext = {
		babyName: currentBaby?.name,
		avatarUrl: currentBaby?.avatar,
		genderText,
		dateRangeText,
		exportPoster: handleChartExport,
	}

	return (
		<View className="page">
			{/* 未登录或未创建宝宝时，正在展示示例数据 */}
			{(!isLoggedIn || !currentBaby) && (
				<View className="demo-banner">
					<Text className="demo-banner-emoji">👀</Text>
					<Text className="demo-banner-text">
						{isLoggedIn
							? '示例数据预览，创建宝宝档案后展示真实统计'
							: '示例数据预览，登录后记录宝宝的成长'}
					</Text>
					<View
						className="demo-banner-btn"
						onClick={() =>
							Taro.navigateTo({
								url: isLoggedIn
									? '/pages/baby-edit/index'
									: '/pages/login/index',
							})
						}
					>
						<Text className="demo-banner-btn-text">
							{isLoggedIn ? '去创建' : '去登录'}
						</Text>
					</View>
				</View>
			)}

			{/* 类型切换：身高/体重为独立入口，单行展示 */}
			<View className="type-tabs">
				{detailTypeTabs.map(tab => (
					<View
						key={`${tab.type}-${tab.metric ?? ''}`}
						className={`type-tab ${activeType === tab.type && activeMetric === (tab.metric ?? null) ? 'active' : ''}`}
						onClick={() => {
							// 疫苗页签是时间轴的快捷入口：点击直接跳转，避免维护两套相同视图
							if (tab.type === 'vaccine') {
								if (!isLoggedIn || !currentBaby) {
									needLogin()
									return
								}
								Taro.navigateTo({
									url: `/pages/vaccine-timeline/index?babyId=${currentBaby.id}`,
								})
								return
							}
							setActiveType(tab.type)
							setActiveMetric(tab.metric ?? null)
						}}
					>
						<Text className="type-tab-icon">{tab.icon}</Text>
						<Text className="type-tab-label">{tab.label}</Text>
						<View className="type-tab-indicator" />
					</View>
				))}
			</View>

			{/* 最新身高/体重英雄卡：身高=动态刻度尺，体重=动态仪表盘 */}
			{activeType === 'height_weight' && (
				<GrowthHeroCard
					metric={growthMetric}
					gender={currentBaby?.gender}
					latestValue={latestGrowthValue}
					latestDate={latestGrowthDate}
					daysSince={daysSinceLastGrowth}
					onRecord={handleGrowthRecord}
				/>
			)}

			{/* 日期切换：身高/体重看趋势图即可，无单日视图 */}
			{activeType !== 'height_weight' && (
				<DateNav selectedDate={selectedDate} onChange={handleDateChange} />
			)}

			{/* 明细卡：仅每日多次记录类型展示；身高/体重只看趋势图，入口在图表下方按钮 */}
			{activeType !== 'height_weight' && (
				<DayDetailCard
					activeType={activeType}
					growthMetric={growthMetric}
					selectedDate={selectedDate}
					items={displayItems}
					summary={summary}
					prevDaySummary={prevDaySummary}
					onOpenDetail={goToFullDetail}
				/>
			)}

			{/* WHO 成长曲线：独立模块，恒定 0-36 月龄全量数据，不受时间范围筛选影响 */}
			{activeType === 'height_weight' && currentBaby && (
				<WhoSection
					babyId={currentBaby.id}
					metric={growthMetric}
					gender={currentBaby.gender}
					birthday={currentBaby.birthday}
					babyName={currentBaby.name}
					avatarUrl={currentBaby.avatar}
					genderText={genderText}
					trendPoints={whoSeries}
					days={days}
					exportPoster={handleChartExport}
				/>
			)}

			{/* 统计图表 */}
			{displayDailyStats.length > 0 && (
				<View className="charts-section">
					<View className="section-heading chart-section-heading">
						<View className="section-heading-icon trend-heading-icon">
							<View className="trend-icon-line trend-icon-line-left" />
							<View className="trend-icon-line trend-icon-line-middle" />
							<View className="trend-icon-line trend-icon-line-right" />
						</View>
						<Text className="section-heading-title">
							{activeType === 'height_weight' ? '成长趋势' : '趋势图表'}
						</Text>
					</View>
					{/* 时间范围：仅作用于下方趋势图（WHO 成长曲线已独立为上方模块） */}
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
					{activeType === 'feeding' && (
						<DailyBarChart
							stats={displayDailyStats}
							statKey="feedingCount"
							label="喂奶次数"
							unit="次"
							days={days}
							selectedDate={selectedDate}
							onDateChange={handleDateChange}
							{...posterContext}
						/>
					)}
					{activeType === 'feeding' && (
						<DailyBarChart
							stats={displayDailyStats}
							statKey="totalMilk"
							label="奶量"
							unit="ml"
							days={days}
							selectedDate={selectedDate}
							onDateChange={handleDateChange}
							{...posterContext}
						/>
					)}
					{activeType === 'diaper' && (
						<DailyBarChart
							stats={displayDailyStats}
							statKey="diaperCount"
							label="尿布次数"
							unit="次"
							days={days}
							selectedDate={selectedDate}
							onDateChange={handleDateChange}
							{...posterContext}
						/>
					)}
					{activeType === 'sleep' && (
						<DailyBarChart
							stats={displayDailyStats}
							statKey="sleepTotal"
							label="睡眠时长"
							unit="时"
							days={days}
							selectedDate={selectedDate}
							onDateChange={handleDateChange}
							{...posterContext}
						/>
					)}
					{/* 身高/体重：趋势折线图（WHO 成长曲线已移至上方独立模块） */}
					{activeType === 'height_weight' &&
						displayHeightWeightSeries.some(
							point => point[growthMetric] != null,
						) && (
							<GrowthTrendChart
								points={displayHeightWeightSeries}
								metric={growthMetric}
								label={growthMetric === 'height' ? '身高趋势' : '体重趋势'}
								unit={growthMetric === 'height' ? 'cm' : 'kg'}
								days={days}
								highlightIndex={growthPointIndex}
								onSelectIndex={setGrowthPointIndex}
								{...posterContext}
							/>
						)}
					{activeType === 'height_weight' &&
						!displayHeightWeightSeries.some(
							point => point[growthMetric] != null,
						) && (
							<View className="chart-card growth-empty">
								<Text>
									{growthMetric === 'height'
										? '所选时间内暂无身高记录'
										: '所选时间内暂无体重记录'}
								</Text>
							</View>
						)}
					{activeType === 'temperature' &&
						displayTemperatureTrend.length > 0 && (
							<TemperatureChart
								points={displayTemperatureTrend}
								days={days}
								selectedDate={selectedDate}
								onDateChange={handleDateChange}
							/>
						)}
					{activeType === 'temperature' &&
						displayTemperatureTrend.length === 0 && (
							<View className="chart-card growth-empty">
								<Text>所选时间内暂无体温记录</Text>
							</View>
						)}
				</View>
			)}

			{/* 身高/体重：趋势图为主视图，完整明细入口收进图表下方按钮 */}
			{activeType === 'height_weight' && (
				<View className="growth-detail-btn" onClick={goToFullDetail}>
					<Text className="growth-detail-btn-text">查看完整明细</Text>
					<Text className="growth-detail-btn-arrow">›</Text>
				</View>
			)}

			{/* 图表分享海报的离屏画布（尺寸用内联样式，避免 px 被 Taro 转成 rpx） */}
			<View
				className="poster-canvas-wrap"
				style={{ width: '340px', height: '560px' }}
			>
				<Canvas
					type="2d"
					id="chart-poster-canvas"
					className="poster-canvas"
					style={{ width: '340px', height: '560px' }}
				/>
			</View>

			<TabBar />
		</View>
	)
}
