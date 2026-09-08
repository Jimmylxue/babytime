import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

const feedingMethods = [
	{ value: 'breast', label: '母乳' },
	{ value: 'formula', label: '奶粉' },
	{ value: 'mixed', label: '混合' },
]

// 「上次记录」提示条摘要（喂奶）
export function buildLastHint(last: any): string {
	const methodLabel: Record<string, string> = {
		breast: '母乳',
		formula: '奶粉',
		mixed: '混合',
	}
	const parts: string[] = []
	if (last.feedingMethod)
		parts.push(methodLabel[last.feedingMethod] || last.feedingMethod)
	if (last.feedingMethod === 'mixed') {
		const b = last.breastAmount ? `母${last.breastAmount}ml` : ''
		const f = last.formulaAmount ? `奶${last.formulaAmount}ml` : ''
		const bf = [b, f].filter(Boolean).join('+')
		if (bf) parts.push(bf)
	} else if (last.amount) {
		parts.push(`${last.amount}ml`)
	}
	if (last.duration) parts.push(`${last.duration}分钟`)
	return parts.join(' · ')
}

const FeedingForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function FeedingForm({ initialRecord, lastRecord }, ref) {
		const [feedingMethod, setFeedingMethod] = useState('formula')
		const [amount, setAmount] = useState('')
		const [breastAmount, setBreastAmount] = useState('')
		const [formulaAmount, setFormulaAmount] = useState('')
		const [duration, setDuration] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (!lastRecord) return
			if (lastRecord.feedingMethod) setFeedingMethod(lastRecord.feedingMethod)
			if (lastRecord.amount != null) setAmount(String(lastRecord.amount))
			if (lastRecord.breastAmount != null)
				setBreastAmount(String(lastRecord.breastAmount))
			if (lastRecord.formulaAmount != null)
				setFormulaAmount(String(lastRecord.formulaAmount))
			if (lastRecord.duration != null) setDuration(String(lastRecord.duration))
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.feedingMethod)
				setFeedingMethod(initialRecord.feedingMethod)
			if (initialRecord.amount != null) setAmount(String(initialRecord.amount))
			if (initialRecord.breastAmount != null)
				setBreastAmount(String(initialRecord.breastAmount))
			if (initialRecord.formulaAmount != null)
				setFormulaAmount(String(initialRecord.formulaAmount))
			if (initialRecord.duration != null)
				setDuration(String(initialRecord.duration))
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = { feedingMethod }
				if (feedingMethod === 'mixed') {
					if (breastAmount) data.breastAmount = parseInt(breastAmount)
					if (formulaAmount) data.formulaAmount = parseInt(formulaAmount)
				} else if (amount) {
					data.amount = parseInt(amount)
				}
				if (duration) data.duration = parseInt(duration)
				return data
			},
		}))

		return (
			<View className="record-card">
				<View className="form-group">
					<Text className="form-label">喂养方式</Text>
					<View className="method-grid">
						{feedingMethods.map(m => (
							<View
								key={m.value}
								className={`method-item ${feedingMethod === m.value ? 'active' : ''}`}
								onClick={() => setFeedingMethod(m.value)}
							>
								<Text>{m.label}</Text>
							</View>
						))}
					</View>
				</View>
				{(feedingMethod === 'formula' || feedingMethod === 'breast') && (
					<View className="form-group">
						<Text className="form-label">
							{feedingMethod === 'breast'
								? '母乳量 (ml，可选)'
								: '奶量 (ml)'}
						</Text>
						<Input
							className="form-input"
							type="number"
							placeholder="请输入奶量"
							value={amount}
							onInput={e => setAmount(e.detail.value)}
						/>
					</View>
				)}
				{feedingMethod === 'mixed' && (
					<>
						<View className="form-group">
							<Text className="form-label">母乳量 (ml)</Text>
							<Input
								className="form-input"
								type="number"
								placeholder="请输入母乳量"
								value={breastAmount}
								onInput={e => setBreastAmount(e.detail.value)}
							/>
						</View>
						<View className="form-group">
							<Text className="form-label">奶粉量 (ml)</Text>
							<Input
								className="form-input"
								type="number"
								placeholder="请输入奶粉量"
								value={formulaAmount}
								onInput={e => setFormulaAmount(e.detail.value)}
							/>
						</View>
					</>
				)}
				<View className="form-group">
					<Text className="form-label">时长 (分钟)</Text>
					<Input
						className="form-input"
						type="number"
						placeholder="请输入时长"
						value={duration}
						onInput={e => setDuration(e.detail.value)}
					/>
				</View>
			</View>
		)
	},
)

export default FeedingForm
