import { View, Text, Image, Canvas } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { needLogin } from '../../utils/needLogin'
import {
	fetchWeeklyReportData,
	type WeeklyGrowthValue,
	type WeeklyReportData,
} from '../../utils/weeklyReportData'
import { deliverWeeklyPoster } from '../../utils/chartExport'
import {
	WEEKLY_POSTER_CANVAS_ID,
	WEEKLY_POSTER_H,
	WEEKLY_POSTER_W,
} from '../../utils/weeklyPoster'
import { fetchPosterQrCode } from '../../utils/posterQr'
import { thumbUrl, THUMB_W } from '../../utils/imageThumb'
import { trackEvent } from '../../utils/request'
import calendarHeartIcon from '../../assets/icons/calendar-heart.svg'
import './index.scss'

function dateText(date: string) {
	const [, month, day] = date.split('-')
	return `${Number(month)}月${Number(day)}日`
}

function growthDisplay(growth: WeeklyGrowthValue, unit: string) {
	if (growth.latest == null) {
		return { value: '本周未测量', note: '', empty: true }
	}
	if (growth.first != null && growth.delta != null) {
		return {
			value: `${growth.first} → ${growth.latest} ${unit}`,
			note: `${growth.delta >= 0 ? '+' : ''}${growth.delta} ${unit}`,
			empty: false,
		}
	}
	return { value: `${growth.latest} ${unit}`, note: '本周测量', empty: false }
}

