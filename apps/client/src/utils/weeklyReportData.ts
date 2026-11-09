import { milestoneApi, photoApi, recordApi, type Milestone } from './request'
import type { Baby } from '../stores/babyStore'
import type { DailyStat, HeightWeightTrendPoint } from '../stores/recordStore'
import { calculateAgeAt, formatDate, formatDurationLong } from './date'
import { getLastCompleteWeek } from './weeklyReportRange'
import { findMilestone } from '@baby-time/shared'

export interface WeeklyPhoto {
	url: string
	thumbnail?: string
}

export interface WeeklyMilestone {
	id: string
	title: string
	date: string
	emoji: string
}

export interface WeeklyGrowthValue {
	first: number | null
	latest: number | null
	delta: number | null
}

export interface WeeklyReportData {
	weekStart: string
	weekEnd: string
	weekTitle: string
	babyName: string
	avatarUrl?: string
	genderText: string
	ageText: string
	activeDays: number
	spanDays: number
	feeding: { count: number; amount: number }
	sleep: { totalMinutes: number; perDayMinutes: number; totalText: string }
	diaper: { count: number }
	food: { count: number }
	water: { amount: number }
	bath: { count: number }
	outdoor: { count: number }
	height: WeeklyGrowthValue
	weight: WeeklyGrowthValue
	milestones: WeeklyMilestone[]
	photos: WeeklyPhoto[]
	photoTotal: number
	reviewText: string
	hasData: boolean
}

const WEEK_PHOTO_LIMIT = 6

function ageTextOf(birthday: string, onDate: Date): string {
	const { months, days } = calculateAgeAt(birthday, onDate)
	if (months < 12) return `${months}个月 ${days}天`
	const years = Math.floor(months / 12)
	const rest = months % 12
	return rest ? `${years}岁 ${rest}个月` : `${years}岁`
}

