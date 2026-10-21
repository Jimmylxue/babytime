import { View, Text } from '@tarojs/components'
import { DailyStat } from '../../../stores/recordStore'
import { formatDate } from '../../../utils/date'

interface DailyCalendarChartProps {
	stats: DailyStat[]
	statKey: keyof DailyStat
	unit: string
	selectedDate: string
	onDateChange: (date: string) => void
	rangeText: string
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const localDate = (value: string | Date) => {
	const [year, month, day] = formatDate(value).split('-').map(Number)
	return new Date(year, month - 1, day)
}

const formatValue = (value: number, unit: string) => {
	if (unit === '时') return (value / 60).toFixed(1).replace(/\.0$/, '')
	return String(value)
}

// 从浅粉到深粉，按数值大小着色；0 值保持中性底色
const heatColor = (ratio: number) => {
	const from = [255, 241, 244]
	const to = [242, 110, 136]
	const t = Math.min(1, 0.12 + ratio * 0.88)
	const [r, g, b] = from.map((start, i) =>
		Math.round(start + (to[i] - start) * t),
	)
	return `rgb(${r}, ${g}, ${b})`
}

// 14/30 天用的日历格子：7 列、不横向滚动，每格直接读出当天数值
export default function DailyCalendarChart({
	stats,
	statKey,
	unit,
	selectedDate,
	onDateChange,
	rangeText,
}: DailyCalendarChartProps) {
	if (!stats.length) return null

	const values = stats.map(stat => (stat[statKey] as number) || 0)
	const maxValue = Math.max(...values, 1)
	const firstDay = localDate(stats[0].date)
	const leading = firstDay.getDay()
	const trailing = (7 - ((leading + stats.length) % 7)) % 7
	const selectedKey = formatDate(selectedDate)

	const cells: Array<
		| { blank: true; key: string }
		| { blank: false; key: string; stat: DailyStat; value: number }
	> = []
	for (let i = 0; i < leading; i += 1) {
		cells.push({ blank: true, key: `lead-${i}` })
	}
	stats.forEach((stat, index) => {
		cells.push({
			blank: false,
			key: `day-${index}`,
			stat,
			value: (stat[statKey] as number) || 0,
		})
	})
	for (let i = 0; i < trailing; i += 1) {
		cells.push({ blank: true, key: `tail-${i}` })
	}

	return (
		<View className='daily-calendar'>
			<View className='cal-head'>
				<Text className='cal-range'>{rangeText}</Text>
				<View className='cal-legend'>
					<Text className='cal-legend-text'>少</Text>
					<View className='cal-legend-bar' />
					<Text className='cal-legend-text'>多</Text>
				</View>
			</View>

			<View className='cal-weekdays'>
				{WEEKDAYS.map(day => (
					<Text className='cal-weekday' key={day}>
						{day}
					</Text>
				))}
			</View>

			<View className='cal-grid'>
				{cells.map(cell => {
					if (cell.blank) {
						return <View className='cal-cell cal-cell-blank' key={cell.key} />
					}
					const dateKey = formatDate(cell.stat.date)
					const date = localDate(cell.stat.date)
					const ratio = cell.value > 0 ? cell.value / maxValue : 0
					const selected = dateKey === selectedKey
					const lightText = ratio > 0.6
					return (
						<View
							className='cal-cell'
							key={cell.key}
							onClick={() => onDateChange(cell.stat.date)}
						>
							<View
								className={`cal-cell-inner${selected ? ' selected' : ''}`}
								style={{
									background: cell.value > 0 ? heatColor(ratio) : '#FAF8F6',
								}}
							>
								<Text
									className='cal-date'
									style={{ color: lightText ? 'rgba(255,255,255,.82)' : undefined }}
								>
									{date.getMonth() + 1}/{date.getDate()}
								</Text>
								<Text
									className={`cal-value${cell.value > 0 ? '' : ' muted'}`}
									style={{ color: lightText ? '#FFFFFF' : undefined }}
								>
									{cell.value > 0 ? formatValue(cell.value, unit) : '—'}
								</Text>
							</View>
						</View>
					)
				})}
			</View>
		</View>
	)
}
