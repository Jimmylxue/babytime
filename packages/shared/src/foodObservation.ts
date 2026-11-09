import { diffDays } from './vaccineCatchUp'

/**
 * 新食物 3 天观察（6–12 月龄辅食核心痛点）。
 *
 * 为什么是 3 天：儿科常见做法是每次只引入一种新食物、连续观察 2–3 天再引入下一种，
 * 这样一旦出现反应能定位到具体食物。这里按「首次出现日期 + 3 天」算观察窗。
 *
 * 只做提示，不做诊断：出现皮疹/呕吐/腹泻请就医，本模块只回答「该食物还在观察期吗」。
 */

/** 观察窗长度（天）。1 = 首日，3 = 首日 + 2 天 */
export const FOOD_OBSERVE_DAYS = 3

export interface FoodIntroInput {
  /** 食物名称（同名的视作同一种食物） */
  foodName: string
  /** 吃这口的日期 YYYY-MM-DD */
  date: string
  /** 反应：none 无异常 / observe 继续观察 / reaction 有反应 */
  reaction?: string | null
}

export interface FoodIntroSummary {
  foodName: string
  /** 首次引入日期 */
  firstDate: string
  /** 今天是第几天（首日 = 1）；已过的观察窗可能 > 3 */
  dayIndex: number
  /** 是否还在观察窗内（dayIndex <= 3） */
  observing: boolean
  /** 观察窗内累计吃了几次 */
  times: number
  /** 是否有过 reaction 反应 */
  hasReaction: boolean
  /** 最近一次反应状态 */
  latestReaction: string | null
  /** 是否已经安全通过观察窗（满 3 天且无反应）*/
  passed: boolean
}

/**
 * 把一个宝宝的所有辅食记录聚合成「每种食物一行」的观察摘要。
 *
 * @param records 全部辅食记录（顺序无关，内部会排序）
 * @param today 今天 YYYY-MM-DD（由调用方传入，便于测试）
 * @param withinDays 只关心最近多少天内引入的食物，默认 30
 */
export function buildFoodIntros(
  records: FoodIntroInput[],
  today: string,
  withinDays = 30,
): FoodIntroSummary[] {
  const byFood = new Map<string, FoodIntroInput[]>()

  for (const record of records) {
    const name = (record.foodName || '').trim()
    if (!name) continue
    const list = byFood.get(name) ?? []
    list.push(record)
    byFood.set(name, list)
  }

  const summaries: FoodIntroSummary[] = []
  // shared 编译目标是 ES5，不能直接 for..of 迭代 Map（需要 downlevelIteration），
  // 所以先取 key 数组再逐个查（数组遍历 ES5 原生支持）
  const foodNames = Array.from(byFood.keys())
  for (const foodName of foodNames) {
    const list = byFood.get(foodName) as FoodIntroInput[]
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const firstDate = sorted[0].date
    const daysSinceFirst = diffDays(firstDate, today)
    // 首次日期在未来的脏数据：跳过，不显示「-1 天」
    if (daysSinceFirst < 0) continue
    // 太久以前引入的算不上「新食物观察」，只保留最近 withinDays 内首尝的
    if (daysSinceFirst > withinDays) continue

    const dayIndex = daysSinceFirst + 1
    const inWindow = sorted.filter((r) => diffDays(firstDate, r.date) < FOOD_OBSERVE_DAYS)
    const hasReaction = sorted.some((r) => r.reaction === 'reaction')
    const latestReaction =
      [...sorted].reverse().find((r) => !!r.reaction)?.reaction ?? null

    summaries.push({
      foodName,
      firstDate,
      dayIndex,
      observing: dayIndex <= FOOD_OBSERVE_DAYS,
      times: inWindow.length,
      hasReaction,
      latestReaction,
      passed: dayIndex > FOOD_OBSERVE_DAYS && !hasReaction,
    })
  }

  // 正在观察的排前面（最该看的），同组内按引入时间倒序（最近试的在前）
  return summaries.sort((a, b) => {
    if (a.observing !== b.observing) return a.observing ? -1 : 1
    return a.firstDate < b.firstDate ? 1 : a.firstDate > b.firstDate ? -1 : 0
  })
}

/**
 * 观察期文案。刻意不用「过敏」「安全」这类结论性词 ——
 * 只描述「第几天」「观察到什么时候」。
 */
export function foodObserveText(summary: FoodIntroSummary): string {
  if (summary.hasReaction) {
    return '这次有反应，建议先停 3 天再试，或咨询儿科医生'
  }
  if (summary.observing) {
    const left = FOOD_OBSERVE_DAYS - summary.dayIndex + 1
    return `观察第 ${summary.dayIndex} 天，还有 ${left} 天`
  }
  return '已观察满 3 天，没有记录到反应'
}
