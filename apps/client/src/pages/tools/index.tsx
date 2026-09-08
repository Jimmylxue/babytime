import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { trackEvent } from '../../utils/request'
import TabBar from '../../components/TabBar'
import './index.scss'

interface ToolItem {
	key: string
	icon: string
	title: string
	tint: string
	badge?: string
	path?: string
}

// 便便识别是独立工具页（自带登录/建档门禁），其余工具均为纯前端页面
// 宫格一行四个，新应用直接往数组里追加，满四个自动换行
const tools: ToolItem[] = [
	{
		key: 'stool_ai',
		icon: '💩',
		title: 'AI 识别便便',
		tint: 'sand',
		badge: 'AI',
		path: '/pages/tool/stool-ai/index',
	},
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
]

export default function ToolsPage() {
	useDidShow(() => {
		trackEvent('tools_hub_view')
	})

	const handleTap = (tool: ToolItem) => {
		trackEvent('tool_click', { name: tool.key })
		if (tool.path) {
			Taro.navigateTo({ url: tool.path })
		}
	}

	return (
		<View className="tools-page">
			<View className="tools-grid">
				{tools.map((tool, index) => (
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
			<TabBar />
		</View>
	)
}
