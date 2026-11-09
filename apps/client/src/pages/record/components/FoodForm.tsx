import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RecordFormHandle, RecordFormProps } from './types'

// 「上次记录」提示条摘要（辅食）
export function buildLastHint(last: any): string {
	return last.foodName ? `吃了${last.foodName}` : ''
}

// 反应选项：措辞避开「过敏」等诊断性词，只描述观察结果
const REACTIONS = [
	{ value: 'none', label: '正常', sub: '没什么特别' },
	{ value: 'observe', label: '再观察', sub: '有点变化' },
	{ value: 'reaction', label: '有反应', sub: '皮疹/呕吐/腹泻' },
]

const FoodForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function FoodForm({ initialRecord, lastRecord }, ref) {
		const [foodName, setFoodName] = useState('')
		const [foodReaction, setFoodReaction] = useState('')
		const [foodIsNew, setFoodIsNew] = useState(false)

		// 新增态「按上次来」预填（只预填名称，反应每次都要重新判断）
		useEffect(() => {
			if (lastRecord?.foodName) setFoodName(lastRecord.foodName)
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.foodName) setFoodName(initialRecord.foodName)
			if (initialRecord.foodReaction) setFoodReaction(initialRecord.foodReaction)
			if (initialRecord.foodIsNew) setFoodIsNew(true)
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = { foodName }
				if (foodReaction) data.foodReaction = foodReaction
				data.foodIsNew = foodIsNew
				return data
			},
		}))

		return (
			<>
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

				{/* 新食物 3 天观察：6–12 月龄加辅食的核心动作，只记观察状态不下结论 */}
				<View className="record-card">
					<View className="record-card-label-row">
						<Text className="record-card-label">吃完怎么样</Text>
						<Text className="record-card-hint">新食物建议观察 3 天</Text>
					</View>
					<View className="food-reaction-row">
						{REACTIONS.map(item => (
							<View
								key={item.value}
								className={`food-reaction-item${foodReaction === item.value ? ' active' : ''} ${item.value}`}
								onClick={() =>
									setFoodReaction(foodReaction === item.value ? '' : item.value)
								}
							>
								<Text className="food-reaction-label">{item.label}</Text>
								<Text className="food-reaction-sub">{item.sub}</Text>
							</View>
						))}
					</View>
					<View
						className={`food-new-toggle${foodIsNew ? ' active' : ''}`}
						onClick={() => setFoodIsNew(!foodIsNew)}
					>
						<View className={`food-new-check${foodIsNew ? ' active' : ''}`}>
							{foodIsNew && <Text className="food-new-check-mark">✓</Text>}
						</View>
						<Text className="food-new-text">这是第一次吃这个</Text>
					</View>
					{foodReaction === 'reaction' && (
						<Text className="food-reaction-warn">
							建议先停 3 天再试，或咨询儿科医生；出现呼吸急促、面唇肿请立即就医
						</Text>
					)}
				</View>
			</>
		)
	},
)

export default FoodForm
