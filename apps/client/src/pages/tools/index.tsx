import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useBabyStore } from '../../stores/babyStore'
import { calculateAge } from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { trackEvent } from '../../utils/request'
import TabBar from '../../components/TabBar'
import TipsSheet from '../index/components/TipsSheet'
import './index.scss'

interface ToolItem {
	key: string
	icon: string
	title: string
	tint: string
	badge?: string
	path?: string
}

const tools: ToolItem[] = [
	{
		key: 'age_calc',
		icon: '🎂',
		title: '月龄计算器',
		tint: 'pink',
		path: '/pages/tool/age-calc/index',
	},
	{
		key: 'vaccine_table',
		icon: '💉',
		title: '疫苗时间表',
		tint: 'blue',
		path: '/pages/tool/vaccine-table/index',
	},
	{
		key: 'milk_calc',
		icon: '🍼',
		title: '奶量估算器',
		tint: 'cream',
		path: '/pages/tool/milk-calc/index',
	},
	{
		key: 'milestone',
		icon: '🌟',
		title: '成长里程碑',
		tint: 'lilac',
		path: '/pages/milestones/index',
	},
]

const monthlyTipsTool: ToolItem = {
	key: 'monthly_tips',
	icon: '🌱',
	title: '本月关注',
	tint: 'sand',
}

export default function ToolsPage() {
	const { currentBaby } = useBabyStore()
	const [showTips, setShowTips] = useState(false)
	const monthlyTips = currentBaby
		? getMonthlyTips(calculateAge(currentBaby.birthday).months)
		: null
	const toolItems = monthlyTips ? [monthlyTipsTool, ...tools] : tools

	useDidShow(() => {
		trackEvent('tools_hub_view')
	})

	const handleTap = (tool: ToolItem) => {
		trackEvent('tool_click', { name: tool.key })
		if (tool.key === 'monthly_tips') {
			setShowTips(true)
			return
		}
		if (tool.path) {
			Taro.navigateTo({ url: tool.path })
		}
	}

	return (
		<View className="tools-page">
			<View className="tools-grid">
				{toolItems.map((tool, index) => (
					<View
						key={tool.key}
						className="tool-cell"
						onClick={() => handleTap(tool)}
						style={{ animationDelay: `${0.05 * index}s` }}
					>
						<View className="tool-icon-wrap">
							<View className={`tool-icon tint-${tool.tint}`}>
								<Text className="tool-icon-emoji">{tool.icon}</Text>
							</View>
							{tool.badge && (
								<View className="tool-badge">
									<Text>{tool.badge}</Text>
								</View>
							)}
						</View>
						<Text className="tool-title">{tool.title}</Text>
					</View>
				))}
			</View>
			<Text className="tools-footer">小应用仅供参考，不能替代医生的专业建议</Text>
			{showTips && monthlyTips && (
				<TipsSheet monthlyTips={monthlyTips} onClose={() => setShowTips(false)} />
			)}
			<TabBar />
		</View>
	)
}
