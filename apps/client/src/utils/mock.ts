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
