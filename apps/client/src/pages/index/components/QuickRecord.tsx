import { View, Text } from '@tarojs/components'
import { useState } from 'react'

const quickActions = [
	{ type: 'feeding', icon: '🍼', label: '喂奶' },
	{ type: 'diaper', icon: '💩', label: '尿布' },
	{ type: 'sleep', icon: '😴', label: '睡觉' },
	{ type: 'food', icon: '🍚', label: '辅食' },
	{ type: 'vaccine', icon: '💉', label: '疫苗' },
	{ type: 'temperature', icon: '🌡️', label: '体温' },
	{ type: 'photo', icon: '📷', label: '时光' },
	{ type: 'height_weight', metric: 'weight', icon: '⚖️', label: '体重' },
	{ type: 'height_weight', metric: 'height', icon: '📏', label: '身高' },
]

const moreActions = [
	{ type: 'water', icon: '💧', label: '喝水' },
	{ type: 'bath', icon: '🛁', label: '洗澡' },
	{ type: 'medicine', icon: '💊', label: '用药' },
	{ type: 'outdoor', icon: '🌳', label: '户外活动' },
]

interface QuickRecordProps {
	isLoggedIn: boolean
	hasBaby: boolean
	feedingElapsed: string
	sleepElapsed: string
	onNavigate: (type: string, metric?: string) => void
}

// 快速记录宫格 + 「更多记录」底部弹窗
export default function QuickRecord({
	isLoggedIn,
	hasBaby,
	feedingElapsed,
	sleepElapsed,
	onNavigate,
}: QuickRecordProps) {
	const [showMore, setShowMore] = useState(false)

	return (
		<View className="quick-section">
			<View className="section-head">
				<View className="section-accent" />
				<Text className="section-label">快速记录</Text>
			</View>
			{/* 喂养/睡眠状态提示：标题下方、宫格卡片外 */}
			{isLoggedIn && hasBaby && (feedingElapsed || sleepElapsed) && (
				<View className="return-cue-row return-cue-row-outer">
					{feedingElapsed && (
						<Text className="return-cue">距上次喂奶 {feedingElapsed}</Text>
					)}
					{sleepElapsed && <Text className="return-cue">{sleepElapsed}</Text>}
				</View>
			)}
			<View className="quick-card">
				<View className="action-grid">
					{quickActions.map(action => (
						<View
							key={action.type}
							className="action-item"
							onClick={() =>
								onNavigate(
									action.type,
									'metric' in action
										? (action as { metric?: string }).metric
										: undefined,
								)
							}
						>
							<View className={`action-icon ${action.type}`}>
								<Text>{action.icon}</Text>
							</View>
							<Text className="action-text">{action.label}</Text>
						</View>
					))}
					<View className="action-item" onClick={() => setShowMore(true)}>
						<View className="action-icon more">
							<Text>···</Text>
						</View>
						<Text className="action-text">更多</Text>
					</View>
				</View>
			</View>

			{/* 更多记录 - 底部弹窗 */}
			{showMore && (
				<View className="sheet-overlay" onClick={() => setShowMore(false)}>
					<View className="sheet-panel" onClick={e => e.stopPropagation()}>
						<View className="sheet-handle" />
						<View className="sheet-header">
							<Text className="sheet-title">📝 更多记录</Text>
						</View>
						<View className="sheet-body">
							<View className="sheet-grid">
								{moreActions.map(action => (
									<View
										key={action.type}
										className="sheet-item"
										onClick={() => {
											setShowMore(false)
											onNavigate(action.type)
										}}
									>
										<View className="sheet-item-icon">
											<Text>{action.icon}</Text>
										</View>
										<Text className="sheet-item-label">{action.label}</Text>
									</View>
								))}
							</View>
						</View>
					</View>
				</View>
			)}
		</View>
	)
}
