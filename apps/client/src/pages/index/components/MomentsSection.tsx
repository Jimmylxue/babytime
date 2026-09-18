import { View, Text, Image, ScrollView } from '@tarojs/components'

interface RecentPhoto {
	id: string
	url: string
	thumbnail?: string
}

interface MomentsSectionProps {
	babyName: string
	photos: RecentPhoto[]
	/** 首屏照片是否已拉取过（区分「加载中」与「真的没有照片」） */
	ready: boolean
	onPreview: (photo: RecentPhoto) => void
	onOpenAlbum: () => void
	onTakePhoto: () => void
}

// 最近的瞬间：横排最新 9 张照片 + 相册入口
export default function MomentsSection({
	babyName,
	photos,
	ready,
	onPreview,
	onOpenAlbum,
	onTakePhoto,
}: MomentsSectionProps) {
	return (
		<View className="moments-section">
			<View className="section-head">
				<View className="section-accent" />
				<Text className="section-label">最近的瞬间</Text>
				{photos.length > 0 && (
					<View className="moments-album-entry" onClick={onOpenAlbum}>
						<Text className="moments-album-entry-text">全部瞬间 ›</Text>
					</View>
				)}
			</View>
			{photos.length > 0 ? (
				<ScrollView
					className="moments-scroll"
					scrollX
					enhanced
					showScrollbar={false}
				>
					<View className="moments-row">
						{photos.map(photo => (
							<Image
								key={photo.id}
								className="moments-photo"
								src={photo.thumbnail || photo.url}
								mode="aspectFill"
								onClick={() => onPreview(photo)}
							/>
						))}
						<View className="moments-tail" onClick={onOpenAlbum}>
							<Text className="moments-tail-icon">📸</Text>
							<Text className="moments-tail-text">查看相册</Text>
						</View>
					</View>
				</ScrollView>
			) : !ready ? (
				<View className="moments-skeleton">
					<View className="moments-photo sk-photo" />
					<View className="moments-photo sk-photo" />
					<View className="moments-photo sk-photo" />
				</View>
			) : (
				<View className="moments-empty" onClick={onTakePhoto}>
					<Text className="moments-empty-icon">📷</Text>
					<Text className="moments-empty-text">
						给 {babyName} 拍张照片吧，它会出现在这里
					</Text>
				</View>
			)}
		</View>
	)
}

export type { RecentPhoto }
