import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import homeIcon from '../../assets/tab/home-source.svg'
import homeActiveIcon from '../../assets/tab/home-active-source.svg'
import './index.scss'

interface TabItem {
	pagePath: string
	text: string
	icon: 'home' | 'stats' | 'profile'
}

const tabs: TabItem[] = [
	{ pagePath: '/pages/index/index', text: '首页', icon: 'home' },
	{ pagePath: '/pages/stats/index', text: '统计', icon: 'stats' },
	{ pagePath: '/pages/mine/index', text: '我的', icon: 'profile' },
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
						<View className={`tab-icon tab-icon-${tab.icon}`}>
							{tab.icon === 'home' && <Image className="tab-icon-image" src={isActive ? homeActiveIcon : homeIcon} />}
							{tab.icon === 'stats' && (
								<View className="stats-bars">
									<View className="stats-bar stats-bar-short" />
									<View className="stats-bar stats-bar-medium" />
									<View className="stats-bar stats-bar-tall" />
								</View>
							)}
							{tab.icon === 'profile' && (
								<>
									<View className="profile-head" />
									<View className="profile-shoulders" />
								</>
							)}
						</View>
						<Text className="tab-text">{tab.text}</Text>
					</View>
				)
			})}
		</View>
	)
}
