import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface TabItem {
	pagePath: string
	text: string
	icon: string
}

const tabs: TabItem[] = [
	{ pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
	{ pagePath: '/pages/stats/index', text: '统计', icon: '📊' },
	{ pagePath: '/pages/mine/index', text: '我的', icon: '👤' },
]

export default function TabBar() {
	const currentPath = Taro.getCurrentInstance().page?.route || ''

	const handleSwitchTab = (pagePath: string) => {
		Taro.switchTab({ url: pagePath })
	}

	return (
		<View className="tab-bar">
			{tabs.map(tab => {
				const isActive = currentPath === tab.pagePath.replace(/^\//, '')
				return (
					<View
						key={tab.pagePath}
						className={`tab-item ${isActive ? 'active' : ''}`}
						onClick={() => handleSwitchTab(tab.pagePath)}
					>
						<Text className="tab-icon">{tab.icon}</Text>
						<Text className="tab-text">{tab.text}</Text>
					</View>
				)
			})}
		</View>
	)
}
