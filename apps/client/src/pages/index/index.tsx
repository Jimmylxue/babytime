import { Canvas, View, Text, Image } from '@tarojs/components'
import Taro, {
	useDidShow,
	useShareAppMessage,
	useShareTimeline,
} from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore } from '../../stores/recordStore'
import { calculateAge, formatHM } from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { takePhotoAndSave } from '../../utils/upload'
import { needLogin } from '../../utils/needLogin'
import { announcementApi, photoApi, trackEvent } from '../../utils/request'
import { MOCK_BABY, MOCK_STATS } from '../../utils/mock'
import {
	hasAutoRedirectedToOnboarding,
	markAutoRedirectedToOnboarding,
} from '../../utils/onboarding'
import reportPlusIcon from '../../assets/icons/report-plus.svg'
import sparklePinkIcon from '../../assets/icons/sparkle-pink.svg'
import { deliverDailyPoster } from '../../utils/chartExport'
import { fetchPosterQrCode } from '../../utils/posterQr'
import TabBar from '../../components/TabBar'
import BabyCard from './components/BabyCard'
import VaccineReminderCard from './components/VaccineReminderCard'
import QuickRecord from './components/QuickRecord'
import MomentsSection, { RecentPhoto } from './components/MomentsSection'
import TipsSheet from './components/TipsSheet'
import { buildDailyPosterData } from './dailyReportData'
import './index.scss'

