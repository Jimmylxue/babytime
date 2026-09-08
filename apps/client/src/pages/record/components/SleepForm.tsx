import { View, Text, Picker, Image } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { formatHM, formatDurationLong } from '../../../utils/date'
import clockCoralIcon from '../../../assets/icons/clock-coral.svg'
import { getSleepRange } from './timeUtils'
import type { RecordFormHandle } from './types'

interface SleepFormProps {
	/** 页面公共字段：用于实时展示时长、提交时推算起止时间 */
	recordDate: string
	startTime: string
	/** 编辑态：接口返回的原始记录 */
	initialRecord?: any
}

// 睡眠表单：起床时间 + 自动时长。渲染为日期/时间卡内的两行行卡，
// 由页面嵌在日期卡里（同卡展示），不单独成卡。
const SleepForm = forwardRef<RecordFormHandle, SleepFormProps>(
	function SleepForm({ recordDate, startTime, initialRecord }, ref) {
		const [sleepEndTime, setSleepEndTime] = useState(formatHM(new Date()))

		// 编辑态回填
		useEffect(() => {
			if (initialRecord?.endTime) setSleepEndTime(formatHM(initialRecord.endTime))
		}, [initialRecord])

		const durationMinutes = getSleepRange(
			recordDate,
			startTime,
			sleepEndTime,
		).durationMinutes

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: ctx => {
				const { start, end, durationMinutes } = getSleepRange(
					ctx.recordDate,
					ctx.startTime,
					sleepEndTime,
				)
				return {
					startTime: start.toISOString(),
					endTime: end.toISOString(),
					duration: durationMinutes,
				}
			},
		}))

		return (
			<>
				<Picker
					mode="time"
					value={sleepEndTime}
					onChange={e => setSleepEndTime(e.detail.value)}
				>
					<View className="record-row">
						<View className="record-row-icon">
							<Image className="record-row-icon-img" src={clockCoralIcon} />
						</View>
						<Text className="record-row-label">起床时间</Text>
						<Text className="record-row-value">{sleepEndTime}</Text>
						<Text className="record-row-arrow">›</Text>
					</View>
				</Picker>
				<View className="record-row">
					<View className="record-row-icon">
						<Image className="record-row-icon-img" src={clockCoralIcon} />
					</View>
					<Text className="record-row-label">睡眠时长</Text>
					<Text className="record-row-value">
						{formatDurationLong(durationMinutes)}
					</Text>
				</View>
			</>
		)
	},
)

export default SleepForm
