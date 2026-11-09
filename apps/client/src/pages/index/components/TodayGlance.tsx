import { View, Text } from '@tarojs/components'
// 注意：store 里的记录类型叫 Record，会遮蔽 TS 内置的泛型 Record<K,V>，导入时必须改名
import type { Record as BabyRecord } from '../../../stores/recordStore'

interface TodayGlanceProps {
	/** 今天的记录（只需拿来数类型分布，不逐条渲染） */
	records: BabyRecord[]
	/** 数据是否已回来（区分「加载中」与「今天真的没记」） */
	ready: boolean
	/** 点整行：去统计页看完整时间线 */
	onOpenDay: () => void
}

// 这一行里最多提几种类型，超出用「等」收尾，避免撑破一行
const MAX_KINDS = 4

const TYPE_LABELS: Record<string, string> = {
	feeding: '喂奶',
	diaper: '尿布',
	sleep: '睡眠',
	food: '辅食',
	water: '喝水',
	temperature: '体温',
	height_weight: '身高体重',
	medicine: '用药',
	vaccine: '疫苗',
	bath: '洗澡',
	outdoor: '户外',
}

/**
 * 今日概览条：一行字回答「今天记了几条、都记了哪几类」。
 *
 * 首页原本放的是完整时间线（逐条列 07:20 奶粉 150ml …），实测两个问题：
 * ① 和统计页的当日明细完全重复 —— 用户点第二个 tab 就能看到更完整的版本；
 * ② 一天十几条就直接吃掉近一屏，把「疫苗提醒」「最近的瞬间」挤到首屏之外。
 * 所以首页退回到「只给概览 + 一个入口」，明细全部交给统计页。
 */
export default function TodayGlance({
	records,
	ready,
	onOpenDay,
}: TodayGlanceProps) {
	if (!ready) {
		// 骨架屏与真实行同高，数据回来不跳版
		return (
			<View className="today-glance">
				<View className="today-glance-dot" />
				<View
					style={{
						height: '24px',
						width: '58%',
						borderRadius: '8px',
						background: '#f4e9e9',
					}}
				/>
			</View>
		)
	}

	const total = records.length
	if (total === 0) {
		return (
			<View className="today-glance" onClick={onOpenDay}>
				<View className="today-glance-dot" />
				<Text className="today-glance-count">今天还没记</Text>
				<Text className="today-glance-breakdown">随手记一笔，晚上就有回顾</Text>
				<Text className="today-glance-link">去记录 ›</Text>
			</View>
		)
	}

	// 按记录条数排序取前几类，不按类型固定顺序 —— 今天没喂奶就不该出现「喂奶 0 次」
	const counts = records.reduce<Record<string, number>>((acc, record) => {
		acc[record.type] = (acc[record.type] || 0) + 1
		return acc
	}, {})
	const kinds = Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([type, count]) => {
			const label = TYPE_LABELS[type] || '其他'
			return count > 1 ? `${label}${count}` : label
		})
	const shown = kinds.slice(0, MAX_KINDS).join(' · ')
	const breakdown = kinds.length > MAX_KINDS ? `${shown} 等` : shown

	return (
		<View className="today-glance" onClick={onOpenDay}>
			<View className="today-glance-dot" />
			<Text className="today-glance-count">今天记了 {total} 条</Text>
			<Text className="today-glance-breakdown">{breakdown}</Text>
			<Text className="today-glance-link">时间线 ›</Text>
		</View>
	)
}
