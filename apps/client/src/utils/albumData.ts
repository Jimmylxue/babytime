/**
 * 成长纪念册：把记录聚合成一张海报所需的全部数据。
 *
 * 为什么全部在客户端算：现有服务端只有 `getStats(days)` 这种「最近 N 天」的滑动窗口，
 * 没有自然月接口，记录列表接口又只支持单日查询。而 getStats 传 60 天时返回的是
 * **按日分组的数组**，所以客户端完全可以自己筛出目标月份 —— 不需要改服务端。
 */
import { recordApi, photoApi } from './request'
import type { Baby } from '../stores/babyStore'
import type { DailyStat } from '../stores/recordStore'

/** 纪念册覆盖的时间范围 */
type Scope = 'lastMonth' | 'recent30'

/** 照片墙的槽位数（3 列 × 2 行） */
export const PHOTO_TARGET = 6

/** 纪念册里的一张照片：url 必填，thumbnail 可能没有 */
export interface AlbumPhoto {
  url: string
  thumbnail?: string
}

export interface AlbumData {
  babyName: string
  avatarUrl?: string
  genderText: string
  /** 范围标题，如「2026 年 8 月」或「最近 30 天」 */
  rangeTitle: string
  /** 副标题，如「出生第 8 个月」 */
  ageText: string
  /** 这个范围里实际有记录的天数 */
  activeDays: number
  /** 范围覆盖的总天数 */
  spanDays: number
  feeding: { count: number; amount: number }
  sleep: { totalHours: number; hoursPerDay: number }
  diaper: { count: number }
  /** 期初 / 期末，任一端缺失则为 null */
  height: { from: number | null; to: number | null }
  weight: { from: number | null; to: number | null }
  /** 最多 PHOTO_TARGET 张照片；带上 thumbnail 以便渲染时降级重试 */
  photos: AlbumPhoto[]
  /** 结语：只用可验证的数据事实，不写发育里程碑 */
  reviewText: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** 某天是否有任何记录 */
const hasData = (d: DailyStat) =>
  d.feedingCount > 0 ||
  d.diaperCount > 0 ||
  d.sleepCount > 0 ||
  d.foodCount > 0 ||
  d.waterTotal > 0

const sum = (list: DailyStat[], pick: (d: DailyStat) => number) =>
  list.reduce((acc, d) => acc + (pick(d) || 0), 0)

/**
 * 把接口返回的值转成数字。
 *
 * ⚠️ 不能省：`height` / `weight` / `temperature` 在数据库里是 `decimal`，
 * mysql2 会把 DECIMAL 作为**字符串**返回（如 "68.2"），TypeORM 不做隐式转换。
 * 服务端的 `getStats` 里显式写了 `Number(record.height)` 所以 trend 接口没事，
 * 但 `getDetail` 返回的是原始实体展开（`{ ...record }`），拿到的是字符串。
 * 直接把字符串当数字用，会在 `.toFixed()` 处抛 TypeError 整张图渲染失败。
 */
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 保留一位小数；非数字或负零一律给 null，避免结语里出现 "NaN" / "-0" */
const round1 = (v: unknown): number | null => {
  const n = num(v)
  if (n == null) return null
  const r = Math.round(n * 10) / 10
  return r === 0 ? 0 : r
}

/** 月龄文案，如「出生第 8 个月」 */
function ageTextOf(birthday: string): string {
  const b = new Date(birthday)
  const now = new Date()
  const months =
    (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (!Number.isFinite(months) || months < 0) return ''
  return `出生第 ${months} 个月`
}

/**
 * 结语只写「能从数据里算出来的事」。
 * ⚠️ 不要写「会翻身了」「能坐了」这类发育里程碑 —— 数据里没有记录依据，
 * 说错了会让家长觉得这个 App 在瞎编，反而伤信任。
 */
function buildReview(
  d: Pick<AlbumData, 'activeDays' | 'spanDays' | 'feeding' | 'height' | 'weight'>,
): string {
  const lines: string[] = []
  if (d.activeDays > 0) {
    lines.push(`这段日子你记录了 ${d.activeDays} 天，`)
  }
  if (d.feeding.count > 0) {
    lines.push(`喂了 ${d.feeding.count} 次奶。`)
  }
  const hDelta = round1(
    d.height.from != null && d.height.to != null ? d.height.to - d.height.from : null,
  )
  const wDelta = round1(
    d.weight.from != null && d.weight.to != null ? d.weight.to - d.weight.from : null,
  )
  if (hDelta != null && hDelta > 0 && wDelta != null && wDelta > 0) {
    lines.push(`长高了 ${hDelta} cm，重了 ${wDelta} kg。`)
  } else if (wDelta != null && wDelta > 0) {
    lines.push(`重了 ${wDelta} kg。`)
  } else if (hDelta != null && hDelta > 0) {
    lines.push(`长高了 ${hDelta} cm。`)
  }
  lines.push('每一天都值得被记住 ♡')
  return lines.join('')
}

export async function fetchAlbumData(baby: Baby): Promise<AlbumData> {
  // 60 天足够覆盖「上一个完整自然月」；今天的日期用于确定月份边界
  const [statsRes, growthRes, photoRes] = await Promise.all([
    recordApi.getStats(baby.id, 60),
    recordApi
      .getDetail(baby.id, 'height_weight', { days: 60, page: 1, pageSize: 60 })
      .catch(() => null),
    photoApi.getTimeline(baby.id, 1, 30).catch(() => null),
  ])

  const daily: DailyStat[] = statsRes?.data?.dailyStats || []

  // ── 决定范围：优先「上一个完整自然月」，没数据就退回「最近 30 天」──
  const now = new Date()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const lmStart = ymd(lastMonthStart)
  const lmEnd = ymd(lastMonthEnd)

  const inLastMonth = daily.filter(d => d.date >= lmStart && d.date <= lmEnd)
  const lastMonthHasData = inLastMonth.some(hasData)

  let scope: DailyStat[]
  let scopeKind: Scope
  if (lastMonthHasData) {
    scope = inLastMonth
    scopeKind = 'lastMonth'
  } else {
    scope = daily.slice(-30)
    scopeKind = 'recent30'
  }

  const scopeStart = scope.length ? scope[0].date : ''
  const scopeEnd = scope.length ? scope[scope.length - 1].date : ''
  const inScopeDate = (iso?: string) =>
    !!iso && !!scopeStart && iso.slice(0, 10) >= scopeStart && iso.slice(0, 10) <= scopeEnd

  const activeDays = scope.filter(hasData).length
  const spanDays = scope.length

  // ── 身高体重：取范围内最早 / 最晚各一次测量 ──
  // 注意 height/weight 是 decimal，接口给的是字符串，必须走 num() 转换
  type GrowthRec = {
    startTime: string
    height?: number | string | null
    weight?: number | string | null
  }
  const growth: GrowthRec[] = (growthRes?.data?.items as GrowthRec[]) || []
  const inScope = growth
    .filter(r => inScopeDate(r.startTime))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const firstNum = (pick: (r: GrowthRec) => unknown): number | null => {
    for (const r of inScope) {
      const v = num(pick(r))
      if (v != null) return v
    }
    return null
  }
  const lastNum = (pick: (r: GrowthRec) => unknown): number | null => {
    for (let i = inScope.length - 1; i >= 0; i--) {
      const v = num(pick(inScope[i]))
      if (v != null) return v
    }
    return null
  }

  const heightFrom = firstNum(r => r.height)
  const heightTo = lastNum(r => r.height)
  const weightFrom = firstNum(r => r.weight)
  const weightTo = lastNum(r => r.weight)

  // ── 照片：优先范围内，不足 6 张就用最近的照片补足 ──
  // 只按范围筛会让「这些瞬间」经常只剩一两张（照片墙空着更糟），
  // 所以先取范围内的，再从最近往前补，去重后凑到 6 张为止。
  type PhotoItem = { url: string; thumbnail?: string }
  type PhotoGroup = { date?: string; photos?: PhotoItem[] }
  const photoGroups = (photoRes?.data?.items as PhotoGroup[]) || []
  const allPhotos = photoGroups.flatMap(g => g.photos || [])
  const inScopePhotos = photoGroups
    .filter(g => inScopeDate(g.date))
    .flatMap(g => g.photos || [])

  const picked: PhotoItem[] = []
  const seen = new Set<string>()
  for (const p of [...inScopePhotos, ...allPhotos]) {
    const key = p.url || p.thumbnail || ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    picked.push(p)
    if (picked.length >= PHOTO_TARGET) break
  }

  const feeding = {
    count: sum(scope, d => d.feedingCount),
    amount: sum(scope, d => d.totalMilk),
  }
  const sleepMinutes = sum(scope, d => d.sleepTotal)
  const sleep = {
    totalHours: +(sleepMinutes / 60).toFixed(1),
    hoursPerDay: activeDays > 0 ? +(sleepMinutes / 60 / activeDays).toFixed(1) : 0,
  }
  const diaper = { count: sum(scope, d => d.diaperCount) }

  const rangeTitle =
    scopeKind === 'lastMonth'
      ? `${lastMonthStart.getFullYear()} 年 ${lastMonthStart.getMonth() + 1} 月`
      : '最近 30 天'

  const payload = {
    activeDays,
    spanDays,
    feeding,
    height: { from: heightFrom, to: heightTo },
    weight: { from: weightFrom, to: weightTo },
  }

  return {
    babyName: baby.name,
    avatarUrl: baby.avatar,
    genderText: baby.gender === 'male' ? '男宝' : '女宝',
    rangeTitle,
    ageText: ageTextOf(baby.birthday),
    ...payload,
    sleep,
    diaper,
    photos: picked,
    reviewText: buildReview(payload),
  }
}
