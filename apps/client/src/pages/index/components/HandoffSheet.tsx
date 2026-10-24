import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { HandoffRow } from '../handoffData'

interface HandoffSheetProps {
	rows: HandoffRow[]
	text: string
	onClose: () => void
}

// 交接班面板：老人/月嫂接手时一眼看完当前状态，可复制文案或直接转发家人
export default function HandoffSheet({ rows, text, onClose }: HandoffSheetProps) {
	const handleCopy = () => {
		Taro.setClipboardData({
			data: text,
			success: () => {
				Taro.showToast({ title: '已复制', icon: 'success' })
			},
		})
	}

	return (
		<View className="sheet-overlay" onClick={onClose}>
			<View
				className="sheet-panel handoff-panel"
				onClick={e => e.stopPropagation()}
			>
				<View className="sheet-handle" />
				<View className="handoff-head">
					<Text className="handoff-title">交接给家人</Text>
					<Text className="handoff-desc">
						把这些信息发给接手的家人，照着记录接着带
					</Text>
				</View>
				<ScrollView className="handoff-list" scrollY>
					{rows.map(row => (
						<View className="handoff-row" key={row.label}>
							<Text className="handoff-row-label">{row.label}</Text>
							<Text className="handoff-row-value">{row.value}</Text>
						</View>
					))}
					<Text className="handoff-note">
						信息来自当前记录，交接前记得先补记刚发生的事
					</Text>
				</ScrollView>
				<View className="handoff-actions">
					<View className="handoff-btn ghost" onClick={handleCopy}>
						<Text className="handoff-btn-text ghost">复制文案</Text>
					</View>
					<Button className="handoff-btn primary" openType="share">
						<Text className="handoff-btn-text primary">转发给家人</Text>
					</Button>
				</View>
			</View>
		</View>
	)
}
