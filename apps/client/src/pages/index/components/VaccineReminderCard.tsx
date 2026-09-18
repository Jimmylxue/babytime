import { View, Text, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { needLogin } from '../../../utils/needLogin'
import { formatDate } from '../../../utils/date'
import {
	notificationApi,
	trackEvent,
	VaccinePlanItem,
} from '../../../utils/request'
import vaccineSafety from '../../../assets/vaccine-safety.webp'

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

interface VaccineReminderCardProps {
	isLoggedIn: boolean
	babyId?: string
	/** 页面每次展示时递增，触发组件重新拉取订阅状态与下一针计划 */
	refreshKey: number
}

// 首页疫苗提醒卡：三态展示（已订阅/未开启/已过期）+ 订阅授权流程
export default function VaccineReminderCard({
	isLoggedIn,
	babyId,
	refreshKey,
}: VaccineReminderCardProps) {
	const [vaccineTemplateId, setVaccineTemplateId] = useState('')
	const [vaccineState, setVaccineState] = useState<
		'never' | 'active' | 'exhausted'
	>('never')
	const [nextVaccine, setNextVaccine] = useState<VaccinePlanItem | null>(null)
	const requestingRef = useRef(false)

	// 订阅配置、授权状态、下一针计划：随页面展示刷新
	useEffect(() => {
		if (!isLoggedIn) return
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
		if (!babyId) return
		setNextVaccine(null)
		notificationApi
			.getVaccinePlans(babyId)
			.then(res => {
				const today = formatDate(new Date())
				const next =
					(res.data || [])
						.filter(
							item => !item.completed && item.effectiveDate >= today,
						)
						.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ||
					null
				setNextVaccine(next)
			})
			.catch(() => setNextVaccine(null))
	}, [isLoggedIn, babyId, refreshKey])

	const requestVaccineSubscription = async () => {
		if (requestingRef.current) return
		if (!vaccineTemplateId) {
			Taro.showToast({ title: '提醒服务暂未配置', icon: 'none' })
			return
		}
		requestingRef.current = true
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
			requestingRef.current = false
		}
	}

	const goToTimeline = () => {
		Taro.navigateTo({
			url: `/pages/vaccine-timeline/index?babyId=${babyId || ''}`,
		})
	}

	const handleReminderCardClick = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (vaccineState === 'active') {
			goToTimeline()
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
		goToTimeline()
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

	// 登录后模板未配置（或未建宝宝）时不展示；未登录展示示例卡
	if (isLoggedIn && (!babyId || !vaccineTemplateId)) return null

	return (
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
					<>
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
					</>
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
	)
}
