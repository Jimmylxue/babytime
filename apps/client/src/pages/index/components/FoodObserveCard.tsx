import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { recordApi } from '../../../utils/request'
import { formatDate } from '../../../utils/date'
import {
	buildFoodIntros,
	foodObserveText,
	type FoodIntroSummary,
} from '@baby-time/shared'

interface FoodObserveCardProps {
	babyId: string
	/** 与其他首页卡片共用的刷新信号（记完记录后 +1） */
	refreshKey?: number
}

/**
 * 首页「新食物观察」卡。
 *
 * 只在有「正在观察」的食物时出现 —— 没有新食物要观察时整块不渲染，
 * 不占首页空间（首页已经很长了，见第一波时间线返工的教训）。
 *
 * 数据来源：/record/detail?type=food&days=14，取最近两周的辅食记录，
 * 按食物名聚合算「第几天」。观察窗结束后自动消失，不需要用户手动清理。
 */
export default function FoodObserveCard({ babyId, refreshKey }: FoodObserveCardProps) {
	const [observing, setObserving] = useState<FoodIntroSummary[]>([])

	useEffect(() => {
		let cancelled = false
		recordApi
			.getDetail(babyId, 'food', { days: 14, pageSize: 50 })
			.then(res => {
				if (cancelled) return
				const items = (res.data?.items || []).map((item: any) => ({
					foodName: item.foodName || '',
					date: formatDate(item.startTime),
					reaction: item.foodReaction || null,
				}))
				const all = buildFoodIntros(items, formatDate(new Date()))
				setObserving(all.filter(item => item.observing || item.hasReaction))
			})
			.catch(() => {
				// 拉不到就不显示，不打扰首页
			})
		return () => {
			cancelled = true
		}
	}, [babyId, refreshKey])

	if (observing.length === 0) return null

	const goRecordFood = () => {
		void Taro.navigateTo({ url: `/pages/record/index?type=food&babyId=${babyId}` })
	}

	return (
		<View className="food-observe-card">
			<View className="food-observe-head">
				<View className="section-accent" />
				<Text className="section-label">新食物观察</Text>
				<View className="food-observe-add" onClick={goRecordFood}>
					<Text className="food-observe-add-text">记一笔 ›</Text>
				</View>
			</View>
			{observing.slice(0, 3).map(item => (
				<View
					key={item.foodName}
					className={`food-observe-row${item.hasReaction ? ' warn' : ''}`}
				>
					<View className="food-observe-main">
						<Text className="food-observe-name">{item.foodName}</Text>
						<Text className="food-observe-desc">
							{foodObserveText(item)}
						</Text>
					</View>
					<Text className="food-observe-day">第 {item.dayIndex} 天</Text>
				</View>
			))}
			{observing.length > 3 && (
				<Text className="food-observe-more">
					还有 {observing.length - 3} 种在观察
				</Text>
			)}
		</View>
	)
}
