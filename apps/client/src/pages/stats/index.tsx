import {
	View,
	Text,
	ScrollView,
	Picker,
	Image,
	Canvas,
} from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import {
	useRecordStore,
	DailyStat,
	DetailRecord,
	DetailSummary,
	HeightWeightTrendPoint,
	TemperatureTrendPoint,
} from '../../stores/recordStore'
import {
	formatDate,
	formatDuration,
	formatDurationLong,
	formatHM,
} from '../../utils/date'
import { needLogin } from '../../utils/needLogin'
import { MOCK_STATS, MOCK_DETAIL } from '../../utils/mock'
import {
	detailTypeTabs,
	getRecordMainText,
	getIntervalText,
} from '../../utils/recordDisplay'
import { recordApi } from '../../utils/request'
import TabBar from '../../components/TabBar'
import LineChart, { LineChartPoint } from '../../components/LineChart'
import BarChart from '../../components/BarChart'
import GrowthCurveChart from '../../components/GrowthCurveChart'
import { deliverChartPoster, ChartPosterOptions } from '../../utils/chartExport'
import downloadIcon from '../../assets/icons/download.svg'
import shareIcon from '../../assets/icons/share.svg'
import pencilWhiteIcon from '../../assets/icons/pencil-white.svg'
import growthBoyIllu from '../../assets/growth-baby-boy.jpg'
import growthGirlIllu from '../../assets/growth-baby-girl.jpg'
import scaleBabyBoyIllu from '../../assets/scale-baby-boy.jpg'
import scaleBabyGirlIllu from '../../assets/scale-baby-girl.jpg'
import miniProgramCode from '../../assets/mini-program-code.jpg'
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
	// 成长曲线用全量身高体重历史（stats 接口无 days 上限）
	const [whoSeries, setWhoSeries] = useState<HeightWeightTrendPoint[]>([])
	const [growthChartRatio, setGrowthChartRatio] = useState(0.46)

	// 拉取选中日期的明细/汇总，完成后拷贝到本页状态，之后 store 再被谁覆盖都不影响本页展示
	const loadDayDetail = async (babyId: string, type: string, date: string) => {
		// 身高/体重页签只看趋势图（单日明细/汇总视图已移除），不发明细请求
		if (type === 'height_weight') return
		// store 的 detailSummary 是单值，前一日和当日只能串行取：先取前一日（较昨日对比用），再取当日覆盖
		await fetchDetail(babyId, type, { date })
		setDayItems(useRecordStore.getState().detailItems)
		try {
			await fetchDetailSummary(babyId, type, { date: shiftDate(date, -1) })
			setPrevDaySummary(useRecordStore.getState().detailSummary)
		} catch {
			setPrevDaySummary(null)
		}
		await fetchDetailSummary(babyId, type, { date })
		setDaySummary(useRecordStore.getState().detailSummary)
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
			.getStats(currentBaby.id, 1100)
			.then(res => {
				setWhoSeries(res.data?.heightWeightTrend || [])
			})
			.catch(() => setWhoSeries([]))
	}, [isLoggedIn, currentBaby?.id, activeType])

	useEffect(() => {
		// 宽高比只被温度趋势图使用（身高/体重已改为 Canvas 绘制）
		if (activeType !== 'temperature') return
		Taro.nextTick(() => {
			Taro.createSelectorQuery()
				.select('.line-chart')
				.boundingClientRect(rect => {
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
		// 身高/体重独立入口，把当前指标带给完整明细页
		const metricParam =
			t === 'height_weight' && activeMetric ? `&metric=${activeMetric}` : ''
		Taro.navigateTo({
			url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=${t}${metricParam}`,
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
			await deliverChartPoster(
				{ ...opts, miniProgramCodeUrl: miniProgramCode },
				action,
			)
		} catch (error) {
			Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
		}
	}

	// 成长曲线的实测点：全量历史中的真实测量值换算为月龄
	const babyCurvePoints = currentBaby
		? whoSeries
				.filter(point => point[growthMetric] != null)
				.map(point => ({
					ageMonths:
						(new Date(point.date).getTime() -
							new Date(currentBaby.birthday).getTime()) /
						(30.4375 * 24 * 3600 * 1000),
					value: point[growthMetric] as number,
				}))
		: []

	const renderChartActions = (posterOpts: ChartPosterOptions) => (
		<View className="chart-actions">
			<View
				className="chart-action-btn"
				onClick={() => handleChartExport(posterOpts, 'share')}
			>
				<Image className="chart-action-icon" src={shareIcon} />
			</View>
			<View
				className="chart-action-btn"
				onClick={() => handleChartExport(posterOpts, 'save')}
			>
				<Image className="chart-action-icon" src={downloadIcon} />
			</View>
		</View>
	)

	const renderBarChart = (
		stats: DailyStat[],
		key: keyof DailyStat,
		label: string,
		unit: string = '',
	) => {
		const dayLabels = ['日', '一', '二', '三', '四', '五', '六']
		// 单位放到标题里，柱顶只留数字，避免相邻标签拥挤
		const points = stats.map(stat => {
			const value = (stat[key] as number) || 0
			let display = ''
			if (value > 0) {
				if (unit === '时') {
					// 睡眠分钟数转为小时，去掉多余的 .0
					display = (value / 60).toFixed(1).replace(/\.0$/, '')
				} else {
					display = `${value}`
				}
			}
			return {
				value,
				display,
				label: dayLabels[new Date(stat.date).getDay()],
			}
		})
		// 「次数」类标题本身已含单位，不再重复；奶量/时长把单位标在标题上
		const titleSuffix =
			unit && unit !== '次' ? ` (${unit === '时' ? '小时' : unit})` : ''

		const total = displayDailyStats.reduce(
			(sum, stat) => sum + ((stat[key] as number) || 0),
			0,
		)
		const avgPerDay = (total / days).toFixed(1)
		// 日期范围直接取自数据首尾，保证与图表内容永远一致
		// 兼容 YYYY-MM-DD 与 ISO 带时间两种格式
		const fmtShort = (d: string) => {
			if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
				const [, m, dd] = d.split('-')
				return `${+m}/${+dd}`
			}
			const date = new Date(d)
			return `${date.getMonth() + 1}/${date.getDate()}`
		}
		const dataRangeText = stats.length
			? `${fmtShort(stats[0].date)} – ${fmtShort(stats[stats.length - 1].date)}`
			: dateRangeText
		const rangeWord = days === 7 ? '本周' : `近${days}天`

		let metaTexts: string[]
		let reviewText: string
		if (key === 'totalMilk') {
			metaTexts = [
				`近${days}天共 ${total}ml`,
				`日均 ${Math.round(total / days)}ml`,
			]
			reviewText = `${rangeWord}奶量稳定，日均 ${Math.round(total / days)}ml，宝宝吃得棒棒哒！`
		} else if (key === 'sleepTotal') {
			metaTexts = [`近${days}天共 ${formatDurationLong(total)}`]
			reviewText = `${rangeWord}累计睡眠 ${formatDurationLong(total)}，睡得好的宝宝才能长得好～`
		} else if (key === 'diaperCount') {
			metaTexts = [`近${days}天共 ${total} 次`]
			reviewText = `${rangeWord}共更换尿布 ${total} 次，小屁屁保持干爽，照顾得很细心～`
		} else {
			metaTexts = [`近${days}天共 ${total} 次`, `日均 ${avgPerDay} 次`]
			reviewText = `${rangeWord}喂奶规律，日均 ${avgPerDay} 次，宝宝吃得棒棒哒！`
		}

		// 7 天：日粒度柱状图；14/30 天柱子会互相重叠，改用趋势折线表达
		const posterOpts: ChartPosterOptions =
			days <= 7
				? {
						kind: 'bar',
						title: `${label}${titleSuffix}`,
						babyName: currentBaby?.name,
						avatarUrl: currentBaby?.avatar,
						genderText,
						rangeText: dataRangeText,
						metaTexts,
						reviewTitle: '本周小结',
						reviewText,
						data: {
							points,
							color: '#FF8FA9',
							showYAxis: true,
							unit: unit === '时' ? '小时' : unit || undefined,
							barWidth: 18,
						},
					}
				: {
						kind: 'line',
						title: `${label}${titleSuffix}`,
						babyName: currentBaby?.name,
						avatarUrl: currentBaby?.avatar,
						genderText,
						rangeText: dataRangeText,
						metaTexts,
						reviewTitle: `近${days}天小结`,
						reviewText,
						data: {
							points: stats.map(stat => {
								const value = (stat[key] as number) || 0
								const [, m, dd] = stat.date.split('-')
								return {
									value,
									label: `${+m}/${+dd}`,
									measured: value > 0,
								}
							}),
							unit: unit === '时' ? '小时' : unit,
							minSpan: key === 'totalMilk' ? 50 : 1,
							color: '#FF8FA9',
						},
					}

		return (
			<View className="chart-card">
				<View className="growth-chart-header">
					<Text className="chart-title">
						{label}
						{titleSuffix}
					</Text>
					{renderChartActions(posterOpts)}
				</View>
				<ScrollView scrollX className="chart-scroll-view" showScrollbar={false}>
					<BarChart canvasId={`bar-${key}-chart`} points={points} />
				</ScrollView>
			</View>
		)
	}

	const buildGrowthSeries = (
		points: HeightWeightTrendPoint[],
		rangeDays: number,
	): GrowthSeriesPoint[] => {
		const sortedPoints = points
			.slice()
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
		const start = new Date()
		start.setHours(0, 0, 0, 0)
		start.setDate(start.getDate() - rangeDays + 1)
		const heightValues: Array<number | null> = Array(rangeDays).fill(null)
		const weightValues: Array<number | null> = Array(rangeDays).fill(null)
		const heightMeasured = Array(rangeDays).fill(false)
		const weightMeasured = Array(rangeDays).fill(false)
		let baselineHeight: number | null = null
		let baselineWeight: number | null = null

		sortedPoints.forEach(point => {
			const pointDate = new Date(formatDate(point.date))
			const index = Math.round(
				(pointDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
			)
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

		const fillTrendValues = (
			values: Array<number | null>,
			baseline: number | null,
		) => {
			const result = values.slice()
			const knownIndexes = values
				.map((value, index) => (value == null ? null : index))
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
					result[day] =
						fromValue + ((toValue - fromValue) * (day - from)) / (to - from)
				}
			}
			for (
				let index = knownIndexes[knownIndexes.length - 1] + 1;
				index < rangeDays;
				index++
			) {
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

	const fmtShort2 = (d: string) => {
		if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
			const [, m, dd] = d.split('-')
			return `${+m}/${+dd}`
		}
		const date = new Date(d)
		return `${date.getMonth() + 1}/${date.getDate()}`
	}

	const renderHeightWeightLineChart = (
		points: HeightWeightTrendPoint[],
		key: 'height' | 'weight',
		label: string,
		unit: string,
	) => {
		const values = points
			.map(point => point[key])
			.filter((value): value is number => value != null)
		if (values.length === 0) return null

		const minValue = Math.min(...values)
		const maxValue = Math.max(...values)
		const padding = Math.max(
			(maxValue - minValue) * 0.2,
			key === 'height' ? 1 : 0.2,
		)
		const lowerBound = minValue - padding
		const upperBound = maxValue + padding

		const lastValue = points[points.length - 1][key] as number
		const metricLabel = key === 'height' ? '身高' : '体重'
		const firstMeasured = points.find(point =>
			key === 'height'
				? (point as GrowthSeriesPoint).heightMeasured
				: (point as GrowthSeriesPoint).weightMeasured,
		)?.[key] as number | undefined
		const reviewText =
			firstMeasured != null
				? `近${days}天${metricLabel}从 ${firstMeasured.toFixed(1)}${unit} 到 ${lastValue.toFixed(1)}${unit}，宝宝在稳稳长大～`
				: `近${days}天${metricLabel}最新 ${lastValue.toFixed(1)}${unit}，宝宝在稳稳长大～`
		const whoRangeText = displayHeightWeightSeries.length
			? `${fmtShort2(displayHeightWeightSeries[0].date)} – ${fmtShort2(displayHeightWeightSeries[displayHeightWeightSeries.length - 1].date)}`
			: dateRangeText
		const posterOpts: ChartPosterOptions = {
			kind: 'line',
			title: label,
			babyName: currentBaby?.name,
			avatarUrl: currentBaby?.avatar,
			genderText,
			rangeText: whoRangeText,
			metaTexts: [`近${days}天`, `最新 ${lastValue.toFixed(1)}${unit}`],
			reviewTitle: `近${days}天小结`,
			reviewText,
			data: {
				points: points.map(point => {
					const d = new Date(point.date)
					return {
						value: point[key] as number,
						label: `${d.getMonth() + 1}/${d.getDate()}`,
						measured:
							key === 'height'
								? (point as GrowthSeriesPoint).heightMeasured
								: (point as GrowthSeriesPoint).weightMeasured,
					}
				}),
				unit,
				minSpan: key === 'height' ? 1 : 0.2,
			},
		}

		return (
			<View className="chart-card growth-chart-card">
				<View className="growth-chart-header">
					<Text className="chart-title">{label}</Text>
					<View className="chart-actions">
						<Text className="growth-chart-range">
							{lowerBound.toFixed(1)} - {upperBound.toFixed(1)}
							{unit}
						</Text>
						{renderChartActions(posterOpts)}
					</View>
				</View>
				<LineChart
					canvasId={`growth-${key}-chart`}
					unit={unit}
					minSpan={key === 'height' ? 1 : 0.2}
					points={posterOpts.data.points as LineChartPoint[]}
				/>
			</View>
		)
	}

	const renderTemperatureLineChart = (points: TemperatureTrendPoint[]) => {
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
								? -Math.atan2(dy * growthChartRatio, dx) * (180 / Math.PI)
								: 0
							const length = previous
								? Math.sqrt(
										dx * dx + dy * growthChartRatio * (dy * growthChartRatio),
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
										className="growth-point temperature-point"
										style={{ left: `${point.x}%`, bottom: `${point.y}%` }}
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
	// 身高/体重分开记录后，同一类型下只统计与展示当前指标的记录
	const growthItems =
		activeType === 'height_weight'
			? displayItems.filter(item => item[growthMetric] != null)
			: displayItems

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
		? (latestGrowth[growthMetric] as number).toFixed(1)
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
	const growthHeroIllu =
		currentBaby?.gender === 'male' ? growthBoyIllu : growthGirlIllu

	// 刻度尺联动（固定插画 + 动态尺子）：虚线永远贴宝宝头顶、插画恒定高度踩尺底，
	// 身高变化只动刻度尺——量程取整档（身高 20cm / 体重 4kg），尺高按 头顶高度×量程÷测量值 反推，
	// 使虚线落点的刻度读数正好等于测量值（全档位尺高稳定在 197~203pt，视觉无跳变）
	const growthNum =
		latestGrowthValue != null ? parseFloat(latestGrowthValue) : null
	const rulerStep = growthMetric === 'height' ? 20 : 2
	const rulerMin = growthMetric === 'height' ? 60 : 4
	// 量程收紧到测量值 1.25 倍左右（整档），头顶上方只留一档内呼吸感，卡片不虚高
	let rulerMax = growthMetric === 'height' ? 100 : 16
	if (growthNum != null && growthNum > 0) {
		rulerMax = Math.max(
			rulerMin,
			Math.round((growthNum * 1.25) / rulerStep) * rulerStep,
		)
		// 保证头顶与尺顶至少 10% 余量，虚线不顶到尺顶数字
		if (rulerMax < growthNum * 1.1) {
			rulerMax += rulerStep
		}
	}
	const rulerTicks = Array.from(
		{ length: rulerMax / rulerStep + 1 },
		(_, i) => i * rulerStep,
	)
	// 插画固定 130×160pt（aspectFill 裁两侧装饰边）；素材头顶距图顶 5.9%/8.1%
	const growthIlluHeadPct = currentBaby?.gender === 'male' ? 0.059 : 0.081
	const growthIlluWidthPt = 158
	const growthIlluHeightPt = 160
	const growthMarkHeightPt = growthIlluHeightPt * (1 - growthIlluHeadPct)
	// 尺高反推：头顶(固定) ÷ (测量值/量程)；无数据用默认尺高 200pt
	const rulerHeightPt =
		growthNum != null && growthNum > 0
			? (growthMarkHeightPt * rulerMax) / growthNum
			: 200

	// ── 体重仪表盘（同「固定插画 + 动态刻度」思路：宝宝站秤不动，指针角度随体重）──
	// 量程 = 测量值 1.25 倍取偶数档，向下跨 4 档（8kg 跨度，贴 UI 稿 4-12kg：9.2 → 4-12）
	const gaugeStep = 2
	const gaugeMax =
		growthNum != null && growthNum > 0
			? Math.max(
					gaugeStep * 2,
					Math.round((growthNum * 1.25) / gaugeStep) * gaugeStep,
				)
			: 12
	const gaugeMin = Math.max(0, gaugeMax - gaugeStep * 4)
	// 角度系：0° = 正上、顺时针为正；弧从 -136°(min) 到 -21°(max)，与 UI 稿一致
	// 弧心 = 宝宝躯干位置：弧带围着宝宝，脚踩区域底
	const gaugeStartDeg = -136
	const gaugeSpanDeg = 115
	const gaugeCenterX = 100 // pt，左区坐标系
	const gaugeCenterY = 100
	const gaugeT =
		growthNum != null
			? Math.min(1, Math.max(0, (growthNum - gaugeMin) / (gaugeMax - gaugeMin)))
			: 0
	const gaugePointerDeg = gaugeStartDeg + gaugeT * gaugeSpanDeg
	// 极坐标 → 左区 pt 坐标
	const gaugePos = (deg: number, radius: number) => ({
		left: `${gaugeCenterX + radius * Math.sin((deg * Math.PI) / 180)}px`,
		top: `${gaugeCenterY - radius * Math.cos((deg * Math.PI) / 180)}px`,
	})
	// 弧带用 SVG data-URI 渲染（小程序 webview 对 conic-gradient+mask 支持不可靠）：
	// 轨道浅粉全程，进度深粉 min→当前值；viewBox 200×200 与左区 pt 坐标系 1:1
	const gaugeDeg2XY = (deg: number, radius: number) => [
		100 + radius * Math.sin((deg * Math.PI) / 180),
		100 - radius * Math.cos((deg * Math.PI) / 180),
	]
	const gaugeArcPath = (a1: number, a2: number) => {
		const [x1, y1] = gaugeDeg2XY(a1, 87.5)
		const [x2, y2] = gaugeDeg2XY(a2, 87.5)
		const large = a2 - a1 > 180 ? 1 : 0
		return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A 87.5 87.5 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
	}
	const gaugeProgressDeg = gaugeStartDeg + gaugeT * gaugeSpanDeg
	// 指针三角画进同一张 SVG（顶点朝外指向弧带），避免 CSS 三角旋转的歧义
	const gaugePointerSvg =
		growthNum != null && growthNum > 0
			? (() => {
					const [ax, ay] = gaugeDeg2XY(gaugePointerDeg, 76)
					const [b1x, b1y] = gaugeDeg2XY(gaugePointerDeg - 9, 58)
					const [b2x, b2y] = gaugeDeg2XY(gaugePointerDeg + 9, 58)
					return `<polygon points="${ax},${ay} ${b1x},${b1y} ${b2x},${b2y}" fill="#FD4670"/>`
				})()
			: ''
	// 进度起点 = 轨道起点（min 刻度）：轨道圆头帽处叠深粉圆填充，读数末端保持平头精确
	const [gaugeCapX, gaugeCapY] = gaugeDeg2XY(gaugeStartDeg, 87.5)
	const gaugeArcSrc =
		'data:image/svg+xml;charset=utf-8,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
				`<path d="${gaugeArcPath(gaugeStartDeg, gaugeStartDeg + gaugeSpanDeg)}" stroke="#FBC9D5" stroke-width="13" fill="none" stroke-linecap="round"/>` +
				(gaugeT > 0
					? `<path d="${gaugeArcPath(gaugeStartDeg, gaugeProgressDeg)}" stroke="#FD7FA0" stroke-width="13" fill="none" stroke-linecap="butt"/>` +
						`<circle cx="${gaugeCapX.toFixed(2)}" cy="${gaugeCapY.toFixed(2)}" r="6.5" fill="#FD7FA0"/>`
					: '') +
				gaugePointerSvg +
				`</svg>`,
		)
	// 刻度：主刻度在偶数档位，档间 3 个副刻度
	const gaugeTicks: { deg: number; major: boolean }[] = []
	const gaugeSegDeg = gaugeSpanDeg / ((gaugeMax - gaugeMin) / gaugeStep)
	for (let kg = gaugeMin; kg <= gaugeMax; kg += gaugeStep) {
		const deg =
			gaugeStartDeg + ((kg - gaugeMin) / (gaugeMax - gaugeMin)) * gaugeSpanDeg
		gaugeTicks.push({ deg, major: true })
		if (kg < gaugeMax) {
			for (let m = 1; m <= 3; m++) {
				gaugeTicks.push({
					deg: deg + (gaugeSegDeg * m) / 4,
					major: false,
				})
			}
		}
	}
	const gaugeLabels: { deg: number; label: number }[] = []
	for (let kg = gaugeMin; kg <= gaugeMax; kg += gaugeStep) {
		gaugeLabels.push({
			deg: gaugeStartDeg + ((kg - gaugeMin) / (gaugeMax - gaugeMin)) * gaugeSpanDeg,
			label: kg,
		})
	}
	const gaugeScaleBaby =
		currentBaby?.gender === 'male' ? scaleBabyBoyIllu : scaleBabyGirlIllu

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

			{/* 最新身高/体重英雄卡：身高=动态刻度尺，体重=动态仪表盘；插画固定+信息列共用 */}
			{activeType === 'height_weight' && (
				<View className="growth-hero-card">
					{growthMetric === 'height' ? (
						<View
							className="growth-hero-left"
							style={{ height: `${rulerHeightPt}px` }}
						>
							<View className="growth-hero-ruler">
								{rulerTicks.map(num => (
									<Text
										key={num}
										className={`growth-ruler-num ${
											num === rulerMax ? 'at-top' : num === 0 ? 'at-bottom' : ''
										}`}
										style={{ top: `${(1 - num / rulerMax) * 100}%` }}
									>
										{num}
									</Text>
								))}
								<View className="growth-ruler-ticks" />
								<View className="growth-ruler-line" />
							</View>
							{/* 数值刻度线：位置恒等于头顶（bottom 固定），身高变化由尺子刻度吸收 */}
							{growthNum != null && growthNum > 0 && (
								<View
									className="growth-hero-mark"
									style={{ bottom: `${growthMarkHeightPt}px` }}
								/>
							)}
							{/* 宝宝插画固定尺寸踩尺底，不随测量值缩放 */}
							<Image
								className="growth-hero-illu"
								style={{
									width: `${growthIlluWidthPt}px`,
									height: `${growthIlluHeightPt}px`,
								}}
								src={growthHeroIllu}
								mode="aspectFill"
							/>
						</View>
					) : (
						/* 体重仪表盘：弧带进度(SVG) + 刻度数字 + 指针 + 数值气泡 + 站秤宝宝 */
						<View className="growth-gauge-region">
							{/* 弧带：SVG 轨道 + 进度（兼容性最稳的画法） */}
							<Image
								className="growth-gauge-arc"
								src={gaugeArcSrc}
							/>
							{gaugeTicks.map((tick, i) => (
								<View
									key={`t${i}`}
									className={`growth-gauge-tick ${
										tick.major ? 'major' : 'minor'
									}`}
									style={{
										...gaugePos(tick.deg, 92.5),
										transform: `translate(-50%,-50%) rotate(${tick.deg}deg)`,
									}}
								/>
							))}
							{gaugeLabels.map(({ deg, label }) => (
								<Text
									key={label}
									className="growth-gauge-num"
									style={gaugePos(deg, 99)}
								>
									{label}
								</Text>
							))}
							<Text className="growth-gauge-unit" style={gaugePos(-150, 99)}>
								kg
							</Text>
							{/* 数值气泡：浮在表盘内、指针旁（r=48 恒在区内） */}
							{latestGrowthValue && (
								<View
									className="growth-gauge-bubble"
									style={gaugePos(gaugePointerDeg, 48)}
								>
									<Text className="growth-gauge-bubble-text">
										{latestGrowthValue}
										kg
									</Text>
								</View>
							)}
							{/* 站秤宝宝：盒子宽度按素材比例显式给定（防 image 默认 320rpx 盒溢出盖住按钮点击区） */}
							<Image
								className="growth-gauge-baby"
								style={{
									height: '150px',
									width: `${
										currentBaby?.gender === 'male' ? 90 : 92
									}px`,
								}}
								src={gaugeScaleBaby}
								mode="aspectFit"
							/>
						</View>
					)}
					<View className="growth-hero-info">
						<Text className="growth-hero-label">
							最新{growthMetric === 'height' ? '身高' : '体重'}
						</Text>
						<View className="growth-hero-value-row">
							<Text className="growth-hero-value">
								{latestGrowthValue ?? '--'}
							</Text>
							<Text className="growth-hero-unit">
								{growthMetric === 'height' ? 'cm' : 'kg'}
							</Text>
						</View>
						{latestGrowthDate && (
							<Text className="growth-hero-date">
								记录于 {latestGrowthDate}
							</Text>
						)}
						<View className="growth-hero-btn" onClick={handleGrowthRecord}>
							<Image className="growth-hero-btn-icon" src={pencilWhiteIcon} />
							<Text className="growth-hero-btn-text">
								记录{growthMetric === 'height' ? '身高' : '体重'}
							</Text>
						</View>
						{daysSinceLastGrowth != null && (
							<Text className="growth-hero-last">
								距离上次记录 {daysSinceLastGrowth} 天
							</Text>
						)}
					</View>
				</View>
			)}

			{/* 日期切换：身高/体重看趋势图即可，无单日视图 */}
			{activeType !== 'height_weight' && (
				<View className="date-nav">
					<View
						className="date-arrow"
						onClick={() => handleDateChange(shiftDate(selectedDate, -1))}
					>
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
						onClick={() =>
							!isToday(selectedDate) &&
							handleDateChange(shiftDate(selectedDate, 1))
						}
					>
						<Text>›</Text>
					</View>
				</View>
			)}

			{/* 明细卡：仅每日多次记录类型展示；身高/体重只看趋势图，入口在图表下方按钮 */}
			{activeType !== 'height_weight' && (
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
						<View className="detail-link" onClick={() => goToFullDetail()}>
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
													onClick={() =>
														Taro.previewImage({
															current: item.diaperImage,
															urls: [item.diaperImage],
														})
													}
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
							{activeType === 'height_weight' ? '成长图表' : '趋势图表'}
						</Text>
					</View>
					{/* 时间范围（身高/体重下作用于趋势图；成长曲线始终全量） */}
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
					{activeType === 'feeding' &&
						renderBarChart(displayDailyStats, 'feedingCount', '喂奶次数', '次')}
					{activeType === 'feeding' &&
						renderBarChart(displayDailyStats, 'totalMilk', '奶量', 'ml')}
					{activeType === 'diaper' &&
						renderBarChart(displayDailyStats, 'diaperCount', '尿布次数', '次')}
					{activeType === 'sleep' &&
						renderBarChart(displayDailyStats, 'sleepTotal', '睡眠时长', '时')}
					{/* 身高/体重：趋势折线图 + WHO 成长曲线两图并列展示 */}
					{activeType === 'height_weight' &&
						displayHeightWeightSeries.some(
							point => point[growthMetric] != null,
						) &&
						renderHeightWeightLineChart(
							displayHeightWeightSeries,
							growthMetric,
							growthMetric === 'height' ? '身高趋势' : '体重趋势',
							growthMetric === 'height' ? 'cm' : 'kg',
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
					{activeType === 'height_weight' &&
						currentBaby &&
						babyCurvePoints.length > 0 && (
							<View className="chart-card growth-chart-card">
								<View className="growth-chart-header">
									<Text className="chart-title">
										{growthMetric === 'height' ? '身高' : '体重'}成长曲线
									</Text>
									{renderChartActions({
										kind: 'growth',
										title: `${growthMetric === 'height' ? '身高' : '体重'}成长曲线`,
										babyName: currentBaby.name,
										avatarUrl: currentBaby.avatar,
										genderText,
										rangeText: '0-36月龄',
										metaTexts: [
											'WHO 生长标准',
											`共 ${babyCurvePoints.length} 次测量`,
										],
										reviewTitle: '成长小结',
										reviewText: '对照 WHO 生长标准，看见宝宝成长的每一步～',
										data: {
											metric: growthMetric,
											gender: currentBaby.gender,
											points: babyCurvePoints,
										},
									})}
								</View>
								<GrowthCurveChart
									canvasId="growth-who-chart"
									metric={growthMetric}
									gender={currentBaby.gender}
									babyName={currentBaby.name}
									points={babyCurvePoints}
								/>
								<Text className="who-disclaimer">
									参考线为
									WHO《儿童生长标准》P3~P97，仅供日常参考，具体以儿保医生评估为准
								</Text>
							</View>
						)}
					{activeType === 'height_weight' &&
						currentBaby &&
						babyCurvePoints.length === 0 && (
							<View className="chart-card growth-empty">
								<Text>记录身高体重后，这里会画出宝宝的成长曲线</Text>
							</View>
						)}
					{activeType === 'temperature' &&
						displayTemperatureTrend.length > 0 &&
						renderTemperatureLineChart(displayTemperatureTrend)}
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
				<View className="growth-detail-btn" onClick={() => goToFullDetail()}>
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
