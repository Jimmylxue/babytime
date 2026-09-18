import { View, Text, Picker } from '@tarojs/components'
import { formatDate } from '../../../utils/date'
import { getDateLabel, isToday, shiftDate } from '../utils'

interface DateNavProps {
	selectedDate: string
	onChange: (date: string) => void
}

// 日期导航：前一天/后一天 + 日期选择器 + 一键回今天
export default function DateNav({ selectedDate, onChange }: DateNavProps) {
	return (
		<View className="date-nav">
			<View className="date-arrow" onClick={() => onChange(shiftDate(selectedDate, -1))}>
				<Text>‹</Text>
			</View>
			<Picker
				mode="date"
				value={selectedDate}
				end={formatDate(new Date())}
				onChange={e => onChange(e.detail.value as string)}
			>
				<View className="date-label-wrap">
					<Text className="date-label">{getDateLabel(selectedDate)}</Text>
					<Text className="date-icon">📅</Text>
				</View>
			</Picker>
			<View
				className={`date-arrow ${isToday(selectedDate) ? 'disabled' : ''}`}
				onClick={() =>
					!isToday(selectedDate) && onChange(shiftDate(selectedDate, 1))
				}
			>
				<Text>›</Text>
			</View>
			{/* 一键回到今天：只在不是今天时出现，避免与日期标签上的「今天」重复 */}
			{!isToday(selectedDate) && (
				<View className="date-today" onClick={() => onChange(formatDate(new Date()))}>
					<Text>今天</Text>
				</View>
			)}
		</View>
	)
}
