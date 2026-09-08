import { View, Text, Input } from '@tarojs/components'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { recordApi } from '../../../utils/request'
import { formatDate } from '../../../utils/date'
import type { RecordFormHandle, RecordFormProps } from './types'

// 身高体重表单：metric 为 height/weight 时只记录对应一项（拆分入口），
// 不传 metric 时两项均选填、至少填一项
const HeightWeightForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function HeightWeightForm({ initialRecord, metric, babyId, isEdit }, ref) {
		const [height, setHeight] = useState('')
		const [weight, setWeight] = useState('')
		const [lastMeasurement, setLastMeasurement] = useState<{
			height: number | null
			weight: number | null
			date: string
		} | null>(null)

		// 新增测量时展示上次测量值，方便对比录入
		useEffect(() => {
			if (isEdit || !babyId) return
			recordApi
				.getStats(babyId)
				.then(res => setLastMeasurement(res.data?.latestHeightWeight || null))
				.catch(() => {})
		}, [isEdit, babyId])

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.height != null) setHeight(String(initialRecord.height))
			if (initialRecord.weight != null) setWeight(String(initialRecord.weight))
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => {
				if (metric === 'height' && !height) return '请输入身高'
				if (metric === 'weight' && !weight) return '请输入体重'
				if (!metric && !height && !weight) return '身高和体重至少填写一项'
				return null
			},
			buildPayload: () => {
				// 拆分入口下只提交当前项，另一项保持 null 不覆盖历史
				const data: Record<string, any> = {}
				if ((!metric || metric === 'height') && height)
					data.height = parseFloat(height)
				if ((!metric || metric === 'weight') && weight)
					data.weight = parseFloat(weight)
				return data
			},
		}))

		return (
			<View className="record-card">
				{lastMeasurement && (
					<View className="last-measurement-tip">
						<Text>
							上次测量（{formatDate(lastMeasurement.date)}）：
							{[
								metric !== 'weight' && lastMeasurement.height != null
									? `身高${lastMeasurement.height}cm`
									: '',
								metric !== 'height' && lastMeasurement.weight != null
									? `体重${lastMeasurement.weight}kg`
									: '',
							]
								.filter(Boolean)
								.join('，')}
						</Text>
					</View>
				)}
				{(metric === 'height' || !metric) && (
					<View className="form-group">
						<Text className="form-label">
							身高 (cm{metric ? '' : '，选填'})
						</Text>
						<Input
							className="form-input"
							type="digit"
							placeholder="请输入身高"
							value={height}
							onInput={e => setHeight(e.detail.value)}
						/>
					</View>
				)}
				{(metric === 'weight' || !metric) && (
					<View className="form-group">
						<Text className="form-label">
							体重 (kg{metric ? '' : '，选填'})
						</Text>
						<Input
							className="form-input"
							type="digit"
							placeholder="请输入体重"
							value={weight}
							onInput={e => setWeight(e.detail.value)}
						/>
					</View>
				)}
			</View>
		)
	},
)

export default HeightWeightForm
