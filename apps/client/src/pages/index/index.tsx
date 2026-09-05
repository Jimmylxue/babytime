import {
	Canvas,
	View,
	Text,
	Image,
	ScrollView,
	Button,
} from '@tarojs/components'
import Taro, {
	useDidShow,
	useShareAppMessage,
	useShareTimeline,
} from '@tarojs/taro'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore } from '../../stores/recordStore'
import {
	calculateAge,
	formatDate,
	formatDurationLong,
	formatHM,
} from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { takePhotoAndSave } from '../../utils/upload'
import { needLogin } from '../../utils/needLogin'
import {
	announcementApi,
	notificationApi,
	photoApi,
	trackEvent,
	VaccinePlanItem,
} from '../../utils/request'
import miniProgramCode from '../../assets/mini-program-code.jpg'
import babyIllustration from '../../assets/baby-illustration.jpg'
import babyIllustrationGirl from '../../assets/baby-illustration-girl.jpg'
import vaccineSafety from '../../assets/vaccine-safety.jpg'
import { MOCK_BABY, MOCK_STATS, MOCK_SUMMARY } from '../../utils/mock'
import babyFacePink from '../../assets/icons/baby-face-pink.svg'
import babyFaceBlue from '../../assets/icons/baby-face-blue.svg'
import {
	hasAutoRedirectedToOnboarding,
	markAutoRedirectedToOnboarding,
} from '../../utils/onboarding'
import { DailyMetric } from '../../utils/dailyPoster'
import reportPlusIcon from '../../assets/icons/report-plus.svg'
import sparklePinkIcon from '../../assets/icons/sparkle-pink.svg'
import { deliverDailyPoster } from '../../utils/chartExport'
import TabBar from '../../components/TabBar'
import './index.scss'

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

interface RecentPhoto {
	id: string
	url: string
	thumbnail?: string
}

function formatVaccineDate(date: string) {
	const [, month, day] = date.split('-').map(Number)
	return `${month}月${day}日`
}

function getVaccineDaysLeft(date?: string | null) {
	if (!date) return 14
	const target = new Date(`${date}T00:00:00`).getTime()
	return Math.max(
		0,
		Math.ceil(
			(target - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000),
		),
	)
}

// 未登录示例数据：14 天后的示例针次（日期动态计算，「还有 N 天」始终成立）
function getDemoNextVaccine(): VaccinePlanItem {
	const date = formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
	return {
		scheduleItemId: 'demo-schedule-2',
		label: '乙肝疫苗 第2剂',
		referenceDate: date,
		scheduledDate: date,
		effectiveDate: date,
		completed: false,
		actualDate: null,
	}
}

