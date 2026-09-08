import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

// 「上次记录」提示条摘要（用药）
export function buildLastHint(last: any): string {
	return [last.medicineName, last.medicineDose].filter(Boolean).join(' · ')
}

const MedicineForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function MedicineForm({ initialRecord, lastRecord }, ref) {
		const [medicineName, setMedicineName] = useState('')
		const [medicineDose, setMedicineDose] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (!lastRecord) return
			if (lastRecord.medicineName) setMedicineName(lastRecord.medicineName)
			if (lastRecord.medicineDose) setMedicineDose(lastRecord.medicineDose)
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.medicineName)
				setMedicineName(initialRecord.medicineName)
			if (initialRecord.medicineDose)
				setMedicineDose(initialRecord.medicineDose)
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => ({
				medicineName,
				medicineDose,
			}),
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">药品名称</Text>
					<Input
						className="form-input"
						placeholder="请输入药品名称"
						value={medicineName}
						onInput={e => setMedicineName(e.detail.value)}
					/>
				</View>
				<View className="form-group">
					<Text className="form-label">用药剂量</Text>
					<Input
						className="form-input"
						placeholder="如：1次1包，1天3次"
						value={medicineDose}
						onInput={e => setMedicineDose(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default MedicineForm
