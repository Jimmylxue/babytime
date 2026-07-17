import type { Baby } from '../stores/babyStore'
import type { TodaySummary, DailyStat } from '../stores/recordStore'

export const MOCK_BABY: Baby = {
  id: 'mock-baby-001',
  name: '小宝',
  gender: 'male',
  birthday: '2025-11-10',
  createdAt: '2025-11-10T00:00:00.000Z',
}

export const MOCK_SUMMARY: TodaySummary = {
  feedingCount: 3,
  totalMilk: 420,
  diaperCount: 2,
  sleepTotal: 360,
  sleepCount: 2,
  foodCount: 1,
  waterTotal: 80,
  bathCount: 0,
  outdoorCount: 0,
}

export const MOCK_RECORDS = [
  {
    id: 'mock-r-1',
    babyId: 'mock-baby-001',
    type: 'feeding',
    startTime: new Date().toISOString(),
    feedingMethod: 'formula',
    amount: 150,
    note: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-r-2',
    babyId: 'mock-baby-001',
    type: 'diaper',
    startTime: new Date().toISOString(),
    diaperStatus: 'wet',
    note: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-r-3',
    babyId: 'mock-baby-001',
    type: 'sleep',
    startTime: new Date().toISOString(),
    duration: 180,
    note: '',
    createdAt: new Date().toISOString(),
  },
]

// 生成某一天内、以固定间隔分布的明细记录（用于未登录预览的统计页/明细页）
function buildMockTimeline(
  type: string,
  hours: number[],
  makeItem: (hour: number) => Record<string, any>,
): { id: string; type: string; startTime: string; intervalMinutes: number | null }[] {
  const today = new Date()
  let prevHour: number | null = null
  return hours.map((hour, idx) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, 0, 0)
    const intervalMinutes = prevHour == null ? null : (hour - prevHour) * 60
    prevHour = hour
    return {
      id: `mock-${type}-${idx}`,
      babyId: 'mock-baby-001',
      type,
      startTime: start.toISOString(),
      intervalMinutes,
      ...makeItem(hour),
    }
  })
}

const mockFeedingItems = buildMockTimeline('feeding', [7, 10, 13, 16, 19, 22], hour => {
  if (hour === 13) return { feedingMethod: 'mixed', breastAmount: 80, formulaAmount: 60, amount: 140 }
  if (hour === 22) return { feedingMethod: 'breast', amount: 0 }
  return { feedingMethod: 'formula', amount: 150 }
})

const mockDiaperItems = buildMockTimeline('diaper', [8, 12, 15, 20], hour => ({
  diaperStatus: hour === 12 ? 'both' : hour % 2 === 0 ? 'wet' : 'dirty',
}))

const mockSleepItems = buildMockTimeline('sleep', [9, 13, 20], hour => ({
  duration: hour === 20 ? 600 : 90,
}))

export const MOCK_DETAIL: Record<string, { items: any[]; summary: any }> = {
  feeding: {
    items: mockFeedingItems,
    summary: { count: mockFeedingItems.length, totalAmount: 440, avgIntervalMinutes: 180 },
  },
  diaper: {
    items: mockDiaperItems,
    summary: { count: mockDiaperItems.length, avgIntervalMinutes: 240 },
  },
  sleep: {
    items: mockSleepItems,
    summary: { count: mockSleepItems.length, totalDuration: 780, avgIntervalMinutes: 210 },
  },
}

function getDateStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function generateMockDailyStats(days: number): DailyStat[] {
  const stats: DailyStat[] = []
  for (let i = days - 1; i >= 0; i--) {
    stats.push({
      date: getDateStr(i),
      feedingCount: Math.floor(Math.random() * 4) + 3,
      totalMilk: Math.floor(Math.random() * 300) + 300,
      diaperCount: Math.floor(Math.random() * 4) + 2,
      sleepTotal: Math.floor(Math.random() * 200) + 300,
      sleepCount: Math.floor(Math.random() * 3) + 1,
      foodCount: Math.floor(Math.random() * 3),
      waterTotal: Math.floor(Math.random() * 100) + 50,
    })
  }
  return stats
}

export const MOCK_STATS = {
  dailyStats: generateMockDailyStats(7),
  latestHeightWeight: { height: 68, weight: 8.2, date: getDateStr(0) },
  latestTemperature: { temperature: 36.5, date: getDateStr(0) },
}
