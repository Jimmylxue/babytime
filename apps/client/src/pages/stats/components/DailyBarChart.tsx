import { View, Text, ScrollView } from '@tarojs/components'
import BarChart from '../../../components/BarChart'
import { DailyStat } from '../../../stores/recordStore'
import { formatDurationLong, formatDate } from '../../../utils/date'
import { ChartPosterOptions } from '../../../utils/chartExport'
import { fmtShort } from '../utils'
import ChartActions from './ChartActions'

interface DailyBarChartProps {
	stats: DailyStat[]
	statKey: keyof DailyStat
	label: string
	unit: string
	days: number
	selectedDate: string
	onDateChange: (date: string) => void
	babyName?: string
	avatarUrl?: string
	genderText?: string
	dateRangeText: string
	exportPoster: (opts: ChartPosterOptions, action: 'save' | 'share') => void
}

// 柱状图卡片（喂奶次数/奶量/尿布次数/睡眠时长共用），含海报导出入口
export default function DailyBarChart({
	stats,
	statKey,
	label,
	unit,
	days,
	selectedDate,
	onDateChange,
	babyName,
	avatarUrl,
	genderText,
	dateRangeText,
	exportPoster,
}: DailyBarChartProps) {
	const dayLabels = ['日', '一', '二', '三', '四', '五', '六']
	// 单位放到标题里，柱顶只留数字，避免相邻标签拥挤
	const points = stats.map(stat => {
		const value = (stat[statKey] as number) || 0
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
	// 选中的那天：让图表高亮与顶部日期导航用同一口径，点柱子后两边会同步
	const activeIndex = stats.findIndex(
		stat => formatDate(stat.date) === formatDate(selectedDate),
	)

	// 「次数」类标题本身已含单位，不再重复；奶量/时长把单位标在标题上
	const titleSuffix =
		unit && unit !== '次' ? ` (${unit === '时' ? '小时' : unit})` : ''

	const total = stats.reduce((sum, stat) => sum + ((stat[statKey] as number) || 0), 0)
	const avgPerDay = (total / days).toFixed(1)
	// 日期范围直接取自数据首尾，保证与图表内容永远一致
	const dataRangeText = stats.length
		? `${fmtShort(stats[0].date)} – ${fmtShort(stats[stats.length - 1].date)}`
		: dateRangeText
	const rangeWord = days === 7 ? '本周' : `近${days}天`

	let metaTexts: string[]
	let reviewText: string
	if (statKey === 'totalMilk') {
		metaTexts = [
			`近${days}天共 ${total}ml`,
			`日均 ${Math.round(total / days)}ml`,
		]
		reviewText = `${rangeWord}奶量稳定，日均 ${Math.round(total / days)}ml，宝宝吃得棒棒哒！`
	} else if (statKey === 'sleepTotal') {
		metaTexts = [`近${days}天共 ${formatDurationLong(total)}`]
		reviewText = `${rangeWord}累计睡眠 ${formatDurationLong(total)}，睡得好的宝宝才能长得好～`
	} else if (statKey === 'diaperCount') {
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
					babyName,
					avatarUrl,
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
					babyName,
					avatarUrl,
					genderText,
					rangeText: dataRangeText,
					metaTexts,
					reviewTitle: `近${days}天小结`,
					reviewText,
					data: {
						points: stats.map(stat => {
							const value = (stat[statKey] as number) || 0
							const [, m, dd] = stat.date.split('-')
							return {
								value,
								label: `${+m}/${+dd}`,
								measured: value > 0,
							}
						}),
						unit: unit === '时' ? '小时' : unit,
						minSpan: statKey === 'totalMilk' ? 50 : 1,
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
				<ChartActions
					onShare={() => exportPoster(posterOpts, 'share')}
					onSave={() => exportPoster(posterOpts, 'save')}
				/>
			</View>
			<ScrollView scrollX className="chart-scroll-view" showScrollbar={false}>
				<BarChart
					canvasId={`bar-${statKey}-chart`}
					points={points}
					highlightIndex={activeIndex >= 0 ? activeIndex : null}
					onSelectIndex={index => {
						if (index == null) return
						const stat = stats[index]
						if (stat?.date) onDateChange(stat.date)
					}}
				/>
			</ScrollView>
		</View>
	)
}
