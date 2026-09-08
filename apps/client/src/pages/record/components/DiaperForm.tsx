import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { chooseAndUploadImage } from '../../../utils/upload'
import dropletBlueIcon from '../../../assets/icons/droplet-blue.svg'
import pooBrownIcon from '../../../assets/icons/poo-brown.svg'
import diaperBothIcon from '../../../assets/icons/diaper-both.svg'
import infoGrayIcon from '../../../assets/icons/info-gray.svg'
import cameraDarkIcon from '../../../assets/icons/camera-dark.svg'
import photoPinkIcon from '../../../assets/icons/photo-pink.svg'
import type { RecordFormHandle, RecordFormProps } from './types'

const diaperStatuses = [
	{ value: 'wet', label: '尿了', sub: '只有尿液', icon: dropletBlueIcon },
	{ value: 'dirty', label: '拉了', sub: '有便便', icon: pooBrownIcon },
	{ value: 'both', label: '都有', sub: '尿液 + 便便', icon: diaperBothIcon },
]

// 「上次记录」提示条摘要（尿布）
export function buildLastHint(last: any): string {
	const statusLabel: Record<string, string> = {
		wet: '尿了',
		dirty: '拉了',
		both: '都有',
	}
	return statusLabel[last.diaperStatus] || ''
}

const DiaperForm = forwardRef<RecordFormHandle, RecordFormProps>(
	function DiaperForm({ initialRecord, lastRecord }, ref) {
		const [diaperStatus, setDiaperStatus] = useState('wet')
		const [diaperImage, setDiaperImage] = useState('')

		// 新增态「按上次来」预填
		useEffect(() => {
			if (!lastRecord?.diaperStatus) return
			setDiaperStatus(lastRecord.diaperStatus)
		}, [lastRecord])

		// 编辑态回填
		useEffect(() => {
			if (!initialRecord) return
			if (initialRecord.diaperStatus) setDiaperStatus(initialRecord.diaperStatus)
			if (initialRecord.diaperImage) setDiaperImage(initialRecord.diaperImage)
			// AI 识别已独立到工具页；旧记录的 diaperAnalysis 不回填也不上传，
			// 后端 update 是部分合并（Object.assign），编辑保存不会清掉旧记录里的这个字段
		}, [initialRecord])

		useImperativeHandle(ref, () => ({
			validate: () => null,
			buildPayload: () => {
				const data: Record<string, any> = { diaperStatus }
				if (diaperImage) data.diaperImage = diaperImage
				return data
			},
		}))

		return (
			<>
				{/* 尿布：状态卡（按 UI 稿分卡） */}
				<View className="record-card">
					<View className="record-card-label-row">
						<Text className="record-card-label">便便状态</Text>
						<Image className="record-card-info" src={infoGrayIcon} />
					</View>
					<View className="diaper-grid">
						{diaperStatuses.map(s => (
							<View
								key={s.value}
								className={`diaper-option ${diaperStatus === s.value ? 'active' : ''}`}
								onClick={() => setDiaperStatus(s.value)}
							>
								{diaperStatus === s.value && (
									<View className="diaper-check">
										<Text className="diaper-check-mark">✓</Text>
									</View>
								)}
								<Image
									className="diaper-option-icon"
									src={s.icon}
									mode="aspectFit"
								/>
								<Text className="diaper-option-label">{s.label}</Text>
								<Text className="diaper-option-sub">{s.sub}</Text>
							</View>
						))}
					</View>
				</View>

				<View className="record-card">
					<View className="record-card-label-row">
						<Text className="record-card-label">照片 (可选)</Text>
					</View>
					<View className="diaper-photo-row">
						{diaperImage ? (
							<View className="image-preview">
								<Image
									className="image-preview-img"
									src={diaperImage}
									mode="aspectFill"
									onClick={() =>
										Taro.previewImage({
											current: diaperImage,
											urls: [diaperImage],
										})
									}
								/>
								<View
									className="image-remove-badge"
									onClick={() => setDiaperImage('')}
								>
									<Text>×</Text>
								</View>
							</View>
						) : (
							<View
								className="diaper-upload"
								onClick={async () => {
									const url = await chooseAndUploadImage()
									if (url) setDiaperImage(url)
								}}
							>
								<Image
									className="diaper-upload-camera"
									src={cameraDarkIcon}
									mode="aspectFit"
								/>
								<Text className="diaper-upload-text">上传照片</Text>
							</View>
						)}
					</View>
					{!diaperImage && (
						<View className="diaper-photo-hint">
							<Image
								className="diaper-photo-hint-icon"
								src={photoPinkIcon}
							/>
							<Text className="diaper-photo-hint-text">
								拍一张，轻松记录尿布状态~
							</Text>
						</View>
					)}
				</View>
			</>
		)
	},
)

export default DiaperForm
