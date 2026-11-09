/**
 * 排便规律分析。
 *
 * 场景：家长担心「宝宝三天没拉了」，但不知道这对自己宝宝算不算异常。
 * 婴儿排便频率个体差异极大（母乳宝宝可能 3~7 天一次也正常），
 * 所以本模块**只描述自己的规律**，不和「标准值」比较 ——
 * 拿别人的标准判断自己宝宝，是育儿焦虑的主要来源。
 *
 * 只做统计描述，不下判断。纯函数，today 由调用方传入。
 */

/** 判定为「排便」的尿布状态：dirty / both 才算，wet 只算尿 */
const STOOL_STATUSES = new Set(['dirty', 'both'])

/** 超过这么多天没排便，才给出「可以留意」的提示（婴儿个体差异大，阈值放宽） */
export const NO_STOOL_NOTICE_DAYS = 3

export interface DiaperPoint {
  /** ISO 时间或 Date */
  at: string | Date
  /** wet / dirty / both */
  status?: string | null
}

export interface StoolPattern {
  /** 统计区间内有几天拉过 */
  daysWithStool: number
  /** 统计区间的天数 */
  spanDays: number
  /** 期间排便总次数 */
  totalStools: number
  /** 平均间隔（小时）；样本少于 2 次时为 null */
  avgIntervalHours: number | null
  /** 最长一次间隔（小时） */
  longestGapHours: number | null
  /** 最近一次排便距 now 多少小时；从未有过则为 null */
  hoursSinceLast: number | null
  /** 最近一次排便时间 */
  lastAt: Date | null
  /** 是否达到「可以留意」的程度（超过 NO_STOOL_NOTICE_DAYS 天） */
  needsNotice: boolean
  /** 窗口内尿布记录总次数（含 wet）—— 用来判断「记录本身是否断了」 */
  totalDiapers: number
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * 从尿布记录里算出排便规律。
 *
 * @param points 尿布记录（顺序无关）
 * @param now 当前时间
 * @param spanDays 统计窗口天数（默认 14 天，只看最近两周）
 */
export function buildStoolPattern(
  points: DiaperPoint[],
  now: Date = new Date(),
  spanDays = 14,
): StoolPattern {
  const windowStart = new Date(now.getTime() - spanDays * 86400000)

  const all = points
    .map((p) => ({ at: toDate(p.at), status: p.status || null }))
    .filter((p) => !Number.isNaN(p.at.getTime()))

  const inWindow = all.filter((p) => p.at >= windowStart && p.at <= now)
  const stools = inWindow
    .filter((p) => p.status && STOOL_STATUSES.has(p.status))
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  // 「最近一次」要用全量数据算：窗口内没有不代表最近没拉（可能刚好在窗口边界外）
  const allStools = all
    .filter((p) => p.status && STOOL_STATUSES.has(p.status))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const lastAll = allStools.length > 0 ? allStools[allStools.length - 1] : null
  const hoursSinceLast = lastAll
    ? Math.max(0, (now.getTime() - lastAll.at.getTime()) / 3600000)
    : null

  const daysWithStool = new Set(
    stools.map((p) => {
      const d = p.at;
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  ).size

  let avgIntervalHours: number | null = null
  let longestGapHours: number | null = null
  if (stools.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < stools.length; i++) {
      gaps.push((stools[i].at.getTime() - stools[i - 1].at.getTime()) / 3600000)
    }
    avgIntervalHours =
      Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
    longestGapHours = Math.round(Math.max(...gaps) * 10) / 10
  }

  return {
    daysWithStool,
    spanDays,
    totalStools: stools.length,
    avgIntervalHours,
    longestGapHours,
    hoursSinceLast,
    lastAt: lastAll ? lastAll.at : null,
    needsNotice:
      hoursSinceLast != null && hoursSinceLast >= NO_STOOL_NOTICE_DAYS * 24,
    totalDiapers: inWindow.length,
  }
}

/** 平均间隔文案 */
export function stoolIntervalText(pattern: StoolPattern): string {
  if (pattern.totalStools === 0) {
    return pattern.totalDiapers === 0
      ? '最近没有尿布记录'
      : '这段时间没有排便记录'
  }
  if (pattern.avgIntervalHours == null) {
    return '样本太少，还看不出规律'
  }
  const hours = pattern.avgIntervalHours
  if (hours < 24) {
    return `平均每 ${Math.round(hours)} 小时一次`
  }
  const days = hours / 24
  return `平均每 ${days.toFixed(1).replace(/\.0$/, '')} 天一次`
}

/**
 * 「可以留意」的提示文案。
 *
 * 措辞要点：说「你宝宝之前的规律」，不说「正常应该」；
 * 说「可以留意」，不说「异常/便秘」。
 */
export function stoolNoticeText(pattern: StoolPattern): string | null {
  if (!pattern.needsNotice || pattern.hoursSinceLast == null) return null
  const days = Math.floor(pattern.hoursSinceLast / 24)
  const base = `已经 ${days} 天没有排便记录`
  // ⚠️ 判断的是「窗口内有没有任何尿布记录」（含 wet）。
  // 若用 totalStools 判断会永远走不到这个分支 —— 有排便记录时它必然 > 0，
  // 而没排便记录时才需要这条提示。真正要看的是家长有没有在记尿布。
  return pattern.totalDiapers === 0
    ? `${base}，最近两周也没有其他尿布记录，可能只是漏记了`
    : `${base}。如果宝宝精神好、吃奶正常，可以再观察；若伴腹胀哭闹请咨询儿科医生`
}
