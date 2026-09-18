import { calculateAge, formatDurationLong } from '../../utils/date'
import { deliverDailyPoster } from '../../utils/chartExport'
import { DailyMetric } from '../../utils/dailyPoster'
import { TodaySummary } from '../../stores/recordStore'

type DailyPosterPayload = Parameters<typeof deliverDailyPoster>[0]

interface DailyReportBaby {
	name: string
	avatar?: string
	gender: 'male' | 'female'
	birthday: string
}

// 组装今日日报海报数据（指标卡 + 自动小结文案）
export function buildDailyPosterData(
	summary: TodaySummary | null,
	baby: DailyReportBaby,
): DailyPosterPayload {
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
	const age = calculateAge(baby.birthday)
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
	if (summaryData.feedingCount > 0)
		highlights.push(`喂了${summaryData.feedingCount}次奶`)
	if (summaryData.sleepTotal > 0)
		highlights.push(`睡了${formatDurationLong(summaryData.sleepTotal)}`)
	if (summaryData.diaperCount > 0)
		highlights.push(`换了${summaryData.diaperCount}次尿布`)
	const reviewText = highlights.length
		? `今天${highlights.join('、')}，又是被好好照顾的一天～`
		: '今天还没有记录，去记一笔再来看看宝宝的日报吧～'

	return {
		babyName: baby.name,
		avatarUrl: baby.avatar,
		genderText: baby.gender === 'male' ? '男宝' : '女宝',
		dateText,
		ageText: `${age.months}个月 ${age.days}天`,
		metrics,
		reviewText,
	}
}
