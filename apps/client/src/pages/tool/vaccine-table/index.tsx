import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import {
	VACCINE_SCHEDULE,
	getCurrentVaccineStage,
	VaccineScheduleItem,
} from '../../../utils/vaccineSchedule'
import { calculateAge } from '../../../utils/date'
import { trackEvent } from '../../../utils/request'
import { needLogin } from '../../../utils/needLogin'
import './index.scss'

// 静态数据直接在模块层分好组，页面不依赖登录态
const groups: { ageMonths: number; ageLabel: string; items: VaccineScheduleItem[] }[] = []
VACCINE_SCHEDULE.forEach(item => {
	const last = groups[groups.length - 1]
	if (last && last.ageMonths === item.ageMonths) {
		last.items.push(item)
	} else {
		groups.push({ ageMonths: item.ageMonths, ageLabel: item.ageLabel, items: [item] })
	}
})

export default function VaccineTablePage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()

	useDidShow(() => {
		trackEvent('tool_view', { name: 'vaccine_table' })
		if (isLoggedIn && !currentBaby) {
			fetchBabies().catch(() => undefined)
		}
	})

	useShareAppMessage(() => ({
		title: '宝宝疫苗接种时间表 · 育娃手记',
		path: '/pages/tool/vaccine-table/index',
	}))

	// 登录且有宝宝时，高亮宝宝当前所处的接种阶段
	const currentStageMonths =
		isLoggedIn && currentBaby?.birthday
			? getCurrentVaccineStage(calculateAge(currentBaby.birthday).months)[0]?.ageMonths
			: undefined

	const goTimeline = () => {
		if (!isLoggedIn) {
			needLogin()
			return
		}
		Taro.navigateTo({ url: '/pages/vaccine-timeline/index' })
	}

	return (
		<View className="vtable-page">
			<View className="vtable-intro">
				<Text className="vtable-intro-title">国家免疫规划疫苗</Text>
				<Text className="vtable-intro-sub">
					按月龄排列的常规接种时间参考（2021 版）
				</Text>
			</View>

			<View className="vtable-list">
				{groups.map((group, index) => {
					const isCurrent = group.ageMonths === currentStageMonths
					return (
						<View
							key={group.ageMonths}
							className={`vtable-group${isCurrent ? ' current' : ''}`}
							style={{ animationDelay: `${Math.min(index, 6) * 0.06}s` }}
						>
							<View className="vtable-group-header">
								<Text className="vtable-group-age">{group.ageLabel}</Text>
								{isCurrent && (
									<View className="vtable-group-badge">
										<Text>宝宝当前阶段</Text>
									</View>
								)}
							</View>
							<View className="vtable-chips">
								{group.items.map(item => (
									<View key={item.id} className="vtable-chip">
										<Text className="vtable-chip-name">{item.displayName}</Text>
									</View>
								))}
							</View>
							{group.items.some(item => item.note) && (
								<Text className="vtable-group-note">
									{group.items.find(item => item.note)?.note}
								</Text>
							)}
						</View>
					)
				})}
			</View>

			<View className="vtable-cta" onClick={goTimeline}>
				<View className="vtable-cta-body">
					<Text className="vtable-cta-title">查看宝宝的疫苗时间轴</Text>
					<Text className="vtable-cta-sub">
						{isLoggedIn
							? '记录已接种疫苗，订阅接种前提醒'
							: '登录后可记录接种、订阅提醒'}
					</Text>
				</View>
				<Text className="vtable-cta-arrow">›</Text>
			</View>

			<Text className="vtable-footer">
				各地疫苗品种、联合疫苗替代与补种安排可能不同，实际以接种门诊安排为准
			</Text>
		</View>
	)
}
