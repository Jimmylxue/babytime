import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { recordApi, trackEvent } from '../../../utils/request'
import { needLogin } from '../../../utils/needLogin'
import { formatHM } from '../../../utils/date'
import {
	buildFeverEpisodes,
	currentEpisode,
	episodeText,
	feverCareHint,
	buildStoolPattern,
	stoolIntervalText,
	stoolNoticeText,
	HIGH_FEVER_THRESHOLD,
	NO_STOOL_NOTICE_DAYS,
	type FeverEpisode,
	type StoolPattern,
} from '@baby-time/shared'
import './index.scss'

// 健康分析：把散在记录里的体温/尿布整理成「一次病程」「排便规律」。
// 只做统计描述与就医提示，不下诊断。
export default function HealthPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [loading, setLoading] = useState(true)
	const [episodes, setEpisodes] = useState<FeverEpisode[]>([])
	const [stool, setStool] = useState<StoolPattern | null>(null)
	const [hasData, setHasData] = useState(false)

	const loadData = async () => {
		if (!isLoggedIn) {
			setLoading(false)
			return
		}
		try {
			await fetchBabies()
			const baby = useBabyStore.getState().currentBaby
			if (!baby) {
				setHasData(false)
				return
			}
			setHasData(true)
			const res = await recordApi.getHealthPoints(baby.id, 30)
			const data = res.data
			if (!data) return
			const now = new Date()
			setEpisodes(buildFeverEpisodes(data.temperatures || [], now))
			setStool(buildStoolPattern(data.diapers || [], now, 14))
		} catch (error) {
			// 错误提示由全局拦截器统一 toast
		} finally {
			setLoading(false)
		}
	}

	useDidShow(() => {
		void trackEvent('tool_view', { name: 'health_analysis' })
		loadData()
	})

	const goRecord = (type: string) => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/baby-edit/index' })
			return
		}
		Taro.navigateTo({
			url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}`,
		})
	}

	const formatTime = (date: Date) =>
		`${date.getMonth() + 1}/${date.getDate()} ${formatHM(date)}`

	const active = currentEpisode(episodes)
	const careHint = active ? feverCareHint(active) : null
	const stoolNotice = stool ? stoolNoticeText(stool) : null

	return (
		<View className="health-page">
			{!isLoggedIn || !hasData ? (
				<View className="health-empty">
					<Text className="health-empty-title">先添加宝宝档案</Text>
					<Text className="health-empty-desc">
						建档后就能看到发热病程和排便规律
					</Text>
					<View
						className="health-empty-btn"
						onClick={() =>
							Taro.navigateTo({
								url: isLoggedIn ? '/pages/baby-edit/index' : '/pages/login/index',
							})
						}
					>
						<Text className="health-empty-btn-text">
							{isLoggedIn ? '去创建宝宝' : '去登录'}
						</Text>
					</View>
				</View>
			) : loading ? (
				<View className="health-state">
					<Text className="health-state-text">加载中...</Text>
				</View>
			) : (
				<ScrollView scrollY className="health-scroll">
					{/* ── 发热病程 ── */}
					<View className="health-section">
						<View className="health-section-head">
							<View className="health-dot fever" />
							<Text className="health-section-title">发热病程</Text>
							<Text className="health-section-sub">近 30 天</Text>
						</View>

						{episodes.length === 0 ? (
							<View className="health-card health-card-empty">
								<Text className="health-empty-line">这段时间没有发热记录</Text>
								<View className="health-link" onClick={() => goRecord('temperature')}>
									<Text className="health-link-text">记一次体温 ›</Text>
								</View>
							</View>
						) : (
							<>
								{/* 正在发烧时置顶突出 */}
								{active && (
									<View className="health-card health-card-active">
										<View className="health-active-head">
											<Text className="health-active-badge">正在发热</Text>
											<Text className="health-active-time">
												最近 {formatTime(active.lastAt)}
											</Text>
										</View>
										<Text className="health-active-summary">
											{episodeText(active)}
										</Text>
										{careHint && (
											<Text className="health-care-hint">{careHint}</Text>
										)}
										{/* 就医时给医生看的一段话，可直接复制 */}
										<View
											className="health-copy"
											onClick={() => {
												Taro.setClipboardData({
													data: `宝宝发热情况：${formatTime(
														active.startedAt,
													)} 起，${episodeText(active)}。`,
													success: () =>
														Taro.showToast({ title: '已复制', icon: 'success' }),
												})
											}}
										>
											<Text className="health-copy-text">复制给医生看</Text>
										</View>
									</View>
								)}

								{/* 历史病程 */}
								{episodes
									.filter(e => !e.ongoing)
									.map(episode => (
										<View key={episode.startedAt.toISOString()} className="health-card">
											<View className="health-episode-head">
												<Text className="health-episode-when">
													{formatTime(episode.startedAt)}
												</Text>
												<Text className="health-episode-peak">
													最高 {episode.peak.toFixed(1)}℃
												</Text>
											</View>
											<Text className="health-episode-detail">
												{episodeText(episode)}
												{episode.highFeverReadings > 0
													? ` · ${episode.highFeverReadings} 次超 ${HIGH_FEVER_THRESHOLD}℃`
													: ''}
											</Text>
										</View>
									))}
							</>
						)}
					</View>

					{/* ── 排便规律 ── */}
					<View className="health-section">
						<View className="health-section-head">
							<View className="health-dot stool" />
							<Text className="health-section-title">排便规律</Text>
							<Text className="health-section-sub">近 14 天</Text>
						</View>

						{stool && (
							<View className={`health-card${stoolNotice ? ' health-card-warn' : ''}`}>
								<View className="health-stool-row">
									<View className="health-stool-metric">
										<Text className="health-stool-num">{stool.totalStools}</Text>
										<Text className="health-stool-label">次排便</Text>
									</View>
									<View className="health-stool-metric">
										<Text className="health-stool-num">{stool.daysWithStool}</Text>
										<Text className="health-stool-label">天有排便</Text>
									</View>
									<View className="health-stool-metric">
										<Text className="health-stool-num">
											{stool.hoursSinceLast == null
												? '-'
												: stool.hoursSinceLast < 24
													? `${Math.round(stool.hoursSinceLast)}h`
													: `${Math.floor(stool.hoursSinceLast / 24)}d`}
										</Text>
										<Text className="health-stool-label">距上次</Text>
									</View>
								</View>
								<Text className="health-stool-interval">
									{stoolIntervalText(stool)}
								</Text>
								{stoolNotice && (
									<Text className="health-stool-notice">{stoolNotice}</Text>
								)}
							</View>
						)}
					</View>

					<Text className="health-disclaimer">
						以上只是按记录做的统计，不能替代医生判断。
						宝宝精神差、持续高热、呼吸急促或您感到担心时，请及时就医。
						婴儿排便频率个体差异很大（{NO_STOOL_NOTICE_DAYS} 天只是一个温和的提示线）。
					</Text>
				</ScrollView>
			)}
		</View>
	)
}
