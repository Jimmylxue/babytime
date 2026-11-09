import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { trackEvent } from '../../../utils/request'
import { needLogin } from '../../../utils/needLogin'
import { calculateAge, formatDate } from '../../../utils/date'
import {
	CHECKUP_SCHEDULE,
	getCheckupReferenceDate,
	type CheckupScheduleItem,
} from '@baby-time/shared'
import './index.scss'

// 儿保体检时间表：与国家免疫规划的疫苗时间轴互补（那张管打针，这张管体检）。
// 本地完成状态存在 storage —— 体检不像疫苗有严格的「记录」需求，
// 用户只要知道「哪次做过了、下次什么时候」，不必为它建表。
const DONE_KEY = 'checkup:done'

type DoneMap = Record<string, string> // itemId -> 完成日期

function loadDone(): DoneMap {
	try {
		const raw = Taro.getStorageSync(DONE_KEY)
		return raw && typeof raw === 'object' ? (raw as DoneMap) : {}
	} catch {
		return {}
	}
}

export default function CheckupPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [done, setDone] = useState<DoneMap>({})
	const [hasBaby, setHasBaby] = useState(false)

	useDidShow(() => {
		void trackEvent('tool_view', { name: 'checkup_schedule' })
		setDone(loadDone())
		const run = async () => {
			if (!isLoggedIn) return
			await fetchBabies()
			setHasBaby(!!useBabyStore.getState().currentBaby)
		}
		void run()
	})

	const toggleDone = (item: CheckupScheduleItem) => {
		const next = { ...done }
		if (next[item.id]) {
			delete next[item.id]
			// 取消时也清掉，避免留下过期条目
			setDone(next)
			Taro.setStorageSync(DONE_KEY, next)
			Taro.showToast({ title: '已取消标记', icon: 'none' })
			return
		}
		toggleConfirm(item, next)
	}

	const toggleConfirm = (item: CheckupScheduleItem, next: DoneMap) => {
		Taro.showModal({
			title: '标记为已体检',
			content: `把「${item.title}」记为已完成？只在本机保存，不影响宝宝记录。`,
			confirmText: '标记完成',
		}).then(res => {
			if (!res.confirm) return
			next[item.id] = formatDate(new Date())
			setDone({ ...next })
			Taro.setStorageSync(DONE_KEY, next)
			Taro.showToast({ title: '已标记', icon: 'success' })
		})
	}

	const baby = currentBaby
	const ageMonths = baby ? calculateAge(baby.birthday).months : null

	// 按参考日期分组：已过期未做 / 该做了 / 未来
	const rows = CHECKUP_SCHEDULE.map(item => {
		const referenceDate = baby
			? getCheckupReferenceDate(baby.birthday, item.ageMonths)
			: null
		const isDone = !!done[item.id]
		const today = formatDate(new Date())
		const overdue = !!referenceDate && !isDone && referenceDate < today
		const isNext =
			!isDone && !!referenceDate && referenceDate >= today && ageMonths === item.ageMonths
		return { item, referenceDate, isDone, overdue, isNext }
	})

	const pendingCount = rows.filter(r => !r.isDone && r.overdue).length
	const doneCount = rows.filter(r => r.isDone).length

	return (
		<View className="ck-page">
			<ScrollView scrollY className="ck-scroll">
				{/* 未建档提示：时间表本身有参考价值，所以不遮挡，只在顶部提醒 */}
				{isLoggedIn && !hasBaby && (
					<View
						className="ck-notice"
						onClick={() => Taro.navigateTo({ url: '/pages/baby-edit/index' })}
					>
						<Text className="ck-notice-text">
							还没有宝宝档案，下面的参考日期暂时算不出来 · 去创建 ›
						</Text>
					</View>
				)}

				{/* 概览 */}
				<View className="ck-hero">
					<View className="ck-hero-row">
						<View className="ck-hero-item">
							<Text className="ck-hero-num">{doneCount}</Text>
							<Text className="ck-hero-label">已体检</Text>
						</View>
						<View className="ck-hero-item">
							<Text className="ck-hero-num">{CHECKUP_SCHEDULE.length - doneCount}</Text>
							<Text className="ck-hero-label">待体检</Text>
						</View>
						<View className="ck-hero-item">
							<Text className={`ck-hero-num${pendingCount > 0 ? ' warn' : ''}`}>
								{pendingCount}
							</Text>
							<Text className="ck-hero-label">已过参考日</Text>
						</View>
					</View>
					<Text className="ck-hero-hint">
						{baby
							? `${baby.name} 现在 ${ageMonths} 个月，参考日期按出生日推算`
							: '添加宝宝档案后显示参考日期'}
					</Text>
				</View>

				{/* 时间轴 */}
				<View className="ck-list">
					{rows.map(({ item, referenceDate, isDone, overdue, isNext }) => (
						<View
							key={item.id}
							className={`ck-row${isDone ? ' done' : ''}${overdue ? ' overdue' : ''}${isNext ? ' next' : ''}`}
							onClick={() => (isLoggedIn ? toggleDone(item) : needLogin())}
						>
							<View className="ck-rail">
								<View className={`ck-node${isDone ? ' done' : ''}${overdue ? ' overdue' : ''}${isNext ? ' next' : ''}`}>
									{isDone && <Text className="ck-node-check">✓</Text>}
								</View>
								<View className="ck-line" />
							</View>
							<View className="ck-body">
								<View className="ck-body-head">
									<Text className="ck-age">{item.ageLabel}</Text>
									{isNext && <Text className="ck-badge next">该做了</Text>}
									{overdue && <Text className="ck-badge overdue">可补做</Text>}
									{isDone && (
										<Text className="ck-badge done">已完成 {done[item.id]}</Text>
									)}
								</View>
								<Text className="ck-title">{item.title}</Text>
								<Text className="ck-focus">{item.focus}</Text>
								{referenceDate && !isDone && (
									<Text className={`ck-date${overdue ? ' overdue' : ''}`}>
										参考日 {referenceDate}
									</Text>
								)}
							</View>
						</View>
					))}
				</View>

				<Text className="ck-disclaimer">
					依据《国家基本公共卫生服务规范》儿童健康管理的检查月龄整理，
					各地实际项目与频次可能不同，以当地社区卫生服务中心安排为准。
					点击任意一项可标记「已体检」，仅保存在本机。
				</Text>
			</ScrollView>
		</View>
	)
}
