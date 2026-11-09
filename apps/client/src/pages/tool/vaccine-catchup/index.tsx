import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { recordApi, trackEvent } from '../../../utils/request'
import { needLogin } from '../../../utils/needLogin'
import { formatDate } from '../../../utils/date'
import {
	buildVaccineProgress,
	overdueText,
	type VaccineScheduleEntry,
} from '@baby-time/shared'
import './index.scss'

// 补种 / 逾期提醒。
// 只做时间提醒，不给接种方案 —— 补种间隔涉及减毒/灭活差异，必须由接种门诊决定。
export default function VaccineCatchUpPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [loading, setLoading] = useState(true)
	const [progress, setProgress] = useState<ReturnType<typeof buildVaccineProgress> | null>(null)
	const [hasBaby, setHasBaby] = useState(false)

	const loadData = async () => {
		if (!isLoggedIn) {
			setLoading(false)
			return
		}
		try {
			await fetchBabies()
			const baby = useBabyStore.getState().currentBaby
			if (!baby) {
				setHasBaby(false)
				return
			}
			setHasBaby(true)
			const res = await recordApi.getVaccines(baby.id)
			// 已登记接种的节点：records.vaccineScheduleItemId（自定义疫苗没有这个字段，不参与）
			const vaccinated = new Set<string>(
				(res.data || [])
					.map((record: { vaccineScheduleItemId?: string }) => record.vaccineScheduleItemId)
					.filter((id: string | undefined): id is string => !!id),
			)
			setProgress(buildVaccineProgress(baby.birthday, formatDate(new Date()), vaccinated))
		} catch (error) {
			// 错误提示由全局拦截器统一 toast
		} finally {
			setLoading(false)
		}
	}

	useDidShow(() => {
		void trackEvent('tool_view', { name: 'vaccine_catchup' })
		loadData()
	})

	useShareAppMessage(() => ({
		title: '宝宝疫苗补种提醒 · 育娃手记',
		path: '/pages/tool/vaccine-catchup/index',
	}))

	const goRecordVaccine = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/baby-edit/index' })
			return
		}
		const entry = progress?.mostUrgent
		const query = entry
			? `&scheduleItemId=${entry.item.id}`
			: ''
		Taro.navigateTo({
			url: `/pages/record/index?type=vaccine&babyId=${currentBaby.id}${query}`,
		})
	}

	const goTimeline = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		Taro.navigateTo({ url: '/pages/vaccine-timeline/index' })
	}

	const renderEntry = (entry: VaccineScheduleEntry, tone: 'overdue' | 'soon' | 'later') => (
		<View key={entry.item.id} className={`vc-row ${tone}`}>
			<View className="vc-row-main">
				<Text className="vc-row-name">{entry.item.displayName}</Text>
				<Text className="vc-row-date">参考日 {entry.referenceDate}</Text>
			</View>
			<Text className={`vc-row-status ${tone}`}>
				{tone === 'overdue'
					? overdueText(entry.daysUntil)
					: tone === 'soon'
						? entry.daysUntil === 0
							? '就是今天'
							: `${entry.daysUntil} 天后`
						: `${entry.item.ageLabel}`}
			</Text>
		</View>
	)

	return (
		<View className="vc-page">
			{!isLoggedIn || !hasBaby ? (
				<View className="vc-empty">
					<Text className="vc-empty-title">先添加宝宝档案</Text>
					<Text className="vc-empty-desc">
						建档后就能看到宝宝该打哪几针、有没有落下
					</Text>
					<View
						className="vc-empty-btn"
						onClick={() =>
							Taro.navigateTo({
								url: isLoggedIn ? '/pages/baby-edit/index' : '/pages/login/index',
							})
						}
					>
						<Text className="vc-empty-btn-text">
							{isLoggedIn ? '去创建宝宝' : '去登录'}
						</Text>
					</View>
				</View>
			) : loading ? (
				<View className="vc-state">
					<Text className="vc-state-text">加载中...</Text>
				</View>
			) : (
				<>
					{/* 进度概览 */}
					<View className="vc-hero">
						<Text className="vc-hero-label">已登记接种</Text>
						<View className="vc-hero-value">
							<Text className="vc-hero-num">{progress?.done ?? 0}</Text>
							<Text className="vc-hero-total">/ {progress?.total ?? 0} 剂</Text>
						</View>
						<Text className="vc-hero-hint">
							只统计在「时间轴」里登记过的针次，门诊记录仍以接种证为准
						</Text>
					</View>

					{/* 逾期 */}
					{(progress?.overdue.length ?? 0) > 0 && (
						<View className="vc-section">
							<View className="vc-section-head">
								<View className="vc-dot overdue" />
								<Text className="vc-section-title">
									可以问问门诊（{progress!.overdue.length} 针）
								</Text>
							</View>
							<View className="vc-list">
								{progress!.overdue.map(entry => renderEntry(entry, 'overdue'))}
							</View>
							<View className="vc-cta" onClick={goRecordVaccine}>
								<Text className="vc-cta-text">记录这几针的接种</Text>
							</View>
						</View>
					)}

					{/* 近期该打 */}
					{(progress?.dueSoon.length ?? 0) > 0 && (
						<View className="vc-section">
							<View className="vc-section-head">
								<View className="vc-dot soon" />
								<Text className="vc-section-title">
									两周内该接种（{progress!.dueSoon.length} 针）
								</Text>
							</View>
							<View className="vc-list">
								{progress!.dueSoon.map(entry => renderEntry(entry, 'soon'))}
							</View>
						</View>
					)}

					{/* 全部清零时的正反馈 */}
					{(progress?.overdue.length ?? 0) === 0 &&
						(progress?.dueSoon.length ?? 0) === 0 && (
							<View className="vc-section vc-allgood">
								<Text className="vc-allgood-title">暂时没有到期的针次</Text>
								<Text className="vc-allgood-desc">
									已登记的都记上了，后面该打的也会在这里提醒
								</Text>
							</View>
						)}

					{/* 后续安排（最多 6 条，剩下的去时间轴看） */}
					{(progress?.upcoming.length ?? 0) > 0 && (
						<View className="vc-section">
							<View className="vc-section-head">
								<View className="vc-dot later" />
								<Text className="vc-section-title">接下来</Text>
							</View>
							<View className="vc-list">
								{progress!.upcoming
									.slice(0, 6)
									.map(entry => renderEntry(entry, 'later'))}
							</View>
							<View className="vc-link" onClick={goTimeline}>
								<Text className="vc-link-text">查看完整接种时间轴 ›</Text>
							</View>
						</View>
					)}

					<Text className="vc-disclaimer">
						补种安排因地区、疫苗品种（减毒/灭活）和联合疫苗替代而异，
						本页只按参考日期提示时间，具体方案请咨询接种门诊。
					</Text>
				</>
			)}
		</View>
	)
}