const num = (v: unknown): number | null => {
	if (v == null || v === '') return null
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

const round1 = (v: number) => Math.round(v * 10) / 10

function hasDailyData(d: DailyStat): boolean {
	return (
		d.feedingCount > 0 ||
		d.diaperCount > 0 ||
		d.sleepCount > 0 ||
		d.foodCount > 0 ||
		d.waterTotal > 0 ||
		(d.bathCount || 0) > 0 ||
		(d.outdoorCount || 0) > 0 ||
		(d.temperatureCount || 0) > 0 ||
		(d.heightWeightCount || 0) > 0 ||
		(d.medicineCount || 0) > 0 ||
		(d.vaccineCount || 0) > 0 ||
		(d.otherCount || 0) > 0
	)
}

function sum(list: DailyStat[], pick: (d: DailyStat) => number) {
	return list.reduce((acc, d) => acc + (pick(d) || 0), 0)
}

function growthValue(
	points: HeightWeightTrendPoint[],
	key: 'height' | 'weight',
	startKey: string,
	endKey: string,
): WeeklyGrowthValue {
	const values = points
		.map(point => ({ date: formatDate(point.date), value: num(point[key]) }))
		.filter(
			(point): point is { date: string; value: number } =>
				!!point.date &&
				point.date >= startKey &&
				point.date <= endKey &&
				point.value != null,
		)
		.sort((a, b) => a.date.localeCompare(b.date))
	if (values.length === 0) return { first: null, latest: null, delta: null }
	const first = values[0].value
	const latest = values[values.length - 1].value
	return {
		first,
		latest,
		delta: values.length > 1 ? round1(latest - first) : null,
	}
}

function buildReview(d: Omit<WeeklyReportData, 'reviewText' | 'hasData'>): string {
	const parts: string[] = []
	if (d.activeDays > 0) {
		parts.push(`上周你记录了 ${d.activeDays} 天，`)
	}
	if (d.feeding.count > 0) {
		parts.push(
			`喂了 ${d.feeding.count} 次奶${d.feeding.amount > 0 ? `（共 ${Math.round(d.feeding.amount)}ml）` : ''}，`,
		)
	}
	if (d.sleep.totalMinutes > 0) {
		parts.push(`睡了 ${formatDurationLong(d.sleep.totalMinutes)}，`)
	}
	if (d.diaper.count > 0) {
		parts.push(`换了 ${d.diaper.count} 次尿布，`)
	}
	if (d.food.count > 0) {
		parts.push(`吃了 ${d.food.count} 次辅食，`)
	}
	if (d.water.amount > 0) {
		parts.push(`喝了 ${Math.round(d.water.amount)}ml 水，`)
	}
	if (d.outdoor.count > 0) {
		parts.push(`出门 ${d.outdoor.count} 次，`)
	}
	if (d.bath.count > 0) {
		parts.push(`洗了 ${d.bath.count} 次澡，`)
	}
	if (d.photoTotal > 0) {
		parts.push(`留下了 ${d.photoTotal} 张照片，`)
	}

	const growthParts: string[] = []
	if (d.height.delta != null && d.height.delta > 0) {
		growthParts.push(`长高 ${d.height.delta}cm`)
	}
	if (d.weight.delta != null && d.weight.delta > 0) {
		growthParts.push(`重了 ${d.weight.delta}kg`)
	}
	if (growthParts.length > 0) {
		parts.push(`${growthParts.join('、')}，`)
	} else if (d.height.latest != null || d.weight.latest != null) {
		parts.push('记录了新的身高体重，')
	}

	if (d.milestones.length > 0) {
		const names = d.milestones
			.slice(0, 2)
			.map(item => `「${item.title}」`)
			.join('')
		const more =
			d.milestones.length > 2 ? `等 ${d.milestones.length} 个` : ''
		parts.push(`新打卡${names}${more}里程碑，`)
	}

	if (parts.length === 0) {
		return '上周还没有记录，新的一周从第一条开始吧。'
	}
	return `${parts.join('').replace(/，$/, '。')}每一周都值得被记住 ♡`
}

export async function fetchWeeklyReportData(baby: Baby): Promise<WeeklyReportData> {
	const week = getLastCompleteWeek()

	const [statsRes, growthRes, photoRes, milestoneRes] = await Promise.all([
		recordApi.getStats(baby.id, 14),
		recordApi.getGrowth(baby.id).catch(() => null),
		photoApi.getTimeline(baby.id, 1, 100).catch(() => null),
		milestoneApi.getByBaby(baby.id).catch(() => null),
	])

	const daily: DailyStat[] = (statsRes?.data?.dailyStats as DailyStat[]) || []
	const weekDays = daily
		.filter(day => day.date >= week.startKey && day.date <= week.endKey)
		.sort((a, b) => a.date.localeCompare(b.date))

	const activeDays = weekDays.filter(hasDailyData).length
	const feeding = {
		count: sum(weekDays, d => d.feedingCount),
		amount: sum(weekDays, d => d.totalMilk),
	}
	const sleepMinutes = sum(weekDays, d => d.sleepTotal)
	const sleep = {
		totalMinutes: sleepMinutes,
		perDayMinutes: activeDays > 0 ? Math.round(sleepMinutes / activeDays) : 0,
		totalText: formatDurationLong(sleepMinutes),
	}
	const diaper = { count: sum(weekDays, d => d.diaperCount) }
	const food = { count: sum(weekDays, d => d.foodCount) }
	const water = { amount: sum(weekDays, d => d.waterTotal) }
	const bath = { count: sum(weekDays, d => d.bathCount || 0) }
	const outdoor = { count: sum(weekDays, d => d.outdoorCount || 0) }

	const growthPoints: HeightWeightTrendPoint[] =
		(growthRes?.data as HeightWeightTrendPoint[]) || []
	const height = growthValue(growthPoints, 'height', week.startKey, week.endKey)
	const weight = growthValue(growthPoints, 'weight', week.startKey, week.endKey)

	const milestones: WeeklyMilestone[] = ((milestoneRes?.data as Milestone[]) || [])
		.filter(item => {
			const date = String(item.date || '').slice(0, 10)
			return date >= week.startKey && date <= week.endKey
		})
		.map(item => ({
			id: item.id,
			title: item.title,
			date: String(item.date).slice(0, 10),
			emoji: findMilestone(item.code)?.emoji || '⭐',
		}))
		.sort((a, b) => b.date.localeCompare(a.date))

	type PhotoGroup = { date?: string; photos?: WeeklyPhoto[] }
	const photoGroups = (photoRes?.data?.items as PhotoGroup[]) || []
	const photos: WeeklyPhoto[] = []
	const seen = new Set<string>()
	let photoTotal = 0
	for (const group of photoGroups) {
		const date = String(group.date || '').slice(0, 10)
		if (date < week.startKey || date > week.endKey) continue
		for (const photo of group.photos || []) {
			const key = photo.url || photo.thumbnail || ''
			if (!key || seen.has(key)) continue
			seen.add(key)
			photoTotal++
			if (photos.length < WEEK_PHOTO_LIMIT) photos.push(photo)
		}
	}

	const data: Omit<WeeklyReportData, 'reviewText' | 'hasData'> = {
		weekStart: week.startKey,
		weekEnd: week.endKey,
		weekTitle: week.label,
		babyName: baby.name,
		avatarUrl: baby.avatar,
		genderText: baby.gender === 'male' ? '男宝' : '女宝',
		ageText: ageTextOf(baby.birthday, week.end),
		activeDays,
		spanDays: 7,
		feeding,
		sleep,
		diaper,
		food,
		water,
		bath,
		outdoor,
		height,
		weight,
		milestones,
		photos,
		photoTotal,
	}

	return {
		...data,
		reviewText: buildReview(data),
		hasData:
			activeDays > 0 ||
			photoTotal > 0 ||
			milestones.length > 0 ||
			height.latest != null ||
			weight.latest != null,
	}
}
