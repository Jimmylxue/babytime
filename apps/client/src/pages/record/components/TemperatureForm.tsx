import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

// 「上次记录」提示条摘要（体温）
export function buildLastHint(last: any): string {
	return last.temperature ? `${last.temperature}°C` : ''
}

const TemperatureForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function TemperatureForm({ initialRecord, lastRecord }, ref) {
		const [temperature, setTemperature] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (lastRecord?.temperature != null)
				setTemperature(String(lastRecord.temperature))
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (initialRecord?.temperature != null)
				setTemperature(String(initialRecord.temperature))
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = {}
				if (temperature) data.temperature = parseFloat(temperature)
				return data
			},
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">体温 (°C)</Text>
					<Input
						className="form-input"
						type="digit"
						placeholder="请输入体温"
						value={temperature}
						onInput={e => setTemperature(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default TemperatureForm