export default function Index() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const {
		summary,
		fetchSummary,
		fetchStats,
		latestHeightWeight,
		latestTemperature,
	} = useRecordStore()
	const [showTips, setShowTips] = useState(false)
	const [showAddGuide, setShowAddGuide] = useState(false)
	const [now, setNow] = useState(() => Date.now())
	// 疫苗卡与「本月关注」面板开关随页面展示刷新（原逻辑在 useDidShow 直接请求）
	const [vaccineRefreshKey, setVaccineRefreshKey] = useState(0)
	// 首屏宝宝数据是否已回来。冷启动时 currentBaby 必然为 null，
	// 必须靠这个标志区分「还在加载」和「真的没有宝宝档案」，
	// 否则每次打开都会先闪一下「还没有宝宝信息」的空状态。
	const [babyReady, setBabyReady] = useState(false)
	const [statusBarHeight] = useState(
		() => Taro.getSystemInfoSync().statusBarHeight || 20,
	)
	// 胶囊相对状态栏的偏移、高度、与屏幕右缘的距离（pt），用于顶栏按钮与胶囊对齐避让
	const [capsuleBand] = useState(() => {
		let topOffset = 4
		let height = 32
		let rightGap = 102
		try {
			const menu = Taro.getMenuButtonBoundingClientRect()
			if (menu && menu.height) {
				const statusBar = Taro.getSystemInfoSync().statusBarHeight || 20
				topOffset = Math.max(0, menu.top - statusBar)
				height = menu.height
				rightGap = Math.max(90, Taro.getSystemInfoSync().windowWidth - menu.left)
			}
		} catch (error) {
			// 取不到胶囊信息时用默认值
		}
		return { topOffset, height, rightGap }
	})
	const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([])
	// 首屏照片是否已拉取过。recentPhotos 初始为空数组，
	// 不区分「还在加载」就会先闪一下「还没有照片」的拍照引导。
	const [photosReady, setPhotosReady] = useState(false)
	const announcementCheckingRef = useRef(false)
	const notificationTrackedRef = useRef(false)
	const momentsPreviewRef = useRef(false)

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60 * 1000)
		return () => clearInterval(timer)
	}, [])

	const showAnnouncementIfNeeded = async () => {
		if (announcementCheckingRef.current) return
		announcementCheckingRef.current = true
		try {
			const res = await announcementApi.getCurrent()
			const announcement = res.data
			if (!announcement) return

			const storageKey = `announcement:seen:${announcement.id}`
			if (Taro.getStorageSync(storageKey)) return

			await Taro.showModal({
				title: announcement.title,
				content: announcement.content,
				showCancel: false,
				confirmText: '知道了',
			})
			Taro.setStorageSync(storageKey, true)
		} catch (error) {
			// 公告加载失败不干扰首页的正常使用。
			console.warn('获取公告失败', error)
		} finally {
			announcementCheckingRef.current = false
		}
	}

	useShareAppMessage(() => ({
		title: '育娃手记｜宝宝吃睡记录与成长统计',
		path: '/pages/index/index',
	}))

	useShareTimeline(() => ({
		title: '育娃手记｜宝宝吃睡记录与成长统计',
		query: '',
	}))

	// 累计记满 3 条时，引导一次「添加到我的小程序」（storage 标记，只弹一次）
	const maybeShowAddGuide = () => {
		if (Taro.getStorageSync('guide:addToMyMp:done')) return
		const cumulative = Taro.getStorageSync('stats:cumulativeRecords') || 0
		if (cumulative >= 3) {
			setShowAddGuide(true)
		}
	}

	const dismissAddGuide = () => {
		Taro.setStorageSync('guide:addToMyMp:done', true)
		setShowAddGuide(false)
	}

	const fetchRecentPhotos = (babyId: string) => {
		photoApi
			.getTimeline(babyId, 1, 9)
			.then(res => {
				const items = (res.data?.items || []) as { photos: RecentPhoto[] }[]
				setRecentPhotos(items.flatMap(item => item.photos).slice(0, 9))
			})
			.catch(() => {})
			.then(() => setPhotosReady(true))
	}

	const handleMomentsPreview = (photo: RecentPhoto) => {
		// previewImage 关闭会触发页面 onShow，打标记避免整页刷新
		momentsPreviewRef.current = true
		Taro.previewImage({
			current: photo.url,
			urls: recentPhotos.map(p => p.url),
			fail: () => {
				momentsPreviewRef.current = false
			},
		})
	}

	useDidShow(() => {
		// 关闭大图预览触发的 onShow，不做整页刷新
		if (momentsPreviewRef.current) {
			momentsPreviewRef.current = false
			return
		}
		if (isLoggedIn) void trackEvent('app_open')
		const source = Taro.getCurrentInstance().router?.params?.source
		if (
			isLoggedIn &&
			!notificationTrackedRef.current &&
			source?.startsWith('notification_')
		) {
			notificationTrackedRef.current = true
			void trackEvent('notification_open', { source })
		}
		showAnnouncementIfNeeded()
		if (isLoggedIn) {
			setVaccineRefreshKey(key => key + 1)
			fetchBabies().then(() => {
				setBabyReady(true)
				const baby = useBabyStore.getState().currentBaby
				if (baby) {
					fetchSummary(baby.id)
					fetchStats(baby.id)
					fetchRecentPhotos(baby.id)
					maybeShowAddGuide()
				} else if (!hasAutoRedirectedToOnboarding()) {
					// 已登录但没有宝宝档案，进引导页创建
					markAutoRedirectedToOnboarding()
					Taro.navigateTo({ url: '/pages/baby-edit/index' })
				}
			})
		}
	})

	const formatElapsed = (date?: string | null) => {
		if (!date) return ''
		const minutes = Math.max(
			0,
			Math.floor((now - new Date(date).getTime()) / 60000),
		)
		if (minutes < 60) return `${minutes}分钟前`
		const hours = Math.floor(minutes / 60)
		if (hours < 24)
			return `${hours}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}前`
		return `${Math.floor(hours / 24)}天前`
	}

	const feedingElapsed = isLoggedIn ? formatElapsed(summary?.lastFeedingAt) : ''
	const sleepElapsed = isLoggedIn
		? summary?.lastSleepEndAt
			? `已醒${formatElapsed(summary.lastSleepEndAt).replace('前', '')}`
			: summary?.lastSleepAt
				? `入睡${formatElapsed(summary.lastSleepAt)}`
				: ''
		: ''

	const navigateToRecord = async (type: string, metric?: string) => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/baby-edit/index' })
			return
		}
		if (type === 'photo') {
			void trackEvent('photo_add_click', { from: 'home' })
			takePhotoAndSave(currentBaby.id, {
				goAlbum: true,
				babyName: currentBaby.name,
			}).then(success => {
				if (success) fetchRecentPhotos(currentBaby.id)
			})
			return
		}
		if (type === 'feeding') {
			// 喂奶记录使用独立设计页
			Taro.navigateTo({
				url: `/pages/feeding/index?babyId=${currentBaby.id}`,
			})
		} else if (type === 'sleep') {
			// 睡眠记录使用独立设计页
			Taro.navigateTo({
				url: `/pages/sleep/index?babyId=${currentBaby.id}`,
			})
		} else {
			Taro.navigateTo({
				url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}${
					metric ? `&metric=${metric}` : ''
				}`,
			})
		}
	}

	// 未登录时使用 mock 数据
	const displayBaby = isLoggedIn ? currentBaby : MOCK_BABY
	const displayAge = displayBaby ? calculateAge(displayBaby.birthday) : null
	const monthlyTips = displayAge ? getMonthlyTips(displayAge.months) : null
	const featuredTip = monthlyTips?.tips[0]

	// 身高体重是慢变的存量数据，示例模式补一份样例；体温是瞬时健康信号，示例里不展示
	const displayHeightWeight = isLoggedIn
		? latestHeightWeight
		: MOCK_STATS.latestHeightWeight
	// 体温是瞬时健康信号：只有最近 24 小时内量过才在首页展示，过期数据交给明细页/趋势图
	const TEMPERATURE_WINDOW_MS = 24 * 60 * 60 * 1000
	const displayTemperature =
		latestTemperature &&
		now - new Date(latestTemperature.date).getTime() <= TEMPERATURE_WINDOW_MS
			? latestTemperature
			: null
	// 发烧状态色：≥38.5 高热红、≥37.3 低热橙、正常中性色
	const tempFeverClass = !displayTemperature
		? ''
		: displayTemperature.temperature >= 38.5
			? ' fever-high'
			: displayTemperature.temperature >= 37.3
				? ' fever-low'
				: ''
	const tempTimeText = displayTemperature
		? `${
				new Date(displayTemperature.date).toDateString() ===
				new Date(now).toDateString()
					? '今天'
					: '昨天'
			}${formatHM(displayTemperature.date)}`
		: ''

	// 生成今日日报海报
	const handleDailyReport = async (action: 'save' | 'share') => {
		if (!currentBaby) return
		try {
			await deliverDailyPoster(
				{
					...buildDailyPosterData(summary, currentBaby),
					miniProgramCodeUrl: await fetchPosterQrCode('daily'),
				},
				action,
			)
		} catch (error) {
			Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
		}
	}

	return (
		<View className="page">
			<View
				className="home-topbar"
				style={{ paddingTop: `${statusBarHeight}px` }}
			>
				<Text
					className="home-topbar-title"
					style={{
						marginTop: `${capsuleBand.topOffset}px`,
						lineHeight: `${capsuleBand.height}px`,
					}}
				>
					育娃手记
				</Text>
				{isLoggedIn && currentBaby && (
					<View
						className="daily-pill"
						style={{
							marginTop: `${capsuleBand.topOffset}px`,
							height: `${capsuleBand.height}px`,
							marginRight: `${capsuleBand.rightGap + 8}px`,
						}}
						onClick={() => handleDailyReport('share')}
					>
						<Image className="daily-pill-icon" src={reportPlusIcon} />
						<Text className="daily-pill-text">一键生成今日日报</Text>
						<Image className="daily-pill-sparkle" src={sparklePinkIcon} />
					</View>
				)}
			</View>
			{/* 未登录：示例数据提示 */}
			{!isLoggedIn && (
				<View className="demo-banner">
					<Text className="demo-banner-emoji">👀</Text>
					<Text className="demo-banner-text">
						示例数据预览，登录后记录宝宝的成长
					</Text>
					<View
						className="demo-banner-btn"
						onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
					>
						<Text className="demo-banner-btn-text">去登录</Text>
					</View>
				</View>
			)}

			<BabyCard
				isLoggedIn={isLoggedIn}
				babyReady={babyReady}
				currentBaby={currentBaby}
				displayBaby={displayBaby}
				displayAge={displayAge}
				heightWeight={displayHeightWeight}
				temperature={displayTemperature}
				tempFeverClass={tempFeverClass}
				tempTimeText={tempTimeText}
				featuredTip={featuredTip ?? null}
				onOpenTips={() => setShowTips(true)}
				onGhostRecord={navigateToRecord}
			/>

			<VaccineReminderCard
				isLoggedIn={isLoggedIn}
				babyId={currentBaby?.id}
				refreshKey={vaccineRefreshKey}
			/>

			{/* 快速记录 */}
			{displayBaby && (
				<QuickRecord
					isLoggedIn={isLoggedIn}
					hasBaby={Boolean(currentBaby)}
					feedingElapsed={feedingElapsed}
					sleepElapsed={sleepElapsed}
					onNavigate={navigateToRecord}
				/>
			)}

			{/* 最近的瞬间：相册入口前置到首页 */}
			{displayBaby && (
				<MomentsSection
					babyName={displayBaby.name}
					photos={recentPhotos}
					ready={photosReady}
					onPreview={handleMomentsPreview}
					onOpenAlbum={() =>
						Taro.navigateTo({
							url: `/pages/photo/index?babyId=${displayBaby.id}`,
						})
					}
					onTakePhoto={() => navigateToRecord('photo')}
				/>
			)}

			{showTips && monthlyTips && (
				<TipsSheet monthlyTips={monthlyTips} onClose={() => setShowTips(false)} />
			)}

			{/* 「添加到我的小程序」引导浮层：气泡指向右上角胶囊 */}
			{showAddGuide && (
				<View className="add-guide-overlay" onClick={dismissAddGuide}>
					<View
						className="add-guide-bubble"
						style={{ top: `${statusBarHeight + 50}px` }}
						onClick={e => e.stopPropagation()}
					>
						<View className="add-guide-arrow" />
						<Text className="add-guide-title">
							把育娃手记添加到「我的小程序」
						</Text>
						<Text className="add-guide-desc">
							点击右上角「···」，选择「添加到我的小程序」，下次从微信首页下拉就能快速打开
						</Text>
						<View className="add-guide-btn" onClick={dismissAddGuide}>
							<Text className="add-guide-btn-text">我知道了</Text>
						</View>
					</View>
				</View>
			)}

			{/* 日报海报的离屏画布 */}
			<View
				className="poster-canvas-wrap"
				style={{ width: '340px', height: '600px' }}
			>
				<Canvas
					type="2d"
					id="daily-report-canvas"
					style={{ width: '340px', height: '600px' }}
				/>
			</View>

			<TabBar />
		</View>
	)
}
