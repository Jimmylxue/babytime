import { View, Text, Image } from '@tarojs/components'
import { useState } from 'react'
import soundWaveIcon from '../../../assets/ui-icons/sound-wave.svg'
import iconFeeding from '../../../assets/ui-icons/grid/icon-feeding.svg'
import iconDiaper from '../../../assets/ui-icons/grid/icon-diaper.svg'
import iconSleep from '../../../assets/ui-icons/grid/icon-sleep.svg'
import iconFood from '../../../assets/ui-icons/grid/icon-food.svg'
import iconVaccine from '../../../assets/ui-icons/grid/icon-vaccine.svg'
import iconTemperature from '../../../assets/ui-icons/grid/icon-temperature.svg'
import iconPhoto from '../../../assets/ui-icons/grid/icon-photo.svg'
import iconWeight from '../../../assets/ui-icons/grid/icon-weight.svg'
import iconHeight from '../../../assets/ui-icons/grid/icon-height.svg'
import iconMore from '../../../assets/ui-icons/grid/icon-more.svg'
import iconWater from '../../../assets/ui-icons/grid/icon-water.svg'
import iconBath from '../../../assets/ui-icons/grid/icon-bath.svg'
import iconMedicine from '../../../assets/ui-icons/grid/icon-medicine.svg'
import iconOutdoor from '../../../assets/ui-icons/grid/icon-outdoor.svg'
import noteEditDarkIcon from '../../../assets/icons/note-edit-dark.svg'

interface QuickAction {
	type: string
	metric?: string
	icon: string
	label: string
}

const quickActions: QuickAction[] = [
	{ type: 'feeding', icon: iconFeeding, label: '喂奶' },
	{ type: 'diaper', icon: iconDiaper, label: '尿布' },
	{ type: 'sleep', icon: iconSleep, label: '睡觉' },
	{ type: 'food', icon: iconFood, label: '辅食' },
	{ type: 'vaccine', icon: iconVaccine, label: '疫苗' },
	{ type: 'temperature', icon: iconTemperature, label: '体温' },
	{ type: 'photo', icon: iconPhoto, label: '时光' },
	{ type: 'height_weight', metric: 'weight', icon: iconWeight, label: '体重' },
	{ type: 'height_weight', metric: 'height', icon: iconHeight, label: '身高' },
]

const moreActions = [
	{ type: 'water', icon: iconWater, label: '喝水' },
	{ type: 'bath', icon: iconBath, label: '洗澡' },
	{ type: 'medicine', icon: iconMedicine, label: '用药' },
	{ type: 'outdoor', icon: iconOutdoor, label: '户外活动' },
]

interface QuickRecordProps {
	onNavigate: (type: string, metric?: string) => void
}

// 快速记录宫格 + 「更多记录」底部弹窗
export default function QuickRecord({ onNavigate }: QuickRecordProps) {
	const [showMore, setShowMore] = useState(false)

	// 弹层要与 .quick-section 平级：该区块的 fadeUp 动画结束仍保留 translateY(0) 的
	// transform，会让它成为 fixed 后代的包含块，弹层被压在卡片盒子内（跑到页面中部且下方无蒙层）
	return (
		<>
			<View className="quick-section">
				<View className="section-head">
					<View className="section-accent" />
					<Text className="section-label">快速记录</Text>
					<View className="section-side">
						<Image className="section-side-icon" src={soundWaveIcon} />
						<Text className="section-side-text">轻点一下，记录宝宝的日常</Text>
					</View>
				</View>
				<View className="quick-card">
					<View className="action-grid">
						{quickActions.map(action => (
							<View
								key={`${action.type}-${action.metric || ''}`}
								className="action-item"
								onClick={() => onNavigate(action.type, action.metric)}
							>
								<View className={`action-icon ${action.type}`}>
									<Image className="action-icon-img" src={action.icon} />
								</View>
								<Text className="action-text">{action.label}</Text>
							</View>
						))}
						<View className="action-item" onClick={() => setShowMore(true)}>
							<View className="action-icon more">
								<Image className="action-icon-img" src={iconMore} />
							</View>
							<Text className="action-text">更多</Text>
						</View>
					</View>
				</View>
			</View>

			{/* 更多记录 - 底部弹窗 */}
			{showMore && (
				<View className="sheet-overlay" onClick={() => setShowMore(false)}>
					<View className="sheet-panel" onClick={e => e.stopPropagation()}>
						<View className="sheet-handle" />
						<View className="sheet-header">
							<Image className="sheet-title-icon" src={noteEditDarkIcon} />
							<Text className="sheet-title">更多记录</Text>
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
											<Image className="sheet-item-icon-img" src={action.icon} />
										</View>
										<Text className="sheet-item-label">{action.label}</Text>
									</View>
								))}
							</View>
						</View>
					</View>
				</View>
			)}
		</>
	)
}
