import { View, Text, Picker, Input } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { trackEvent } from '../../../utils/request'
import { needLogin } from '../../../utils/needLogin'
import './index.scss'

const AGE_OPTIONS = Array.from({ length: 37 }, (_, i) => ({
	value: i,
	label: i === 0 ? '新生儿（未满月）' : `${i} 个月`,
}))

function roundTo(value: number, step: number) {
	return Math.round(value / step) * step
}

interface MilkReference {
	stageLabel: string
	totalText: string
	totalHint: string
	feedsText: string
	perFeedText?: string
	note?: string
}

function milkReference(ageMonths: number, weightKg?: number): MilkReference {
	if (ageMonths < 6) {
		const feeds =
			ageMonths < 1 ? [8, 12] : ageMonths < 2 ? [7, 9] : ageMonths < 4 ? [6, 8] : [5, 7]
		if (weightKg && weightKg >= 2.5 && weightKg <= 15) {
			const low = roundTo(weightKg * 120, 10)
			const typical = roundTo(weightKg * 150, 10)
			const high = roundTo(weightKg * 180, 10)
			return {
				stageLabel: AGE_OPTIONS[ageMonths].label,
				totalText: `${low} ~ ${high}`,
				totalHint: `按体重 ${weightKg}kg 估算（120~180 ml/kg），常见约 ${typical}`,
				feedsText: `一天约 ${feeds[0]} ~ ${feeds[1]} 顿`,
				perFeedText: `每顿约 ${roundTo(low / feeds[1], 5)} ~ ${roundTo(high / feeds[0], 5)} ml`,
				note: '小月龄按需喂养优先，不必刻意凑数字',
			}
		}
		return {
			stageLabel: AGE_OPTIONS[ageMonths].label,
			totalText: '填体重后估算',
			totalHint: weightKg
				? `体重 ${weightKg}kg 超出小月龄常见范围（2.5~15kg），请检查后重填`
				: '小月龄可按每天每公斤体重 120~180 ml 估算，填上体重帮您算',
			feedsText: `一天约 ${feeds[0]} ~ ${feeds[1]} 顿`,
			note: weightKg ? undefined : '体重在下方选填',
		}
	}
	if (ageMonths < 12) {
		return {
			stageLabel: AGE_OPTIONS[ageMonths].label,
			totalText: '600 ~ 800',
			totalHint: '辅食逐渐成为重要营养来源，奶量逐步回落',
			feedsText: '一天约 3 ~ 4 顿奶，同时安排辅食',
		}
	}
	if (ageMonths < 24) {
		return {
			stageLabel: AGE_OPTIONS[ageMonths].label,
			totalText: '400 ~ 600',
			totalHint: '三餐两点逐渐成型，奶是重要补充',
			feedsText: '一天约 2 ~ 3 顿',
		}
	}
	return {
		stageLabel: AGE_OPTIONS[ageMonths].label,
		totalText: '300 ~ 500',
		totalHint: '可以开始尝试酸奶、奶酪等奶制品',
		feedsText: '一天约 2 顿，可用奶制品部分替代',
	}
}

export default function MilkCalcPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const [ageMonths, setAgeMonths] = useState(2)
	const [weight, setWeight] = useState('')

	useDidShow(() => {
		trackEvent('tool_view', { name: 'milk_calc' })
	})

	useShareAppMessage(() => ({
		title: '宝宝奶量估算器 · 育娃手记',
		path: '/pages/tool/milk-calc/index',
	}))

	const weightNum = Number(weight)
	const ref = milkReference(ageMonths, weight && !Number.isNaN(weightNum) ? weightNum : undefined)

	const goFeeding = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/baby-edit/index' })
			return
		}
		Taro.navigateTo({ url: `/pages/feeding/index?babyId=${currentBaby.id}` })
	}

	return (
		<View className="milkcalc-page">
			<View className="milkcalc-card form-card">
				<Text className="form-label">宝宝月龄</Text>
				<Picker
					className="form-picker"
					mode="selector"
					range={AGE_OPTIONS.map(option => option.label)}
					value={ageMonths}
					onChange={e => setAgeMonths(Number(e.detail.value))}
				>
					<View className="form-picker-inner">
						<Text className="form-picker-value">{AGE_OPTIONS[ageMonths].label}</Text>
						<Text className="form-picker-arrow">▾</Text>
					</View>
				</Picker>
				<Text className="form-label weight-label">当前体重（kg，选填）</Text>
				<View className="form-picker-inner">
					<Input
						className="form-input"
						type="digit"
						placeholder="如 6.5"
						value={weight}
						onInput={e => setWeight(e.detail.value)}
					/>
					<Text className="form-picker-unit">kg</Text>
				</View>
			</View>

			<View className="milkcalc-card result-card">
				<Text className="result-caption">{ref.stageLabel} · 每日奶量参考</Text>
				{ref.totalText.match(/^\d/) ? (
					<Text className="result-total">
						{ref.totalText}
						<Text className="result-unit"> ml / 天</Text>
					</Text>
				) : (
					<Text className="result-total pending">{ref.totalText}</Text>
				)}
				<Text className="result-hint">{ref.totalHint}</Text>
				<View className="result-divider" />
				<Text className="result-row">🍼 {ref.feedsText}</Text>
				{ref.perFeedText && <Text className="result-row">{ref.perFeedText}</Text>}
				{ref.note && <Text className="result-note">{ref.note}</Text>}
			</View>

			<View className="milkcalc-cta" onClick={goFeeding}>
				<Text className="milkcalc-cta-text">去记一笔喂奶 ›</Text>
			</View>

			<Text className="milkcalc-footer">
				估算结果仅供参考，按需喂养优先，具体情况请遵医嘱
			</Text>
		</View>
	)
}
