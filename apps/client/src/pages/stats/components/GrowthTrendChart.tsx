import { View, Text } from '@tarojs/components'
import LineChart, { LineChartPoint } from '../../../components/LineChart'
import { ChartPosterOptions } from '../../../utils/chartExport'
import { formatMeasurement } from '../../../utils/format'
import { fmtShort, GrowthSeriesPoint } from '../utils'
import ChartActions from './ChartActions'

interface GrowthTrendChartProps {
	points: GrowthSeriesPoint[]
	metric: 'height' | 'weight'
	label: string
	unit: string
	days: number
	highlightIndex: number | null
	onSelectIndex: (index: number | null) => void
	babyName?: string
	avatarUrl?: string
	genderText?: string
	dateRangeText: string
	exportPoster: (opts: ChartPosterOptions, action: 'save' | 'share') => void
}

// 身高/体重趋势折线图（成长曲线已独立成 WHO 模块，这里只看所选时间范围）
export default function GrowthTrendChart({
	points,
	metric,
	label,
	unit,
	days,
	highlightIndex,
	onSelectIndex,
	babyName,
	avatarUrl,
	genderText,
	dateRangeText,
	exportPoster,
}: GrowthTrendChartProps) {
	const values = points
		.map(point => point[metric])
		.filter((value): value is number => value != null)
	if (values.length === 0) return null

	const minValue = Math.min(...values)
	const maxValue = Math.max(...values)
	const padding = Math.max(
		(maxValue - minValue) * 0.2,
		metric === 'height' ? 1 : 0.2,
	)
	const lowerBound = minValue - padding
	const upperBound = maxValue + padding

	const lastValue = points[points.length - 1][metric] as number
	const metricLabel = metric === 'height' ? '身高' : '体重'
	const firstMeasured = points.find(point =>
		metric === 'height' ? point.heightMeasured : point.weightMeasured,
	)?.[metric] as number | undefined
	const reviewText =
		firstMeasured != null
			? `近${days}天${metricLabel}从 ${formatMeasurement(firstMeasured)}${unit} 到 ${formatMeasurement(lastValue)}${unit}，宝宝在稳稳长大～`
			: `近${days}天${metricLabel}最新 ${formatMeasurement(lastValue)}${unit}，宝宝在稳稳长大～`
	const whoRangeText = points.length
		? `${fmtShort(points[0].date)} – ${fmtShort(points[points.length - 1].date)}`
		: dateRangeText
	const posterOpts: ChartPosterOptions = {
		kind: 'line',
		title: label,
		babyName,
		avatarUrl,
		genderText,
		rangeText: whoRangeText,
		metaTexts: [`近${days}天`, `最新 ${formatMeasurement(lastValue)}${unit}`],
		reviewTitle: `近${days}天小结`,
		reviewText,
		data: {
			points: points.map(point => {
				const d = new Date(point.date)
				return {
					value: point[metric] as number,
					label: `${d.getMonth() + 1}/${d.getDate()}`,
					measured: metric === 'height' ? point.heightMeasured : point.weightMeasured,
				}
			}),
			unit,
			minSpan: metric === 'height' ? 1 : 0.2,
			formatValue: formatMeasurement,
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
					<ChartActions
						onShare={() => exportPoster(posterOpts, 'share')}
						onSave={() => exportPoster(posterOpts, 'save')}
					/>
				</View>
			</View>
			<LineChart
				canvasId={`growth-${metric}-chart`}
				unit={unit}
				minSpan={metric === 'height' ? 1 : 0.2}
				points={posterOpts.data.points as LineChartPoint[]}
				formatValue={formatMeasurement}
				highlightIndex={highlightIndex}
				onSelectIndex={onSelectIndex}
			/>
		</View>
	)
}
