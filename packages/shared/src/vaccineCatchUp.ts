import {
  TIMELINE_VACCINE_SCHEDULE,
  getVaccineReferenceDate,
  type VaccineScheduleItem,
} from './vaccineSchedule'

/**
 * 疫苗补种 / 逾期推算。
 *
 * 定位：**只做时间提醒，不做医学判断**。
 * 国家程序规定「未按程序完成接种者，只需补种未完成的剂次，无需重新开始」，
 * 所以这里算的是「哪几针还没打、参考日起已经晚了多久」，不会给间隔方案 ——
 * 具体补种间隔涉及减毒/灭活疫苗差异，必须由接种门诊决定。
 *
 * 所有函数都是纯函数，不依赖 Date.now()（today 由调用方传入），便于打桩验证。
 */

export interface VaccineScheduleEntry {
  item: VaccineScheduleItem
  /** 按出生日期推算的参考接种日 YYYY-MM-DD */
  referenceDate: string
  /** 相对今天：负数=已逾期天数，0=就是今天，正数=还有几天 */
  daysUntil: number
  status: 'done' | 'overdue' | 'due_soon' | 'upcoming'
}

export interface VaccineProgress {
  /** 已接种剂次 */
  done: number
  /** 时间轴内总剂次 */
  total: number
  /** 逾期未接种 */
  overdue: VaccineScheduleEntry[]
  /** 未来 14 天内该接种 */
  dueSoon: VaccineScheduleEntry[]
  /** 尚未到期，按参考日升序 */
  upcoming: VaccineScheduleEntry[]
  /** 最该先处理的一针（逾期最久的），没有则为 null */
  mostUrgent: VaccineScheduleEntry | null
}

const DAY_MS = 24 * 60 * 60 * 1000
/** 逾期定义：参考日已过，且未登记接种 */
const DUE_SOON_DAYS = 14

function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 两个 YYYY-MM-DD 之间的整天差（b - a），按本地日历算，避开 UTC 偏移 */
export function diffDays(a: string, b: string): number {
  const start = toLocalDate(a).getTime()
  const end = toLocalDate(b).getTime()
  return Math.round((end - start) / DAY_MS)
}

/**
 * 计算某个宝宝的接种进度。
 *
 * @param birthday 出生日期 YYYY-MM-DD
 * @param today 今天 YYYY-MM-DD（**由调用方传入，不要在函数内取当前时间**）
 * @param vaccinatedIds 已登记接种的 scheduleItemId 集合（来自 records.vaccineScheduleItemId）
 */
export function buildVaccineProgress(
  birthday: string,
  today: string,
  vaccinatedIds: Set<string>,
): VaccineProgress {
  const entries: VaccineScheduleEntry[] = TIMELINE_VACCINE_SCHEDULE.map((item) => {
    const referenceDate = getVaccineReferenceDate(birthday, item.ageMonths)
    const daysUntil = diffDays(today, referenceDate)
    const done = vaccinatedIds.has(item.id)
    let status: VaccineScheduleEntry['status']
    if (done) {
      status = 'done'
    } else if (daysUntil < 0) {
      status = 'overdue'
    } else if (daysUntil <= DUE_SOON_DAYS) {
      status = 'due_soon'
    } else {
      status = 'upcoming'
    }
    return { item, referenceDate, daysUntil, status }
  })

  // 逾期按「晚了最久」排前；dueSoon 按最近排前；upcoming 按参考日升序
  const overdue = entries
    .filter((e) => e.status === 'overdue')
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const dueSoon = entries
    .filter((e) => e.status === 'due_soon')
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const upcoming = entries
    .filter((e) => e.status === 'upcoming')
    .sort((a, b) => a.daysUntil - b.daysUntil)

  return {
    done: entries.filter((e) => e.status === 'done').length,
    total: entries.length,
    overdue,
    dueSoon,
    upcoming,
    mostUrgent: overdue[0] || null,
  }
}

/**
 * 逾期文案。刻意用「可以留意」「建议咨询门诊」而不是「必须补种」「已经延误」——
 * 各地程序与联合疫苗替代差异大，工具不该替医生下结论。
 */
export function overdueText(days: number): string {
  if (days === 0) return '今天到参考日'
  const n = Math.abs(days)
  if (n <= 7) return `已过参考日 ${n} 天`
  if (n <= 30) return `已过参考日 ${n} 天，可以问问接种门诊`
  if (n <= 180) return `已过参考日 ${n} 天，建议尽快咨询接种门诊`
  return `已过参考日 ${n} 天，建议咨询接种门诊确认补种安排`
}
