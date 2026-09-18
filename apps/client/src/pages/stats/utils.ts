import { formatDate } from '../../utils/date'
import { HeightWeightTrendPoint } from '../../stores/recordStore'

export interface GrowthSeriesPoint extends HeightWeightTrendPoint {
	heightMeasured: boolean
	weightMeasured: boolean
}

export function isToday(dateStr: string): boolean {
	return dateStr === formatDate(new Date())
}

export function shiftDate(dateStr: string, delta: number): string {
	const d = new Date(dateStr)
	d.setDate(d.getDate() + delta)
	return formatDate(d)
}

export function getDateLabel(dateStr: string): string {
	if (isToday(dateStr)) return '今天'
	if (dateStr === shiftDate(formatDate(new Date()), -1)) return '昨天'
	const d = new Date(dateStr)
	const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
	return `${d.getMonth() + 1}月${d.getDate()}日 ${weekLabels[d.getDay()]}`
}

// 兼容 YYYY-MM-DD 与 ISO 带时间两种格式
export function fmtShort(d: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
		const [, m, dd] = d.split('-')
		return `${+m}/${+dd}`
	}
	const date = new Date(d)
	return `${date.getMonth() + 1}/${date.getDate()}`
}

export function buildGrowthSeries(
	points: HeightWeightTrendPoint[],
	rangeDays: number,
): GrowthSeriesPoint[] {
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