export default function Index() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const {
		summary,
		records,
		fetchSummary,
		fetchStats,
		latestHeightWeight,
		latestTemperature,
	} = useRecordStore()
	const [showMore, setShowMore] = useState(false)
	const [showTips, setShowTips] = useState(false)
	const [showAddGuide, setShowAddGuide] = useState(false)
	const [now, setNow] = useState(() => Date.now())
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
	const [vaccineTemplateId, setVaccineTemplateId] = useState('')
	const [vaccineState, setVaccineState] = useState<
		'never' | 'active' | 'exhausted'
	>('never')
	const [nextVaccine, setNextVaccine] = useState<VaccinePlanItem | null>(null)
	const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([])
	const announcementCheckingRef = useRef(false)
	const notificationTrackedRef = useRef(false)
	const requestingVaccineSubscriptionRef = useRef(false)
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
			notificationApi
				.getConfig()
				.then(res => {
					setVaccineTemplateId(
						res.data?.vaccineEnabled ? res.data.vaccineTemplateId : '',
					)
				})
				.catch(() => {})
			notificationApi
				.getStatus()
				.then(res => setVaccineState(res.data?.state || 'never'))
				.catch(() => setVaccineState('never'))
			fetchBabies().then(() => {
				const baby = useBabyStore.getState().currentBaby
				if (baby) {
					setNextVaccine(null)
					notificationApi
						.getVaccinePlans(baby.id)
						.then(res => {
							const today = formatDate(new Date())
							const next =
								(res.data || [])
									.filter(
										item => !item.completed && item.effectiveDate >= today,
									)
									.sort((a, b) =>
										a.effectiveDate.localeCompare(b.effectiveDate),
									)[0] || null
							setNextVaccine(next)
						})
						.catch(() => setNextVaccine(null))
					fetchSummary(baby.id)
					fetchStats(baby.id)
					fetchRecentPhotos(baby.id)
					maybeShowAddGuide()
				} else if (!hasAutoRedirectedToOnboarding()) {
					// 已登录但没有宝宝档案，进引导页创建
					markAutoRedirectedToOnboarding()
					Taro.navigateTo({ url: '/pages/onboarding/index' })
				}
			})
		}
	})

	const requestVaccineSubscription = async () => {
		if (requestingVaccineSubscriptionRef.current) return
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!vaccineTemplateId) {
			Taro.showToast({ title: '提醒服务暂未配置', icon: 'none' })
			return
		}
		requestingVaccineSubscriptionRef.current = true
		try {
			const requestSubscribeMessage = (Taro as any).requestSubscribeMessage
			if (typeof requestSubscribeMessage !== 'function') {
				throw new Error('当前基础库不支持订阅消息，请升级微信后重试')
			}
			// 必须在铃铛点击回调中直接调用，不能先 await 网络请求。
			const result = await requestSubscribeMessage({
				tmplIds: [vaccineTemplateId],
			})
			const status = result?.[vaccineTemplateId] || 'unknown'
			await notificationApi.saveSubscriptions({ [vaccineTemplateId]: status })
			void trackEvent('subscription_prompt_result', {
				template: 'vaccine',
				status,
				source: 'home_reminder_card',
			})
			const latestStatus = await notificationApi.getStatus().catch(() => null)
			if (latestStatus?.data?.state) setVaccineState(latestStatus.data.state)
			if (status === 'accept') {
				if (!latestStatus?.data?.state) setVaccineState('active')
				Taro.showToast({ title: '接种提醒已开启', icon: 'success' })
			} else if (status === 'reject') {
				Taro.showToast({ title: '暂未开启接种提醒', icon: 'none' })
			}
		} catch (error: any) {
			const errorMessage = error?.errMsg || error?.message || 'unknown'
			console.error('requestSubscribeMessage failed', error)
			if (errorMessage.includes('cancel')) {
				Taro.showToast({ title: '已取消提醒授权', icon: 'none' })
			} else {
				await Taro.showModal({
					title: '提醒授权失败',
					content: errorMessage,
					showCancel: false,
					confirmText: '知道了',
				})
			}
			void trackEvent('subscription_prompt_result', {
				template: 'vaccine',
				status: 'error',
				source: 'home_reminder_card',
			})
		} finally {
			requestingVaccineSubscriptionRef.current = false
		}
	}

	const handleReminderCardClick = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (vaccineState === 'active') {
			Taro.navigateTo({
				url: `/pages/vaccine-timeline/index?babyId=${currentBaby?.id || ''}`,
			})
			return
		}
		void requestVaccineSubscription()
	}

	// 「查看计划」只跳页面，不再触发订阅流程（阻止冒泡避免重复处理卡片点击）
	const handleViewVaccinePlan = (e?: any) => {
		e?.stopPropagation?.()
		if (!isLoggedIn) {
			needLogin()
			return
		}
		Taro.navigateTo({
			url: `/pages/vaccine-timeline/index?babyId=${currentBaby?.id || ''}`,
		})
	}

	// 疫苗卡展示态：未登录按「已订阅」展示示例针次，点击引导登录
	const vaccineStateDisplay = isLoggedIn ? vaccineState : 'active'
	const nextVaccineDisplay = isLoggedIn ? nextVaccine : getDemoNextVaccine()
	const isVaccineActive = vaccineStateDisplay === 'active'
	// 三态外观：已订阅绿、未订阅粉白、已过期（次数耗尽）琥珀——均需再订阅一次的用 CTA 按钮
	const vaccineCardClass = isVaccineActive
		? 'enabled'
		: vaccineStateDisplay === 'exhausted'
			? 'expired'
			: 'unsubscribed'
	const vaccineBadgeText = isVaccineActive
		? '已订阅'
		: vaccineStateDisplay === 'exhausted'
			? '已过期'
			: '未开启'
	const vaccineBadgeClass = isVaccineActive
		? ''
		: vaccineStateDisplay === 'exhausted'
			? ' expired'
			: ' off'
	const vaccineCtaText = isVaccineActive
		? '查看计划'
		: vaccineStateDisplay === 'exhausted'
			? '再次订阅'
			: '开启提醒'
	const vaccineDaysLeft = getVaccineDaysLeft(nextVaccineDisplay?.effectiveDate)
	const vaccineWeekday = nextVaccineDisplay
		? '日一二三四五六'.charAt(
				new Date(`${nextVaccineDisplay.effectiveDate}T00:00:00`).getDay(),
			)
		: ''
	// 无下一针安排时的兜底文案
	const vaccineReminderFallback =
		vaccineStateDisplay === 'active'
			? '订阅生效中，有新安排会继续提醒你'
			: vaccineStateDisplay === 'exhausted'
				? '本次提醒已发送，点击卡片可再次订阅'
				: '开启订阅，接种日前 3 天微信提醒你'

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
			Taro.navigateTo({ url: '/pages/onboarding/index' })
			return
		}
		if (type === 'photo') {
			takePhotoAndSave(currentBaby.id, {
				goAlbum: true,
				babyName: currentBaby.name,
			}).then(success => {
				if (success) fetchRecentPhotos(currentBaby.id)
			})
			return
		}
		Taro.navigateTo({
			url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}${
				metric ? `&metric=${metric}` : ''
			}`,
		})
		setShowMore(false)
	}

	// 未登录时使用 mock 数据
	const displayBaby = isLoggedIn ? currentBaby : MOCK_BABY
	const displaySummary = isLoggedIn ? summary : MOCK_SUMMARY
	// 身高体重是慢变的存量数据，示例模式补一份样例；体温是瞬时健康信号，示例里不展示
	const displayHeightWeight = isLoggedIn
		? latestHeightWeight
		: MOCK_STATS.latestHeightWeight
	const displayAge = displayBaby ? calculateAge(displayBaby.birthday) : null
	const monthlyTips = displayAge ? getMonthlyTips(displayAge.months) : null
	const featuredTip = monthlyTips?.tips[0]

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
			const summaryData = summary || {
				feedingCount: 0,
				totalMilk: 0,
				diaperCount: 0,
				sleepTotal: 0,
				sleepCount: 0,
				foodCount: 0,
				waterTotal: 0,
				bathCount: 0,
				outdoorCount: 0,
			}
			const now = new Date()
			const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
			const dateText = `${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekLabels[now.getDay()]}`
			const age = calculateAge(currentBaby.birthday)
			const metrics: DailyMetric[] = [
				{
					label: '喂奶',
					value: `${summaryData.feedingCount}次`,
					subBelow:
						summaryData.totalMilk > 0
							? `共${summaryData.totalMilk}ml`
							: undefined,
					iconBg: '#FFF3D9',
					emoji: '🍼',
				},
				{
					label: '睡眠',
					value: formatDurationLong(summaryData.sleepTotal),
					iconBg: '#EFE8FB',
					emoji: '😴',
				},
				{
					label: '便便尿布',
					value: `${summaryData.diaperCount}次`,
					iconBg: '#FBF3D1',
					emoji: '💩',
				},
				{
					label: '辅食',
					value: `${summaryData.foodCount}次`,
					iconBg: '#E8F5E4',
					emoji: '🍚',
				},
				{
					label: '饮水',
					value: `${summaryData.waterTotal}ml`,
					iconBg: '#E3F2FD',
					emoji: '💧',
				},
				{
					label: '户外',
					value: `${summaryData.outdoorCount}次`,
					iconBg: '#E9F5E1',
					emoji: '🌳',
				},
			]
			const highlights: string[] = []
			if (summaryData.feedingCount > 0)
				highlights.push(`喂了${summaryData.feedingCount}次奶`)
			if (summaryData.sleepTotal > 0)
				highlights.push(`睡了${formatDurationLong(summaryData.sleepTotal)}`)
			if (summaryData.diaperCount > 0)
				highlights.push(`换了${summaryData.diaperCount}次尿布`)
			const reviewText = highlights.length
				? `今天${highlights.join('、')}，又是被好好照顾的一天～`
				: '今天还没有记录，去记一笔再来看看宝宝的日报吧～'
			await deliverDailyPoster(
				{
					babyName: currentBaby.name,
					avatarUrl: currentBaby.avatar,
					genderText: currentBaby.gender === 'male' ? '男宝' : '女宝',
					dateText,
					ageText: `${age.months}个月 ${age.days}天`,
					metrics,
					reviewText,
					miniProgramCodeUrl: miniProgramCode,
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

			{/* 宝宝档案 */}
			<View
				className="baby-card"
				onClick={
					isLoggedIn && !currentBaby
						? () => Taro.navigateTo({ url: '/pages/onboarding/index' })
						: undefined
				}
			>
				<View className="baby-deco baby-deco-a" />
				<View className="baby-deco baby-deco-b" />
				<Image
					className="baby-illustration"
					src={
						displayBaby?.gender === 'female'
							? babyIllustrationGirl
							: babyIllustration
					}
					mode="aspectFit"
				/>
				<View className="baby-main">
					<View className="baby-avatar">
						{displayBaby?.avatar ? (
							<Image
								className="avatar-img"
								src={displayBaby.avatar}
								mode="aspectFill"
							/>
						) : (
							<Image
								className="avatar-baby-icon"
								src={
									displayBaby?.gender === 'male' ? babyFaceBlue : babyFacePink
								}
							/>
						)}
					</View>
					<View className="baby-info">
						<View className="baby-name-row">
							<Text className="baby-name">
								{displayBaby?.name ||
									(isLoggedIn && !currentBaby
										? '为宝宝建立专属档案'
										: '未添加宝贝')}
							</Text>
							{!isLoggedIn && displayBaby && (
								<View className="baby-demo-badge">
									<Text className="baby-demo-badge-text">示例</Text>
								</View>
							)}
							{displayBaby && (
								<View className={`baby-gender ${displayBaby.gender}`}>
									<Text className="baby-gender-icon">
										{displayBaby.gender === 'male' ? '♂' : '♀'}
									</Text>
								</View>
							)}
						</View>
						<Text className="baby-age">
							{isLoggedIn && !currentBaby
								? '记录吃奶、睡觉、换尿布，解锁成长统计'
								: displayAge
									? `${displayAge.months}个月 ${displayAge.days}天`
									: '添加宝宝档案后开始记录'}
						</Text>
					</View>
					{isLoggedIn && !currentBaby && (
						<View className="baby-create-btn">
							<Text className="baby-create-btn-text">去创建</Text>
						</View>
					)}
				</View>

				{(displayHeightWeight || displayTemperature || isLoggedIn) && (
					<View
						className={`baby-metrics${displayTemperature ? ' has-temp' : ''}`}
					>
						{displayHeightWeight ? (
							<Fragment>
								<View className="baby-metric m-weight">
									<View className="baby-metric-icon">
										<Text>⚖️</Text>
									</View>
									<View className="baby-metric-copy">
										<Text className="baby-metric-label">体重</Text>
										<View className="baby-metric-value">
											<Text className="baby-metric-num">
												{displayHeightWeight.weight}
											</Text>
											<Text className="baby-metric-unit">kg</Text>
										</View>
									</View>
								</View>
								<View className="baby-metric m-height">
									<View className="baby-metric-icon">
										<Text>📏</Text>
									</View>
									<View className="baby-metric-copy">
										<Text className="baby-metric-label">身高</Text>
										<View className="baby-metric-value">
											<Text className="baby-metric-num">
												{displayHeightWeight.height}
											</Text>
											<Text className="baby-metric-unit">cm</Text>
										</View>
									</View>
								</View>
							</Fragment>
						) : (
							<Fragment>
								{/* 空状态：虚线幽灵卡引导记录第一笔身高体重 */}
								<View
									className="baby-metric ghost"
									onClick={() => navigateToRecord('height_weight', 'weight')}
								>
									<View className="baby-metric-icon">
										<Text>⚖️</Text>
									</View>
									<View className="baby-metric-copy">
										<Text className="baby-metric-label">体重</Text>
										<View className="baby-metric-value">
											<Text className="ghost-add">＋ 记录</Text>
										</View>
									</View>
								</View>
								<View
									className="baby-metric ghost"
									onClick={() => navigateToRecord('height_weight', 'height')}
								>
									<View className="baby-metric-icon">
										<Text>📏</Text>
									</View>
									<View className="baby-metric-copy">
										<Text className="baby-metric-label">身高</Text>
										<View className="baby-metric-value">
											<Text className="ghost-add">＋ 记录</Text>
										</View>
									</View>
								</View>
							</Fragment>
						)}
						{displayTemperature && (
							<View className={`baby-metric m-temp${tempFeverClass}`}>
								<View className="baby-metric-icon">
									<Text>🌡️</Text>
								</View>
								<View className="baby-metric-copy">
									<View className="baby-metric-label-row">
										<Text className="baby-metric-label">体温</Text>
										<Text className="baby-metric-time">{tempTimeText}</Text>
									</View>
									<View className="baby-metric-value">
										<Text className="baby-metric-num">
											{displayTemperature.temperature}
										</Text>
										<Text className="baby-metric-unit">°C</Text>
									</View>
								</View>
							</View>
						)}
					</View>
				)}

				{/* 本月关注：一行入口，完整内容通过底部面板查看 */}
				{monthlyTips && featuredTip && (
					<View className="baby-tip" onClick={() => setShowTips(true)}>
						<View className="baby-tip-badge">
							<Text>✦</Text>
						</View>
						<View className="baby-tip-copy">
							<Text className="baby-tip-tag">
								本月关注 · {featuredTip.category}
							</Text>
							<Text className="baby-tip-content">{featuredTip.content}</Text>
						</View>
						<Text className="baby-tip-arrow">›</Text>
					</View>
				)}
			</View>

			{(isLoggedIn
				? Boolean(currentBaby && vaccineTemplateId)
				: Boolean(displayBaby)) && (
				<Button
					className={`vaccine-reminder-card ${vaccineCardClass}`}
					onClick={handleReminderCardClick}
					aria-label={vaccineBadgeText}
				>
					<Image
						className="vaccine-safety-art"
						src={vaccineSafety}
						mode="aspectFit"
					/>
					<View className="vaccine-reminder-copy">
						<View className="vaccine-title-row">
							<Text className="vaccine-bell">🔔</Text>
							<Text className="vaccine-reminder-title">疫苗提醒</Text>
							<View className={`vaccine-state-badge${vaccineBadgeClass}`}>
								<Text
									className={`vaccine-state-badge-text${vaccineBadgeClass}`}
								>
									{vaccineBadgeText}
								</Text>
							</View>
						</View>
						{nextVaccineDisplay ? (
							<Fragment>
								<Text className="vaccine-next-line">
									下一针：{nextVaccineDisplay.label}
								</Text>
								<View className="vaccine-count">
									<Text className="vaccine-count-prefix">还有</Text>
									<Text className="vaccine-count-number">
										{vaccineDaysLeft}
									</Text>
									<Text className="vaccine-count-unit">天</Text>
								</View>
								<Text className="vaccine-date-line">
									接种日期：
									{formatVaccineDate(nextVaccineDisplay.effectiveDate)}（周
									{vaccineWeekday}）
								</Text>
							</Fragment>
						) : (
							<Text className="vaccine-reminder-desc">
								{vaccineReminderFallback}
							</Text>
						)}
					</View>
					<View
						className={`vaccine-plan-btn${isVaccineActive ? '' : ' cta'}`}
						onClick={isVaccineActive ? handleViewVaccinePlan : undefined}
					>
						<Text
							className={`vaccine-plan-btn-text${isVaccineActive ? '' : ' cta'}`}
						>
							{vaccineCtaText}
						</Text>
						<Text
							className={`vaccine-plan-btn-arrow${isVaccineActive ? '' : ' cta'}`}
						>
							›
						</Text>
					</View>
				</Button>
			)}

			{/* 快速记录 */}
			{displayBaby && (
				<View className="quick-section">
					<View className="section-head">
						<View className="section-accent" />
						<Text className="section-label">快速记录</Text>
					</View>
					{/* 喂养/睡眠状态提示：标题下方、宫格卡片外 */}
					{isLoggedIn && currentBaby && (feedingElapsed || sleepElapsed) && (
						<View className="return-cue-row return-cue-row-outer">
							{feedingElapsed && (
								<Text className="return-cue">距上次喂奶 {feedingElapsed}</Text>
							)}
							{sleepElapsed && (
								<Text className="return-cue">{sleepElapsed}</Text>
							)}
						</View>
					)}
					<View className="quick-card">
						<View className="action-grid">
							{quickActions.map(action => (
								<View
									key={action.type}
									className="action-item"
									onClick={() =>
										navigateToRecord(
											action.type,
											'metric' in action ? action.metric : undefined,
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
				</View>
			)}

			{/* 最近的瞬间：相册入口前置到首页 */}
			{displayBaby && (
				<View className="moments-section">
					<View className="section-head">
						<View className="section-accent" />
						<Text className="section-label">最近的瞬间</Text>
						{recentPhotos.length > 0 && (
							<View
								className="moments-album-entry"
								onClick={() =>
									Taro.navigateTo({
										url: `/pages/photo/index?babyId=${displayBaby.id}`,
									})
								}
							>
								<Text className="moments-album-entry-text">全部瞬间 ›</Text>
							</View>
						)}
					</View>
					{recentPhotos.length > 0 ? (
						<ScrollView
							className="moments-scroll"
							scrollX
							enhanced
							showScrollbar={false}
						>
							<View className="moments-row">
								{recentPhotos.map(photo => (
									<Image
										key={photo.id}
										className="moments-photo"
										src={photo.thumbnail || photo.url}
										mode="aspectFill"
										onClick={() => handleMomentsPreview(photo)}
									/>
								))}
								<View
									className="moments-tail"
									onClick={() =>
										Taro.navigateTo({
											url: `/pages/photo/index?babyId=${displayBaby.id}`,
										})
									}
								>
									<Text className="moments-tail-icon">📸</Text>
									<Text className="moments-tail-text">查看相册</Text>
								</View>
							</View>
						</ScrollView>
					) : (
						<View
							className="moments-empty"
							onClick={() => navigateToRecord('photo')}
						>
							<Text className="moments-empty-icon">📷</Text>
							<Text className="moments-empty-text">
								给 {displayBaby.name} 拍张照片吧，它会出现在这里
							</Text>
						</View>
					)}
				</View>
			)}

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
										onClick={() => navigateToRecord(action.type)}
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

			{showTips && monthlyTips && (
				<View className="sheet-overlay" onClick={() => setShowTips(false)}>
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
