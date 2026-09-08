import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

const OutdoorForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function OutdoorForm({ initialRecord }, ref) {
		const [outdoorLocation, setOutdoorLocation] = useState('')
		const [duration, setDuration] = useState('')

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.outdoorLocation)
				setOutdoorLocation(initialRecord.outdoorLocation)
			if (initialRecord.duration != null)
				setDuration(String(initialRecord.duration))
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = { outdoorLocation }
				if (duration) data.duration = parseInt(duration)
				return data
			},
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">活动地点</Text>
					<Input
						className="form-input"
						placeholder="如：小区公园"
						value={outdoorLocation}
						onInput={e => setOutdoorLocation(e.detail.value)}
					/>
				</View>
				<View className="form-group">
					<Text className="form-label">活动时长 (分钟)</Text>
					<Input
						className="form-input"
						type="number"
						placeholder="请输入活动时长"
						value={duration}
						onInput={e => setDuration(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default OutdoorForm
