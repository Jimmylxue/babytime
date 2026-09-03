import { Canvas, View, Text, Image, ScrollView, Button } from '@tarojs/components'
import Taro, {
	useDidShow,
	useShareAppMessage,
	useShareTimeline,
} from '@tarojs/taro'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore } from '../../stores/recordStore'
import { calculateAge, formatDate, formatDurationLong } from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { takePhotoAndSave } from '../../utils/upload'
import { needLogin } from '../../utils/needLogin'
import { announcementApi, notificationApi, trackEvent, VaccinePlanItem } from '../../utils/request'
import miniProgramCode from '../../assets/mini-program-code.jpg'
import { MOCK_BABY, MOCK_SUMMARY } from '../../utils/mock'
import babyFacePink from '../../assets/icons/baby-face-pink.svg'
import babyFaceBlue from '../../assets/icons/baby-face-blue.svg'
import {
	hasAutoRedirectedToOnboarding,
	markAutoRedirectedToOnboarding,
} from '../../utils/onboarding'
import { DailyMetric } from '../../utils/dailyPoster'
import reportIcon from '../../assets/icons/dailyReport.svg'
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
	{ type: 'photo', icon: '📷', label: '拍照' },
]

const moreActions = [
	{ type: 'water', icon: '💧', label: '喝水' },
	{ type: 'bath', icon: '🛁', label: '洗澡' },
	{ type: 'height_weight', metric: 'height', icon: '📏', label: '身高' },
	{ type: 'height_weight', metric: 'weight', icon: '⚖️', label: '体重' },
	{ type: 'medicine', icon: '💊', label: '用药' },
	{ type: 'outdoor', icon: '🌳', label: '户外活动' },
]

const feedingMethodLabel: Record<string, string> = {
	breast: '母乳',
	formula: '奶粉',
	mixed: '混合',
}

