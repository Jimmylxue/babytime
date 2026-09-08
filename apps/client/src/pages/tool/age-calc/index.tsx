import { View, Text, Picker } from '@tarojs/components'
import { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { formatDate } from '../../../utils/date'
import { trackEvent } from '../../../utils/request'
import './index.scss'

const DAY_MS = 24 * 60 * 60 * 1000

// 在某日期基础上加整月，日期超月底时截到最后一天（同疫苗参考日期的算法）
function addMonthsClamped(dateStr: string, months: number): Date {
	const [year, month, day] = dateStr.split('-').map(Number)
	const target = new Date(year, month - 1 + months, 1)
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
	target.setDate(Math.min(day, lastDay))
	return target
}

function calcAgeDetail(birthday: string) {
	const today = new Date()
	const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const birth = addMonthsClamped(birthday, 0)
	if (birth > todayMidnight) return null

	let months =
		(today.getFullYear() - birth.getFullYear()) * 12 +
		(today.getMonth() - birth.getMonth())
	if (today.getDate() < birth.getDate()) months -= 1
	months = Math.max(0, months)

	const lastAnchor = addMonthsClamped(birthday, months)
	const days = Math.floor((todayMidnight.getTime() - lastAnchor.getTime()) / DAY_MS)
	const totalDays = Math.floor((todayMidnight.getTime() - birth.getTime()) / DAY_MS) + 1
	const next = addMonthsClamped(birthday, months + 1)
	const daysToNext = Math.max(
		0,
		Math.ceil((next.getTime() - todayMidnight.getTime()) / DAY_MS)
	)

	return {
		months,
		days,
		totalDays,
		years: Math.floor(months / 12),
		remMonths: months % 12,
		nextMonth: next.getMonth() + 1,
		nextDay: next.getDate(),
		daysToNext,
	}
}

export default function AgeCalcPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [birthday, setBirthday] = useState('')

	useDidShow(() => {
		trackEvent('tool_view', { name: 'age_calc' })
		if (isLoggedIn && !currentBaby) {
			fetchBabies().catch(() => undefined)
		}
		// 已登录且有宝宝时，默认填入当前宝宝的生日，少一步操作
		const baby = useBabyStore.getState().currentBaby
		if (!birthday && baby?.birthday) {
			setBirthday(baby.birthday)
		}
	})

	useShareAppMessage(() => ({
		title: '宝宝月龄计算器 · 育娃手记',
		path: '/pages/tool/age-calc/index',
	}))

	const handlePick = e => {
		setBirthday(e.detail.value)
	}

	const result = birthday ? calcAgeDetail(birthday) : null

	return (
		<View className="agecalc-page">
			<View className="agecalc-card form-card">
				<Text className="form-label">宝宝出生日期</Text>
				<Picker
					className="form-picker"
					mode="date"
					start="2010-01-01"
					end={formatDate(new Date())}
					value={birthday}
					onChange={handlePick}
				>
					<View className="form-picker-inner">
						<Text className={birthday ? 'form-picker-value' : 'form-picker-placeholder'}>
							{birthday || '点击选择出生日期'}
						</Text>
						<Text className="form-picker-arrow">▾</Text>
					</View>
				</Picker>
				{isLoggedIn && currentBaby && birthday === currentBaby.birthday && (
					<Text className="form-hint">已自动填入「{currentBaby.name}」的生日 🎂</Text>
				)}
			</View>

			{!result && (
				<View className="agecalc-card empty-card">
					<Text className="empty-emoji">🎂</Text>
					<Text className="empty-text">选好出生日期，马上告诉你宝宝多大了</Text>
				</View>
			)}

			{result && (
				<>
					<View className="agecalc-card result-card">
						<Text className="result-caption">宝宝现在的月龄</Text>
						<View className="result-hero">
							<Text className="result-hero-num">{result.months}</Text>
							<View className="result-hero-unit">
								<Text className="result-hero-unit-main">个月</Text>
								{result.days > 0 && (
									<Text className="result-hero-unit-sub">零 {result.days} 天</Text>
								)}
							</View>
						</View>
						{result.years > 0 && (
							<Text className="result-line">
								即 {result.years} 岁 {result.remMonths} 个月
								{result.days > 0 ? ` 零 ${result.days} 天` : ''}
							</Text>
						)}
						<Text className="result-line dim">出生第 {result.totalDays} 天</Text>
					</View>
					<View className="agecalc-card milestone-card">
						<Text className="milestone-emoji">🎈</Text>
						<View className="milestone-body">
							<Text className="milestone-title">
								距离 {result.months + 1} 个月纪念日还有 {result.daysToNext} 天
							</Text>
							<Text className="milestone-sub">
								（{result.nextMonth} 月 {result.nextDay} 日）
							</Text>
						</View>
					</View>
				</>
			)}

			<Text className="agecalc-footer">计算结果按自然月推算，仅供日常参考</Text>
		</View>
	)
}
