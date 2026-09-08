import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import homeIcon from '../../assets/tab/home-source.svg'
import homeActiveIcon from '../../assets/tab/home-active-source.svg'
import toolsIcon from '../../assets/tab/tools-source.svg'
import toolsActiveIcon from '../../assets/tab/tools-active-source.svg'
import './index.scss'

interface TabItem {
	pagePath: string
	text: string
	icon: 'home' | 'stats' | 'tools' | 'profile'
}

const tabs: TabItem[] = [
	{ pagePath: '/pages/index/index', text: '首页', icon: 'home' },
	{ pagePath: '/pages/stats/index', text: '统计', icon: 'stats' },
	{ pagePath: '/pages/tools/index', text: '发现', icon: 'tools' },
	{ pagePath: '/pages/mine/index', text: '我的', icon: 'profile' },
]

function resolveCurrentPath() {
	return Taro.getCurrentInstance().page?.route || ''
}

export default function TabBar() {
	// switchTab 后新页面首次渲染时 getCurrentInstance().page 可能还是上一个页面，
	// 页面 onShow 后重取一次才能保证高亮的 tab 正确
	const [currentPath, setCurrentPath] = useState(resolveCurrentPath)
	useDidShow(() => {
		setCurrentPath(resolveCurrentPath())
	})

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
							{tab.icon === 'home' && (
								<Image
									className="tab-icon-image"
									src={isActive ? homeActiveIcon : homeIcon}
								/>
							)}
							{tab.icon === 'tools' && (
								<Image
									className="tab-icon-image"
									src={isActive ? toolsActiveIcon : toolsIcon}
								/>
							)}
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
