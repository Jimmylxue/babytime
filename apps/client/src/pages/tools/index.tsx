import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useBabyStore } from '../../stores/babyStore'
import { calculateAge } from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { trackEvent } from '../../utils/request'
import { getSystemConfig } from '../../utils/systemConfig'
import TabBar from '../../components/TabBar'
import TipsSheet from '../index/components/TipsSheet'
// 发现页图标全部改为自绘 SVG（24×24 / 线宽 1.7 / 圆角端点），
// 与记录页 grid 图标同一套视觉语言；emoji 在不同机型渲染差异太大。
import toolAgeIcon from '../../assets/tool-icons/tool-age.svg'
import toolVaccineTableIcon from '../../assets/tool-icons/tool-vaccine-table.svg'
import toolCatchupIcon from '../../assets/tool-icons/tool-catchup.svg'
import toolMilkIcon from '../../assets/tool-icons/tool-milk.svg'
import toolMilestoneIcon from '../../assets/tool-icons/tool-milestone.svg'
import toolCheckupIcon from '../../assets/tool-icons/tool-checkup.svg'
import toolHealthIcon from '../../assets/tool-icons/tool-health.svg'
import toolWalletIcon from '../../assets/tool-icons/tool-wallet.svg'
import toolTipsIcon from '../../assets/tool-icons/tool-tips.svg'
import toolCommunityIcon from '../../assets/tool-icons/tool-community.svg'
import './index.scss'

interface ToolItem {
	key: string
	/** SVG 图标（必需）—— 发现页不再使用 emoji */
	iconSrc: string
	title: string
	tint: string
	badge?: string
	path?: string
}

const tools: ToolItem[] = [
	{
		key: 'age_calc',
		iconSrc: toolAgeIcon,
		title: '月龄计算器',
		tint: 'pink',
		path: '/pages/tool/age-calc/index',
	},
	{
		key: 'vaccine_table',
		iconSrc: toolVaccineTableIcon,
		title: '疫苗时间表',
		tint: 'blue',
		path: '/pages/tool/vaccine-table/index',
	},
	{
		key: 'vaccine_catchup',
		iconSrc: toolCatchupIcon,
		title: '补种提醒',
		tint: 'sand',
		path: '/pages/tool/vaccine-catchup/index',
	},
	{
		key: 'milk_calc',
		iconSrc: toolMilkIcon,
		title: '奶量估算器',
		tint: 'cream',
		path: '/pages/tool/milk-calc/index',
	},
	{
		key: 'milestone',
		iconSrc: toolMilestoneIcon,
		title: '成长里程碑',
		tint: 'lilac',
		path: '/pages/milestones/index',
	},
	{
		key: 'checkup',
		iconSrc: toolCheckupIcon,
		title: '儿保体检',
		tint: 'blue',
		path: '/pages/tool/checkup/index',
	},
	{
		key: 'health',
		iconSrc: toolHealthIcon,
		title: '健康分析',
		tint: 'rose',
		path: '/pages/tool/health/index',
	},
	{
		key: 'expense',
		iconSrc: toolWalletIcon,
		title: '养娃账本',
		tint: 'pink',
		path: '/pages/expense/index',
	},
]

const monthlyTipsTool: ToolItem = {
	key: 'monthly_tips',
	iconSrc: toolTipsIcon,
	title: '本月关注',
	tint: 'sand',
}

const communityTool: ToolItem = {
	key: 'community',
	iconSrc: toolCommunityIcon,
	title: '育娃圈',
	tint: 'rose',
	path: '/pages/community/index',
}

export default function ToolsPage() {
	const { currentBaby } = useBabyStore()
	const [showTips, setShowTips] = useState(false)
	const [communityEnabled, setCommunityEnabled] = useState(false)
	const [expenseEnabled, setExpenseEnabled] = useState(false)
	const monthlyTips = currentBaby
		? getMonthlyTips(calculateAge(currentBaby.birthday).months)
		: null
	const contextTools = monthlyTips ? [monthlyTipsTool, ...tools] : tools
	// 养娃账本被后台开关关掉时，从宫格里摘掉（与育娃圈同一套门控）
	const gatedTools = expenseEnabled
		? contextTools
		: contextTools.filter(tool => tool.key !== 'expense')
	const toolItems = communityEnabled
		? [communityTool, ...gatedTools]
		: gatedTools

	useDidShow(() => {
		trackEvent('tools_hub_view')
		getSystemConfig().then(config => {
			setCommunityEnabled(config.communityEnabled)
			setExpenseEnabled(config.expenseEnabled)
		})
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
								<Image
									className="tool-icon-image"
									src={tool.iconSrc}
									mode="aspectFit"
								/>
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
