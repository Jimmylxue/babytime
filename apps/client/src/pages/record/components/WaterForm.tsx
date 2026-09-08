import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

// 「上次记录」提示条摘要（饮水）
export function buildLastHint(last: any): string {
	return last.amount ? `${last.amount}ml` : ''
}

const WaterForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function WaterForm({ initialRecord, lastRecord }, ref) {
		const [amount, setAmount] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (lastRecord?.amount != null) setAmount(String(lastRecord.amount))
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (initialRecord?.amount != null) setAmount(String(initialRecord.amount))
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = {}
				if (amount) data.amount = parseInt(amount)
				return data
			},
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">饮水量 (ml)</Text>
					<Input
						className="form-input"
						type="number"
						placeholder="请输入饮水量"
						value={amount}
						onInput={e => setAmount(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default WaterForm