function formatVaccineDate(date: string) {
	const [, month, day] = date.split('-').map(Number)
	return `${month}月${day}日`
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
	const [statusBarHeight] = useState(() => Taro.getSystemInfoSync().statusBarHeight || 20)
	const [vaccineTemplateId, setVaccineTemplateId] = useState('')
	const [vaccineState, setVaccineState] = useState<'never' | 'active' | 'exhausted'>('never')
	const [nextVaccine, setNextVaccine] = useState<VaccinePlanItem | null>(null)
	const [reviewTemplateId, setReviewTemplateId] = useState('')
	const [reviewSubscribed, setReviewSubscribed] = useState(false)
	const announcementCheckingRef = useRef(false)
	const notificationTrackedRef = useRef(false)
	const requestingVaccineSubscriptionRef = useRef(false)

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

	useDidShow(() => {
		if (isLoggedIn) void trackEvent('app_open')
		const source = Taro.getCurrentInstance().router?.params?.source
		if (isLoggedIn && !notificationTrackedRef.current && source?.startsWith('notification_')) {
			notificationTrackedRef.current = true
			void trackEvent('notification_open', { source })
		}
		showAnnouncementIfNeeded()
		if (isLoggedIn) {
			notificationApi.getConfig().then(res => {
				setVaccineTemplateId(res.data?.vaccineEnabled ? res.data.vaccineTemplateId : '')
				setReviewTemplateId(res.data?.reviewEnabled ? res.data.reviewTemplateId : '')
			}).catch(() => {})
			notificationApi.getStatus().then(res => setVaccineState(res.data?.state || 'never')).catch(() => setVaccineState('never'))
			fetchBabies().then(() => {
				const baby = useBabyStore.getState().currentBaby
				if (baby) {
					setNextVaccine(null)
					notificationApi.getVaccinePlans(baby.id).then(res => {
						const today = formatDate(new Date())
						const next = (res.data || [])
							.filter(item => !item.completed && item.effectiveDate >= today)
							.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] || null
						setNextVaccine(next)
					}).catch(() => setNextVaccine(null))
					fetchSummary(baby.id)
					fetchStats(baby.id)
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
			const result = await requestSubscribeMessage({ tmplIds: [vaccineTemplateId] })
			const status = result?.[vaccineTemplateId] || 'unknown'
			await notificationApi.saveSubscriptions({ [vaccineTemplateId]: status })
			void trackEvent('subscription_prompt_result', { template: 'vaccine', status, source: 'home_reminder_card' })
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
				await Taro.showModal({ title: '提醒授权失败', content: errorMessage, showCancel: false, confirmText: '知道了' })
			}
			void trackEvent('subscription_prompt_result', { template: 'vaccine', status: 'error', source: 'home_reminder_card' })
		} finally {
			requestingVaccineSubscriptionRef.current = false
		}
	}

	const handleReminderCardClick = () => {
		if (vaccineState === 'active') {
			Taro.navigateTo({ url: `/pages/vaccine-timeline/index?babyId=${currentBaby?.id || ''}` })
			return
		}
		void requestVaccineSubscription()
	}

	const vaccineReminderDescription = nextVaccine
		? `${nextVaccine.scheduledDate ? '计划' : '参考'} ${formatVaccineDate(nextVaccine.effectiveDate)} · ${nextVaccine.label}`
		: vaccineState === 'active'
			? '还有可用提醒次数'
			: vaccineState === 'exhausted'
				? '上次提醒已发送，继续订阅下一次'
				: '接种日前 3 天提醒你，按时完成接种'

	const requestReviewSubscription = async () => {
		if (!reviewTemplateId) return
		try {
			const result = await (Taro as any).requestSubscribeMessage({ tmplIds: [reviewTemplateId] })
			const status = result?.[reviewTemplateId] || 'unknown'
			await notificationApi.saveSubscriptions({ [reviewTemplateId]: status })
			void trackEvent('subscription_prompt_result', { template: 'daily_review', status })
			if (status === 'accept') {
				setReviewSubscribed(true)
				Taro.showToast({ title: '晚间回顾已开启', icon: 'success' })
			}
		} catch {
			void trackEvent('subscription_prompt_result', { template: 'daily_review', status: 'error' })
		}
	}

	const formatElapsed = (date?: string | null) => {
		if (!date) return ''
		const minutes = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000))
		if (minutes < 60) return `${minutes}分钟前`
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return `${hours}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}前`
		return `${Math.floor(hours / 24)}天前`
	}

	const feedingElapsed = isLoggedIn ? formatElapsed(summary?.lastFeedingAt) : ''
	const sleepElapsed = isLoggedIn
		? (summary?.lastSleepEndAt
			? `已醒${formatElapsed(summary.lastSleepEndAt).replace('前', '')}`
			: summary?.lastSleepAt ? `入睡${formatElapsed(summary.lastSleepAt)}` : '')
		: ''

	// 从记录中提取辅助信息
	const todayRecords = records || []
	const feedingRecords = todayRecords.filter(r => r.type === 'feeding')
	const diaperRecords = todayRecords.filter(r => r.type === 'diaper')
	const sleepRecords = todayRecords.filter(r => r.type === 'sleep')
	const foodRecords = todayRecords.filter(r => r.type === 'food')

	// 最近一次喂奶方式
	const lastFeeding = feedingRecords.length > 0 ? feedingRecords[0] : null
	const lastFeedingMethod = lastFeeding?.feedingMethod || null

	// 尿布类型统计
	const diaperBreakdown = diaperRecords.reduce(
		(acc, r) => {
			if (r.diaperStatus === 'wet') acc.wet++
			else if (r.diaperStatus === 'dirty') acc.dirty++
			else if (r.diaperStatus === 'both') acc.both++
			return acc
		},
		{ wet: 0, dirty: 0, both: 0 },
	)
	const diaperDetailParts: string[] = []
	if (diaperBreakdown.wet > 0)
		diaperDetailParts.push(`尿${diaperBreakdown.wet}`)
	if (diaperBreakdown.dirty > 0)
		diaperDetailParts.push(`拉${diaperBreakdown.dirty}`)
	if (diaperBreakdown.both > 0)
		diaperDetailParts.push(`都有${diaperBreakdown.both}`)

	// 最近一次辅食
	const lastFoodName = foodRecords.length > 0 ? foodRecords[0].foodName : null

	// 最近一次睡眠时长
	const lastSleepDuration =
		sleepRecords.length > 0 ? sleepRecords[0].duration : null

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
			takePhotoAndSave(currentBaby.id)
			return
		}
		Taro.navigateTo({
			url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}${
				metric ? `&metric=${metric}` : ''
			}`,
		})
		setShowMore(false)
	}

	// 查看喂奶明细
	const goToFeedingDetail = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/onboarding/index' })
			return
		}
		Taro.navigateTo({
			url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=feeding`,
		})
	}

	// 查看尿布明细（含上传的尿布照片）
	const goToDiaperDetail = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/onboarding/index' })
			return
		}
		Taro.navigateTo({
			url: `/pages/record-detail/index?babyId=${currentBaby.id}&type=diaper`,
		})
	}

	// 未登录时使用 mock 数据
	const displayBaby = isLoggedIn ? currentBaby : MOCK_BABY
	const displaySummary = isLoggedIn ? summary : MOCK_SUMMARY
	const displayAge = displayBaby ? calculateAge(displayBaby.birthday) : null
	const monthlyTips = displayAge ? getMonthlyTips(displayAge.months) : null
	const featuredTip = monthlyTips?.tips[0]

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
						summaryData.totalMilk > 0 ? `共${summaryData.totalMilk}ml` : undefined,
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
			if (summaryData.feedingCount > 0) highlights.push(`喂了${summaryData.feedingCount}次奶`)
			if (summaryData.sleepTotal > 0) highlights.push(`睡了${formatDurationLong(summaryData.sleepTotal)}`)
			if (summaryData.diaperCount > 0) highlights.push(`换了${summaryData.diaperCount}次尿布`)
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
			<View className="home-topbar" style={{ paddingTop: `${statusBarHeight}px` }}>
				<Text className="home-topbar-title">育娃手记</Text>
			</View>
			{/* 未登录：示例数据提示 */}
			{!isLoggedIn && (
				<View className="demo-banner">
					<Text className="demo-banner-emoji">👀</Text>
					<Text className="demo-banner-text">示例数据预览，登录后记录宝宝的成长</Text>
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
									displayBaby?.gender === 'male'
										? babyFaceBlue
										: babyFacePink
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

				{(latestHeightWeight || latestTemperature) && (
					<View className="baby-metrics">
						{latestHeightWeight && (
							<Fragment>
								<View className="baby-metric m-weight">
									<View className="baby-metric-icon">
										<Text>⚖️</Text>
									</View>
									<View className="baby-metric-copy">
										<Text className="baby-metric-label">体重</Text>
										<View className="baby-metric-value">
											<Text className="baby-metric-num">
												{latestHeightWeight.weight}
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
												{latestHeightWeight.height}
											</Text>
											<Text className="baby-metric-unit">cm</Text>
										</View>
									</View>
								</View>
							</Fragment>
						)}
						{latestTemperature && (
							<View className="baby-metric m-temp">
								<View className="baby-metric-icon">
									<Text>🌡️</Text>
									</View>
								<View className="baby-metric-copy">
									<Text className="baby-metric-label">体温</Text>
									<View className="baby-metric-value">
										<Text className="baby-metric-num">
											{latestTemperature.temperature}
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

			{isLoggedIn && currentBaby && vaccineTemplateId && (
				<Button
					className={`vaccine-reminder-card${vaccineState === 'active' ? ' enabled' : ''}`}
					onClick={handleReminderCardClick}
					aria-label={vaccineState === 'active' ? '疫苗提醒已订阅' : vaccineState === 'exhausted' ? '再次订阅疫苗提醒' : '开启疫苗提醒'}
				>
					<View className="vaccine-reminder-icon"><Text>💉</Text></View>
					<View className="vaccine-reminder-copy">
						<Text className="vaccine-reminder-title">{vaccineState === 'active' ? '疫苗提醒已订阅' : vaccineState === 'exhausted' ? '再次订阅疫苗提醒' : '开启疫苗提醒'}</Text>
						<Text className="vaccine-reminder-desc">{vaccineReminderDescription}</Text>
					</View>
					<Text className="vaccine-reminder-action">{vaccineState === 'active' ? '已订阅' : vaccineState === 'exhausted' ? '再次订阅 ›' : '开启 ›'}</Text>
				</Button>
			)}

			{/* 快速记录 */}
			{displayBaby && (
				<View className="quick-section">
					<View className="section-head">
						<View className="section-accent" />
						<Text className="section-label">快速记录</Text>
					</View>
					<View className="quick-card">
						<View className="action-grid">
							{quickActions.map(action => (
								<View
									key={action.type}
									className="action-item"
									onClick={() => navigateToRecord(action.type)}
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

			{/* 今日统计 */}
			{displaySummary && (
				<View className="stats-section">
					<View className="section-head">
						<View className="section-accent" />
						<Text className="section-label">今日记录</Text>
						{isLoggedIn && currentBaby && (
							<View
								className="daily-report-entry"
								onClick={() => handleDailyReport('share')}
							>
								<Image
									className="daily-report-entry-icon"
									src={reportIcon}
								/>
							</View>
						)}
					</View>
					{isLoggedIn && currentBaby && (feedingElapsed || sleepElapsed) && (
						<View className="return-cue-row">
							{feedingElapsed && <Text className="return-cue">距上次喂奶 {feedingElapsed}</Text>}
							{sleepElapsed && <Text className="return-cue">{sleepElapsed}</Text>}
						</View>
					)}
					{isLoggedIn && currentBaby && reviewTemplateId && (
						<View className={`review-reminder-entry${reviewSubscribed ? ' enabled' : ''}`} onClick={requestReviewSubscription}>
							<Text>{reviewSubscribed ? '晚间回顾已开启' : '今晚接收宝宝记录回顾'}</Text>
							<Text>{reviewSubscribed ? '已开启' : '开启提醒'}</Text>
						</View>
					)}
					<View className="stats-list-container">
						{/* 喂奶 */}
						<View
							className="stat-list-item t-feeding"
							onClick={() => goToFeedingDetail()}
						>
							<View className="stat-icon-wrap feeding">
								<Text className="stat-icon">🍼</Text>
							</View>
							<View className="stat-main">
								<View className="stat-info-left">
									<View className="stat-title-row">
										<Text className="stat-label">喂奶</Text>
										<Text className="stat-value">
											{displaySummary.feedingCount}
											<Text className="stat-unit">次</Text>
										</Text>
									</View>
								</View>
								<View className="stat-info-right">
									{displaySummary.totalMilk > 0 ? (
										<Text className="stat-detail">
											共{displaySummary.totalMilk}ml
										</Text>
									) : (
										<Text className="stat-detail">-</Text>
									)}
									{lastFeedingMethod && (
										<Text className="stat-sub">
											{feedingMethodLabel[lastFeedingMethod] ||
												lastFeedingMethod}
											{lastFeedingMethod === 'mixed' &&
											(lastFeeding?.breastAmount || lastFeeding?.formulaAmount)
												? `(母${lastFeeding?.breastAmount || 0}+奶${lastFeeding?.formulaAmount || 0})`
												: ''}
										</Text>
									)}
								</View>
							</View>
							<View className="stat-arrow">
								<Text className="arrow-icon">›</Text>
							</View>
						</View>

						{/* 尿布 */}
						<View className="stat-list-item t-diaper" onClick={() => goToDiaperDetail()}>
							<View className="stat-icon-wrap diaper">
								<Text className="stat-icon">💩</Text>
							</View>
							<View className="stat-main">
								<View className="stat-info-left">
									<View className="stat-title-row">
										<Text className="stat-label">尿布</Text>
										<Text className="stat-value">
											{displaySummary.diaperCount}
											<Text className="stat-unit">次</Text>
										</Text>
									</View>
								</View>
								<View className="stat-info-right">
									{diaperDetailParts.length > 0 ? (
										<Text className="stat-detail">
											{diaperDetailParts.join(' ')}
										</Text>
									) : (
										<Text className="stat-detail">-</Text>
									)}
								</View>
							</View>
							<View className="stat-arrow">
								<Text className="arrow-icon">›</Text>
							</View>
						</View>

						{/* 睡觉 */}
						<View className="stat-list-item t-sleep">
							<View className="stat-icon-wrap sleep">
								<Text className="stat-icon">😴</Text>
							</View>
							<View className="stat-main">
								<View className="stat-info-left">
									<View className="stat-title-row">
										<Text className="stat-label">睡觉</Text>
										<Text className="stat-value">
											{displaySummary.sleepCount}
											<Text className="stat-unit">次</Text>
										</Text>
									</View>
								</View>
								<View className="stat-info-right">
									{displaySummary.sleepTotal > 0 ? (
										<Text className="stat-detail">
											共{formatDurationLong(displaySummary.sleepTotal)}
										</Text>
									) : (
										<Text className="stat-detail">-</Text>
									)}
									{lastSleepDuration != null && lastSleepDuration > 0 && (
										<Text className="stat-sub">
											最近{formatDurationLong(lastSleepDuration)}
										</Text>
									)}
								</View>
							</View>
						</View>

						{/* 辅食 */}
						<View className="stat-list-item t-food">
							<View className="stat-icon-wrap food">
								<Text className="stat-icon">🍚</Text>
							</View>
							<View className="stat-main">
								<View className="stat-info-left">
									<View className="stat-title-row">
										<Text className="stat-label">辅食</Text>
										<Text className="stat-value">
											{displaySummary.foodCount}
											<Text className="stat-unit">次</Text>
										</Text>
									</View>
								</View>
								<View className="stat-info-right">
									{lastFoodName ? (
										<Text className="stat-detail">{lastFoodName}</Text>
									) : (
										<Text className="stat-detail">-</Text>
									)}
								</View>
							</View>
						</View>
					</View>
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
										key={`${action.type}-${action.metric ?? ''}`}
										className="sheet-item"
										onClick={() =>
											navigateToRecord(action.type, action.metric)
										}
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
					<View className="sheet-panel tips-sheet-panel" onClick={e => e.stopPropagation()}>
						<View className="sheet-handle" />
						<View className="tips-sheet-header">
							<View>
								<Text className="tips-sheet-title">{monthlyTips.ageLabel} 本月关注</Text>
								<Text className="tips-sheet-desc">每个宝宝的成长节奏都不一样</Text>
							</View>
							<View className="tips-sheet-count"><Text>{monthlyTips.tips.length} 条</Text></View>
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
						<Text className="tips-sheet-disclaimer">小贴士仅供日常参考，如有不适或喂养疑问请咨询儿科医生。</Text>
					</ScrollView>
				</View>
			</View>
			)}

			{/* 「添加到我的小程序」引导浮层：气泡指向右上角胶囊 */}
			{showAddGuide && (
				<View className="add-guide-overlay" onClick={dismissAddGuide}>
					<View className="add-guide-bubble" onClick={e => e.stopPropagation()}>
						<View className="add-guide-arrow" />
						<Text className="add-guide-title">把育娃手记添加到「我的小程序」</Text>
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
