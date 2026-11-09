import type { Baby } from '../stores/babyStore'
import type { TodaySummary, DailyStat } from '../stores/recordStore'

export const MOCK_BABY: Baby = {
  id: 'mock-baby-001',
  name: '示例宝宝',
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

const mockHeightWeightItems = buildMockTimeline('height_weight', [10], () => ({
  height: 68,
  weight: 8.2,
}))

const mockTemperatureItems = buildMockTimeline('temperature', [8, 14, 20], hour => ({
  temperature: hour === 14 ? 37.2 : 36.5,
}))

// 统计页补齐 tab 后，未登录预览也可能落在这些类型上；
// 缺 key 会让 MOCK_DETAIL[activeType].items 直接抛错，所以每类都要有兜底（哪怕是空数组）
const mockFoodItems = buildMockTimeline('food', [11, 17], hour => ({
  foodName: hour === 11 ? '高铁米粉' : '南瓜泥',
}))

const mockWaterItems = buildMockTimeline('water', [10, 15], () => ({ amount: 40 }))

const mockMedicineItems = buildMockTimeline('medicine', [9, 21], hour => ({
  medicineName: hour === 9 ? '维生素D' : '退热药',
  medicineDose: hour === 9 ? '1滴' : '2.5ml',
}))

const mockBathItems = buildMockTimeline('bath', [19], () => ({}))

const mockOutdoorItems = buildMockTimeline('outdoor', [16], () => ({
  outdoorLocation: '小区公园',
  duration: 45,
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
  height_weight: {
    items: mockHeightWeightItems,
    summary: { count: mockHeightWeightItems.length, latestHeight: 68, latestWeight: 8.2, avgIntervalMinutes: null },
  },
  temperature: {
    items: mockTemperatureItems,
    summary: { count: mockTemperatureItems.length, latestTemperature: 36.5, avgIntervalMinutes: 360 },
  },
  food: {
    items: mockFoodItems,
    summary: { count: mockFoodItems.length, avgIntervalMinutes: 360 },
  },
  water: {
    items: mockWaterItems,
    summary: { count: mockWaterItems.length, totalAmount: 80, avgIntervalMinutes: 300 },
  },
  medicine: {
    items: mockMedicineItems,
    summary: { count: mockMedicineItems.length, avgIntervalMinutes: 720 },
  },
  bath: {
    items: mockBathItems,
    summary: { count: mockBathItems.length, avgIntervalMinutes: null },
  },
  outdoor: {
    items: mockOutdoorItems,
    summary: { count: mockOutdoorItems.length, totalDuration: 45, avgIntervalMinutes: null },
  },
  vaccine: {
    items: [],
    summary: { count: 0, avgIntervalMinutes: null },
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
      // 补齐 tab 之后这几个指标也会被画出来，示例数据不能恒为 0（否则图表全是空柱子）
      bathCount: Math.random() > 0.35 ? 1 : 0,
      outdoorCount: Math.floor(Math.random() * 2) + (Math.random() > 0.5 ? 1 : 0),
      temperatureCount: Math.floor(Math.random() * 3),
      heightWeightCount: Math.random() > 0.8 ? 1 : 0,
      medicineCount: Math.random() > 0.85 ? 1 : 0,
      vaccineCount: Math.random() > 0.95 ? 1 : 0,
      otherCount: 0,
    })
  }
  return stats
}

export const MOCK_STATS = {
  dailyStats: generateMockDailyStats(7),
  heightWeightTrend: [
    { date: getDateStr(6), height: 67.2, weight: 7.9 },
    { date: getDateStr(4), height: 67.5, weight: 8.0 },
    { date: getDateStr(2), height: 67.8, weight: 8.1 },
    { date: getDateStr(0), height: 68, weight: 8.2 },
  ],
  temperatureTrend: [
    { date: `${getDateStr(2)}T08:20:00`, temperature: 36.5 },
    { date: `${getDateStr(1)}T14:10:00`, temperature: 37.1 },
    { date: `${getDateStr(1)}T20:40:00`, temperature: 36.8 },
    { date: `${getDateStr(0)}T08:00:00`, temperature: 36.6 },
  ],
  latestHeightWeight: { height: 68, weight: 8.2, date: getDateStr(0) },
  latestTemperature: { temperature: 36.5, date: getDateStr(0) },
}