export default function WeeklyReportPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [data, setData] = useState<WeeklyReportData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [sharing, setSharing] = useState(false)
	// 图片预览关闭也会触发 onShow，这次不必重新拉一遍周报
	const previewingRef = useRef(false)

	const load = async (babyId: string) => {
		const baby = useBabyStore.getState().currentBaby
		if (!baby || baby.id !== babyId) {
			setLoading(false)
			return
		}
		setLoading(true)
		setError(false)
		try {
			setData(await fetchWeeklyReportData(baby))
		} catch (err) {
			console.error('获取成长周报失败', err)
			setError(true)
		} finally {
			setLoading(false)
		}
	}

	useDidShow(() => {
		if (previewingRef.current) {
			previewingRef.current = false
			return
		}
		if (!isLoggedIn) {
			setLoading(false)
			return
		}
		fetchBabies().then(() => {
			const baby = useBabyStore.getState().currentBaby
			if (baby) void load(baby.id)
			else setLoading(false)
		})
	})

	const handlePreview = (index: number) => {
		if (!data) return
		previewingRef.current = true
		Taro.previewImage({
			current: data.photos[index]?.url || data.photos[0]?.url,
			urls: data.photos.map(photo => photo.url),
		})
	}

	const handleShare = async () => {
		if (!data || !data.hasData || sharing) return
		setSharing(true)
		try {
			void trackEvent('weekly_report_generate', {
				weekStart: data.weekStart,
				activeDays: data.activeDays,
				photos: data.photoTotal,
				milestones: data.milestones.length,
			})
			const qr = await fetchPosterQrCode('weekly')
			await deliverWeeklyPoster(data, 'share', qr)
		} catch (err) {
			console.error('生成成长周报失败', err)
			Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
		} finally {
			setSharing(false)
		}
	}

	if (loading) {
		return (
			<View className="weekly-page">
				<View className="weekly-state">
					<Text className="weekly-state-title">正在整理上周的成长...</Text>
				</View>
			</View>
		)
	}

	if (!isLoggedIn || error || !data) {
		return (
			<View className="weekly-page">
				<View className="weekly-state">
					<Text className="weekly-state-title">
						{error ? '周报加载失败' : isLoggedIn ? '先添加宝宝档案' : '登录后查看成长周报'}
					</Text>
					<Text className="weekly-state-desc">
						{error ? '请稍后重试' : isLoggedIn ? '有记录之后，周报才有内容' : '记录宝宝上周的成长变化'}
					</Text>
					{!isLoggedIn ? (
						<View className="weekly-state-btn" onClick={() => needLogin()}>
							<Text>去登录</Text>
						</View>
					) : error && currentBaby ? (
						<View className="weekly-state-btn" onClick={() => load(currentBaby.id)}>
							<Text>重试</Text>
						</View>
					) : !error ? (
						<View
							className="weekly-state-btn"
							onClick={() => Taro.navigateTo({ url: '/pages/baby-edit/index' })}
						>
							<Text>去创建</Text>
						</View>
					) : null}
				</View>
			</View>
		)
	}

	const height = growthDisplay(data.height, 'cm')
	const weight = growthDisplay(data.weight, 'kg')
	const tiles = [
		{
			label: '喂奶',
			value: `${data.feeding.count}`,
			unit: '次',
			sub: data.feeding.amount > 0 ? `共 ${Math.round(data.feeding.amount)}ml` : '本周记录',
		},
		{
			label: '睡眠',
			value: `${(data.sleep.totalMinutes / 60).toFixed(1)}`,
			unit: '小时',
			sub: data.sleep.perDayMinutes > 0 ? `日均 ${(data.sleep.perDayMinutes / 60).toFixed(1)}h` : '本周记录',
		},
		{ label: '尿布', value: `${data.diaper.count}`, unit: '次', sub: '换尿布' },
		{ label: '辅食', value: `${data.food.count}`, unit: '次', sub: '本周记录' },
		{ label: '饮水', value: `${Math.round(data.water.amount)}`, unit: 'ml', sub: '本周记录' },
		{ label: '里程碑', value: `${data.milestones.length}`, unit: '个', sub: '新打卡' },
	]

	return (
		<View className="weekly-page">
			<View className="weekly-hero">
				<View className="weekly-hero-top">
					{data.avatarUrl ? (
						<Image
							className="weekly-avatar"
							src={thumbUrl(data.avatarUrl, THUMB_W.chip)}
							mode="aspectFill"
						/>
					) : (
						<View className="weekly-avatar weekly-avatar-fallback">
							<Text>{(data.babyName || '宝').slice(0, 1)}</Text>
						</View>
					)}
					<View className="weekly-hero-meta">
						<Text className="weekly-hero-name">{data.babyName || '宝宝'}</Text>
						<Text className="weekly-hero-age">{data.ageText}</Text>
					</View>
					<View className="weekly-hero-badge">
						<Image className="weekly-hero-badge-icon" src={calendarHeartIcon} />
						<Text className="weekly-hero-badge-text">成长周报</Text>
					</View>
				</View>
				<Text className="weekly-hero-week">{data.weekTitle}</Text>
				<Text className="weekly-hero-desc">
					{data.hasData
						? data.activeDays > 0
							? `记录了 ${data.activeDays} 天，每一份日常都值得被记住`
							: '上周留下了新的成长印记'
						: '上周还没有记录，新的一周从第一条开始吧'}
				</Text>
			</View>

			{data.hasData ? (
				<>
					<View className="weekly-metrics">
						{tiles.map(tile => (
							<View key={tile.label} className="weekly-metric">
								<Text className="weekly-metric-label">{tile.label}</Text>
								<Text className="weekly-metric-value">
									{tile.value}
									<Text className="weekly-metric-unit">{tile.unit}</Text>
								</Text>
								<Text className="weekly-metric-sub">{tile.sub}</Text>
							</View>
						))}
					</View>

					<View className="weekly-card">
						<View className="weekly-card-head">
							<Text className="weekly-card-title">成长变化</Text>
							<Text className="weekly-card-hint">
								{data.height.latest != null || data.weight.latest != null ? '本周测量' : ''}
							</Text>
						</View>
						<View className="weekly-growth-row">
							<Text className="weekly-growth-label">身高</Text>
							<Text className={`weekly-growth-value${height.empty ? ' empty' : ''}`}>
								{height.value}
							</Text>
							<Text className="weekly-growth-note">{height.note}</Text>
						</View>
						<View className="weekly-growth-row">
							<Text className="weekly-growth-label">体重</Text>
							<Text className={`weekly-growth-value${weight.empty ? ' empty' : ''}`}>
								{weight.value}
							</Text>
							<Text className="weekly-growth-note">{weight.note}</Text>
						</View>
					</View>

					<View className="weekly-card">
						<View className="weekly-card-head">
							<Text className="weekly-card-title">新里程碑</Text>
							<Text className="weekly-card-hint">
								{data.milestones.length > 0 ? `${data.milestones.length} 个` : ''}
							</Text>
						</View>
						{data.milestones.length === 0 ? (
							<Text className="weekly-empty-line">上周没有新的里程碑</Text>
						) : (
							data.milestones.map(item => (
								<View key={item.id} className="weekly-milestone">
									<Text className="weekly-milestone-emoji">{item.emoji}</Text>
									<Text className="weekly-milestone-title">{item.title}</Text>
									<Text className="weekly-milestone-date">{dateText(item.date)}</Text>
								</View>
							))
						)}
					</View>

					<View className="weekly-card">
						<View className="weekly-card-head">
							<Text className="weekly-card-title">本周瞬间</Text>
							<Text className="weekly-card-hint">
								{data.photoTotal > 0
									? data.photoTotal > data.photos.length
										? `精选 ${data.photos.length} 张 / 共 ${data.photoTotal} 张`
										: `${data.photoTotal} 张`
									: ''}
							</Text>
						</View>
						{data.photos.length === 0 ? (
							<Text className="weekly-empty-line">上周没有新照片</Text>
						) : (
							<View className="weekly-photos">
								{data.photos.map((photo, index) => (
									<Image
										key={photo.url}
										className="weekly-photo"
										src={thumbUrl(photo.thumbnail || photo.url, THUMB_W.grid)}
										mode="aspectFill"
										onClick={() => handlePreview(index)}
									/>
								))}
							</View>
						)}
					</View>

					<View className="weekly-review">
						<Text className="weekly-review-text">{data.reviewText}</Text>
					</View>

					<View className="weekly-share-bar">
						<View
							className={`weekly-share-btn${sharing ? ' busy' : ''}`}
							onClick={handleShare}
						>
							<Text>{sharing ? '生成中...' : '分享成长周报'}</Text>
						</View>
					</View>
				</>
			) : (
				<View className="weekly-empty">
					<Text className="weekly-empty-title">上周还没有记录</Text>
					<Text className="weekly-empty-desc">
						记录宝宝的吃奶、睡眠和成长，下周就能看到一张完整的周报
					</Text>
					<View
						className="weekly-empty-btn"
						onClick={() => {
							Taro.navigateTo({
								url: `/pages/record/index?babyId=${currentBaby?.id || ''}`,
							})
						}}
					>
						<Text>去记一笔</Text>
					</View>
				</View>
			)}

			<View
				className="weekly-poster-wrap"
				style={{ width: `${WEEKLY_POSTER_W}px`, height: `${WEEKLY_POSTER_H}px` }}
			>
				<Canvas
					type="2d"
					id={WEEKLY_POSTER_CANVAS_ID}
					style={{ width: `${WEEKLY_POSTER_W}px`, height: `${WEEKLY_POSTER_H}px` }}
				/>
			</View>
		</View>
	)
}
