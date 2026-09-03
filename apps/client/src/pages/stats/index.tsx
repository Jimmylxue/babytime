import {View, Text, ScrollView, Picker, Image, Canvas } from '@tarojs/components'
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
	calculateAge,
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
import { notificationApi, recordApi, VaccinePlanItem } from '../../utils/request'
import {
	getCurrentVaccineStage,
	getVaccineReferenceDate,
	VACCINE_SCHEDULE,
	VaccineScheduleItem,
} from '../../utils/vaccineSchedule'
import TabBar from '../../components/TabBar'
import LineChart, { LineChartPoint } from '../../components/LineChart'
import BarChart from '../../components/BarChart'
import GrowthCurveChart from '../../components/GrowthCurveChart'
import {
	deliverChartPoster,
	ChartPosterOptions,
} from '../../utils/chartExport'
import downloadIcon from '../../assets/icons/download.svg'
import shareIcon from '../../assets/icons/share.svg'
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

interface VaccineRecord {
	id: string
	startTime: string
	vaccineName?: string
	vaccineHospital?: string
	vaccineScheduleItemId?: string
}

const vaccineAgeGroups = Array.from(
	new Set(VACCINE_SCHEDULE.map(item => item.ageMonths)),
)

function formatVaccineDate(date: string) {
	const [year, month, day] = date.split('-').map(Number)
	return `${year}年${month}月${day}日`
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
	// 身高体重页签的视图：近 N 天趋势 / WHO 成长曲线
	const [growthView, setGrowthView] = useState<'trend' | 'who'>('trend')
	// 成长曲线用全量身高体重历史（stats 接口无 days 上限）
	const [whoSeries, setWhoSeries] = useState<HeightWeightTrendPoint[]>([])
	const [growthChartRatio, setGrowthChartRatio] = useState(0.46)
	const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([])
	const [vaccinePlans, setVaccinePlans] = useState<Record<string, VaccinePlanItem>>({})

	const loadVaccineRecords = async (babyId: string) => {
		const [recordRes, planRes] = await Promise.all([
			recordApi.getVaccines(babyId),
			notificationApi.getVaccinePlans(babyId).catch(() => null),
		])
		setVaccineRecords(recordRes.data || [])
		setVaccinePlans(Object.fromEntries((planRes?.data || []).map(plan => [plan.scheduleItemId, plan])))
	}

	// 拉取选中日期的明细/汇总，完成后拷贝到本页状态，之后 store 再被谁覆盖都不影响本页展示
	const loadDayDetail = async (
		babyId: string,
		type: string,
		date: string,
	) => {
		const metric =
			type === 'height_weight' ? activeMetric || undefined : undefined
		// store 的 detailSummary 是单值，前一日和当日只能串行取：先取前一日（较昨日对比用），再取当日覆盖
		await fetchDetail(babyId, type, { date, metric })
		setDayItems(useRecordStore.getState().detailItems)
		try {
			await fetchDetailSummary(babyId, type, {
				date: shiftDate(date, -1),
				metric,
			})
			setPrevDaySummary(useRecordStore.getState().detailSummary)
		} catch {
			setPrevDaySummary(null)
		}
		await fetchDetailSummary(babyId, type, { date, metric })
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
					if (activeType === 'vaccine') loadVaccineRecords(baby.id)
					else loadDayDetail(baby.id, activeType, selectedDate)
				}
			})
	})

	useEffect(() => {
		if (isLoggedIn && currentBaby && activeType !== 'vaccine') {
			loadDayDetail(currentBaby.id, activeType, selectedDate)
		}
	}, [isLoggedIn, currentBaby?.id, activeType, activeMetric, selectedDate])

	useEffect(() => {
		if (isLoggedIn && currentBaby && activeType === 'vaccine') {
			loadVaccineRecords(currentBaby.id).catch(() =>
				Taro.showToast({ title: '加载疫苗记录失败', icon: 'none' }),
			)
		}
	}, [isLoggedIn, currentBaby?.id, activeType])

	// 进入「成长曲线」视图时拉取全量身高体重历史
	useEffect(() => {
		if (
			!isLoggedIn ||
			!currentBaby ||
			activeType !== 'height_weight' ||
			growthView !== 'who'
		) {
			return
		}
		recordApi
			.getStats(currentBaby.id, 1100)
			.then(res => {
				setWhoSeries(res.data?.heightWeightTrend || [])
			})
			.catch(() => setWhoSeries([]))
	}, [isLoggedIn, currentBaby?.id, activeType, growthView])

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

		const goToVaccineRecord = (item: VaccineScheduleItem) => {
			if (!currentBaby) return
			Taro.navigateTo({
				url: `/pages/record/index?type=vaccine&babyId=${currentBaby.id}&scheduleItemId=${item.id}`,
			})
		}

		const goToVaccineTimeline = () => {
			if (!currentBaby) return
			Taro.navigateTo({ url: `/pages/vaccine-timeline/index?babyId=${currentBaby.id}` })
		}

		const manageVaccineRecord = async (record: VaccineRecord) => {
			if (!currentBaby) return
			try {
				const action = await Taro.showActionSheet({ itemList: ['编辑', '删除'] })
				if (action.tapIndex === 0) {
					Taro.navigateTo({ url: `/pages/record/index?type=vaccine&babyId=${currentBaby.id}&id=${record.id}` })
					return
				}
				const confirm = await Taro.showModal({
					title: '删除接种记录',
					content: `确定删除“${record.vaccineName || '这条疫苗'}”吗？`,
				})
				if (!confirm.confirm) return
				await recordApi.delete(record.id)
				await loadVaccineRecords(currentBaby.id)
				Taro.showToast({ title: '已删除', icon: 'success' })
			} catch (error) {
				if (error?.errMsg && !error.errMsg.includes('cancel')) Taro.showToast({ title: '操作失败', icon: 'none' })
			}
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
			await deliverChartPoster({ ...opts, miniProgramCodeUrl: miniProgramCode }, action)
		} catch (error) {
			Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
		}
	}

	// 成长曲线的实测点：全量历史中的真实测量值换算为月龄
	const babyCurvePoints =
		currentBaby && growthView === 'who'
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
			metaTexts = [`近${days}天共 ${total}ml`, `日均 ${Math.round(total / days)}ml`]
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
		const firstMeasured = points.find(
			point =>
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
			<View className='chart-card growth-chart-card'>
				<View className='growth-chart-header'>
					<Text className='chart-title'>{label}</Text>
					<View className='chart-actions'>
						<Text className='growth-chart-range'>
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
	const displayItems = isLoggedIn && currentBaby ? dayItems : MOCK_DETAIL[activeType].items
	const summary =
		isLoggedIn && currentBaby ? daySummary : MOCK_DETAIL[activeType].summary
	// 身高/体重分开记录后，同一类型下只统计与展示当前指标的记录
	const growthItems =
		activeType === 'height_weight'
			? displayItems.filter(item => item[growthMetric] != null)
			: displayItems

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
				delta: buildDelta(summary?.totalAmount, prevDaySummary?.totalAmount, n => `${n}ml`),
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
	} else if (activeType === 'height_weight') {
		// 后端已按当前指标过滤，汇总次数可覆盖完整结果集。
		const metricCount = `${summary?.count ?? 0}次`
		summaryTiles =
			growthMetric === 'weight'
				? [
						{
							label: '测量次数',
							value: metricCount,
							delta: buildDelta(summary?.count, prevDaySummary?.count),
						},
						{
							label: '最新体重',
							value:
								summary?.latestWeight != null
									? `${summary.latestWeight}kg`
									: '-',
							delta: buildDelta(
								summary?.latestWeight,
								prevDaySummary?.latestWeight,
								n => `${n.toFixed(1)}kg`,
							),
						},
					]
				: [
						{
							label: '测量次数',
							value: metricCount,
							delta: buildDelta(summary?.count, prevDaySummary?.count),
						},
						{
							label: '最新身高',
							value:
								summary?.latestHeight != null
									? `${summary.latestHeight}cm`
									: '-',
							delta: buildDelta(
								summary?.latestHeight,
								prevDaySummary?.latestHeight,
								n => `${n.toFixed(1)}cm`,
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

	const vaccineAge = currentBaby ? calculateAge(currentBaby.birthday) : null
	const currentVaccineItems = vaccineAge
		? getCurrentVaccineStage(vaccineAge.months)
		: []
	const vaccineRecordByScheduleItem = new Map(
		vaccineRecords
			.filter(record => record.vaccineScheduleItemId)
			.map(record => [record.vaccineScheduleItemId as string, record]),
	)
	const scheduledVaccineRecordIds = new Set(
		Array.from(vaccineRecordByScheduleItem.values()).map(record => record.id),
	)
	const customVaccineRecords = vaccineRecords.filter(
		record => !scheduledVaccineRecordIds.has(record.id),
	)

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
									? '/pages/onboarding/index'
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

			{activeType === 'vaccine' ? (
				<View className="vaccine-plan-view">
					{currentBaby && vaccineAge ? (
						<>
							<View className="vaccine-plan-header">
								<View>
									<Text className="vaccine-plan-name">{currentBaby.name}</Text>
									<Text className="vaccine-plan-age">
										{vaccineAge.months}个月{vaccineAge.days}天
									</Text>
								</View>
								<View className="vaccine-plan-stage">
									<Text>当前阶段</Text>
									<Text>{currentVaccineItems[0]?.ageLabel || '常规接种'}</Text>
								</View>
							</View>
							<View className="vaccine-plan-tools">
								<Text className="vaccine-plan-tip">
									国家免疫规划常规接种参考，实际以接种门诊和接种证为准。
								</Text>
								<View className="vaccine-plan-manage" onClick={goToVaccineTimeline}>
									<Text>设置接种日期</Text>
									<Text>›</Text>
								</View>
							</View>
							<View className="vaccine-plan-list">
								{vaccineAgeGroups.map(ageMonths => {
									const items = VACCINE_SCHEDULE.filter(
										item => item.ageMonths === ageMonths,
									)
									const isCurrent = items.some(item =>
										currentVaccineItems.some(current => current.id === item.id),
									)
									return (
										<View
											key={ageMonths}
											className={`vaccine-plan-group${isCurrent ? ' current' : ''}`}
										>
											<View className="vaccine-plan-marker">
												<View />
											</View>
											<View className="vaccine-plan-group-content">
												<View className="vaccine-plan-group-title">
													<Text>{items[0].ageLabel}</Text>
													{isCurrent && <Text>当前</Text>}
												</View>
											{items.map(item => {
												const record = vaccineRecordByScheduleItem.get(
													item.id,
												)
												const plan = vaccinePlans[item.id]
												const referenceDate = plan?.referenceDate || getVaccineReferenceDate(currentBaby.birthday, item.ageMonths)
												const effectiveDate = plan?.scheduledDate || referenceDate
												return (
														<View
															key={item.id}
															className={`vaccine-plan-item${record ? ' completed' : ''}`}
															onClick={() =>
																record
																	? manageVaccineRecord(record)
																	: goToVaccineRecord(item)
															}
														>
															<View>
																<Text className="vaccine-plan-item-name">
																	{item.displayName}
																</Text>
														{record ? (
															<Text className="vaccine-plan-item-info">
																已记录 {formatDate(record.startTime)}
															</Text>
														) : (
															<Text className={`vaccine-plan-item-date${plan?.scheduledDate ? ' custom' : ''}`}>
																{plan?.scheduledDate ? '计划接种' : '参考接种'} {formatVaccineDate(effectiveDate)}
															</Text>
														)}
															</View>
															<Text className="vaccine-plan-item-action">
																{record ? '管理' : '记录'}
															</Text>
														</View>
													)
												})}
											</View>
										</View>
									)
								})}
							</View>
							{customVaccineRecords.length > 0 && (
								<View className="vaccine-custom-list">
									<Text className="vaccine-custom-list-title">
										其他已记录疫苗
									</Text>
									{customVaccineRecords.map(record => (
										<View
											key={record.id}
											className="vaccine-custom-list-item"
											onClick={() => manageVaccineRecord(record)}
										>
											<Text>{record.vaccineName || '未命名疫苗'}</Text>
											<Text>{formatDate(record.startTime)}</Text>
										</View>
									))}
								</View>
							)}
						</>
					) : (
						<View className="vaccine-plan-empty">
							<Text>请先添加宝宝信息后查看疫苗时间轴</Text>
						</View>
					)}
				</View>
			) : (
				<>
					{/* 日期切换 */}
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

						{/* 明细卡 */}
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
								<Text>
									{activeType === 'height_weight'
										? growthMetric === 'height'
											? '这一天还没有身高记录'
											: '这一天还没有体重记录'
										: '这一天还没有记录'}
								</Text>
							</View>
						)}
					</View>

					{/* 统计图表 */}
						{displayDailyStats.length > 0 && (
							<View className="charts-section">
								<View className="section-heading chart-section-heading">
									<View className="section-heading-icon trend-heading-icon">
										<View className="trend-icon-line trend-icon-line-left" />
										<View className="trend-icon-line trend-icon-line-middle" />
										<View className="trend-icon-line trend-icon-line-right" />
									</View>
									<Text className="section-heading-title">趋势图表</Text>
									{activeType === 'height_weight' && (
										<View className="growth-view-toggle">
											<View
												className={`gvt-item ${growthView === 'trend' ? 'active' : ''}`}
												onClick={() => setGrowthView('trend')}
											>
												<Text>趋势</Text>
											</View>
											<View
												className={`gvt-item ${growthView === 'who' ? 'active' : ''}`}
												onClick={() => setGrowthView('who')}
											>
												<Text>成长曲线</Text>
											</View>
										</View>
									)}
								</View>
							{(activeType !== 'height_weight' || growthView === 'trend') && (
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
							)}
							{activeType === 'feeding' &&
								renderBarChart(
									displayDailyStats,
									'feedingCount',
									'喂奶次数',
									'次',
								)}
							{activeType === 'feeding' &&
								renderBarChart(displayDailyStats, 'totalMilk', '奶量', 'ml')}
							{activeType === 'diaper' &&
								renderBarChart(
									displayDailyStats,
									'diaperCount',
									'尿布次数',
									'次',
								)}
							{activeType === 'sleep' &&
								renderBarChart(
									displayDailyStats,
									'sleepTotal',
									'睡眠时长',
									'时',
								)}
							{activeType === 'height_weight' &&
								growthView === 'trend' &&
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
								growthView === 'trend' &&
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
								growthView === 'who' &&
								currentBaby && (
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
												metaTexts: ['WHO 生长标准', `共 ${babyCurvePoints.length} 次测量`],
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
											参考线为 WHO《儿童生长标准》P3~P97，仅供日常参考，具体以儿保医生评估为准
										</Text>
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
				</>
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
