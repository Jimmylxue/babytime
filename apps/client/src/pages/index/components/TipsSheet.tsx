import { View, Text, ScrollView } from '@tarojs/components'

interface MonthlyTips {
	ageLabel: string
	tips: { category: string; content: string }[]
}

interface TipsSheetProps {
	monthlyTips: MonthlyTips
	onClose: () => void
}

// 本月关注小贴士底部面板
export default function TipsSheet({ monthlyTips, onClose }: TipsSheetProps) {
	return (
		<View className="sheet-overlay" onClick={onClose}>
			<View
				className="sheet-panel tips-sheet-panel"
				onClick={e => e.stopPropagation()}
			>
				<View className="sheet-handle" />
				<View className="tips-sheet-header">
					<View>
						<Text className="tips-sheet-title">
							{monthlyTips.ageLabel} 本月关注
						</Text>
						<Text className="tips-sheet-desc">
							每个宝宝的成长节奏都不一样
						</Text>
					</View>
					<View className="tips-sheet-count">
						<Text>{monthlyTips.tips.length} 条</Text>
					</View>
				</View>
				<ScrollView className="tips-sheet-list" scrollY>
					{monthlyTips.tips.map((tip, index) => (
						<View key={tip.category} className="tips-sheet-item">
							<Text className="tips-sheet-index">0{index + 1}</Text>
							<View className="tips-sheet-copy">
								<Text className="tips-sheet-category">{tip.category}</Text>
								<Text className="tips-sheet-content">{tip.content}</Text>
							</View>
						</View>
					))}
					<Text className="tips-sheet-disclaimer">
						小贴士仅供日常参考，如有不适或喂养疑问请咨询儿科医生。
					</Text>
				</ScrollView>
			</View>
		</View>
	)
}
