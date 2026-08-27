import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, {
	useDidShow,
	useShareAppMessage,
	useShareTimeline,
} from '@tarojs/taro'
import { Fragment, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { useRecordStore } from '../../stores/recordStore'
import { calculateAge, formatDurationLong } from '../../utils/date'
import { getMonthlyTips } from '../../utils/monthlyTips'
import { takePhotoAndSave } from '../../utils/upload'
import { needLogin } from '../../utils/needLogin'
import { announcementApi } from '../../utils/request'
import { MOCK_BABY, MOCK_SUMMARY } from '../../utils/mock'
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
	{ type: 'height_weight', icon: '📏', label: '身高体重' },
	{ type: 'medicine', icon: '💊', label: '用药' },
	{ type: 'outdoor', icon: '🌳', label: '户外活动' },
]

const feedingMethodLabel: Record<string, string> = {
	breast: '母乳',
	formula: '奶粉',
	mixed: '混合',
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
	const announcementCheckingRef = useRef(false)

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
		title: '育娃手记 - 记录宝宝成长的每一天',
		path: '/pages/index/index',
	}))

	useShareTimeline(() => ({
		title: '育娃手记 - 记录宝宝成长的每一天',
		query: '',
	}))

	useDidShow(() => {
		showAnnouncementIfNeeded()
		if (isLoggedIn) {
			fetchBabies().then(() => {
				const baby = useBabyStore.getState().currentBaby
				if (baby) {
					fetchSummary(baby.id)
					fetchStats(baby.id)
				}
			})
		}
	})

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

	const navigateToRecord = async (type: string) => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
			return
		}
		if (type === 'photo') {
			takePhotoAndSave(currentBaby.id)
			return
		}
		Taro.navigateTo({
			url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}`,
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
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
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
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
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

	return (
		<View className="page">
			{/* 宝宝档案 */}
			<View className="baby-card">
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
							<Text>{displayBaby?.gender === 'male' ? '👦' : '👧'}</Text>
						)}
					</View>
					<View className="baby-info">
						<View className="baby-name-row">
							<Text className="baby-name">
								{displayBaby?.name || '未添加宝贝'}
							</Text>
							{displayBaby && (
								<View className={`baby-gender ${displayBaby.gender}`}>
									<Text className="baby-gender-icon">
										{displayBaby.gender === 'male' ? '♂' : '♀'}
									</Text>
								</View>
							)}
						</View>
						<Text className="baby-age">
							{displayAge
								? `${displayAge.months}个月 ${displayAge.days}天`
								: '添加宝宝档案后开始记录'}
						</Text>
					</View>
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
					</View>
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

			<TabBar />
		</View>
	)
}
