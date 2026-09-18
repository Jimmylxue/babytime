import { View, Image } from '@tarojs/components'
import shareIcon from '../../../assets/icons/share.svg'
import downloadIcon from '../../../assets/icons/download.svg'

interface ChartActionsProps {
	onShare: () => void
	onSave: () => void
}

// 图表卡片右上角的分享/保存按钮组
export default function ChartActions({ onShare, onSave }: ChartActionsProps) {
	return (
		<View className="chart-actions">
			<View className="chart-action-btn" onClick={onShare}>
				<Image className="chart-action-icon" src={shareIcon} />
			</View>
			<View className="chart-action-btn" onClick={onSave}>
				<Image className="chart-action-icon" src={downloadIcon} />
			</View>
		</View>
	)
}
