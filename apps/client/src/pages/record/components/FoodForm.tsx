import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

// 「上次记录」提示条摘要（辅食）
export function buildLastHint(last: any): string {
	return last.foodName ? `吃了${last.foodName}` : ''
}

const FoodForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function FoodForm({ initialRecord, lastRecord }, ref) {
		const [foodName, setFoodName] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (lastRecord?.foodName) setFoodName(lastRecord.foodName)
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (initialRecord?.foodName) setFoodName(initialRecord.foodName)
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => ({ foodName }),
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">辅食名称</Text>
					<Input
						className="form-input"
						placeholder="如：米粉、果泥"
						value={foodName}
						onInput={e => setFoodName(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default FoodForm
