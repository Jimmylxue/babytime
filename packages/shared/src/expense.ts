/**
 * 养娃账本（育儿花费）共享定义。
 *
 * 分类是前后端唯一数据源：服务端用它校验/导出名称，客户端用它渲染图标和文案。
 * 新增分类只改这里，不需要 ALTER TABLE —— 数据库存的是 code 字符串。
 */

export type ExpenseCategoryCode =
  | 'diaper'
  | 'formula'
  | 'food'
  | 'feeding'
  | 'clothing'
  | 'toy'
  | 'medical'
  | 'daily'
  | 'travel'
  | 'other'

export interface ExpenseCategoryMeta {
  code: ExpenseCategoryCode
  label: string
  /** 客户端图标 key；服务端不用 */
  icon: string
  /** 客户端图标底色（与发现页 tint 同一套） */
  tint: 'pink' | 'blue' | 'sand' | 'cream' | 'lilac' | 'rose' | 'green' | 'gray'
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategoryMeta[] = [
  { code: 'diaper', label: '纸尿裤', icon: 'diaper', tint: 'pink' },
  { code: 'formula', label: '奶粉', icon: 'formula', tint: 'cream' },
  { code: 'food', label: '辅食', icon: 'food', tint: 'sand' },
  { code: 'feeding', label: '喂养用品', icon: 'feeding', tint: 'blue' },
  { code: 'clothing', label: '衣物', icon: 'clothing', tint: 'lilac' },
  { code: 'toy', label: '玩具绘本', icon: 'toy', tint: 'rose' },
  { code: 'medical', label: '医疗疫苗', icon: 'medical', tint: 'green' },
  { code: 'daily', label: '洗护日用', icon: 'daily', tint: 'blue' },
  { code: 'travel', label: '出行大件', icon: 'travel', tint: 'sand' },
  { code: 'other', label: '其他', icon: 'other', tint: 'gray' },
]

export const EXPENSE_CATEGORY_MAP: Record<ExpenseCategoryCode, ExpenseCategoryMeta> =
  EXPENSE_CATEGORIES.reduce(
    (map, item) => {
      map[item.code] = item
      return map
    },
    {} as Record<ExpenseCategoryCode, ExpenseCategoryMeta>,
  )

export const EXPENSE_CATEGORY_CODES: ExpenseCategoryCode[] = EXPENSE_CATEGORIES.map(
  (item) => item.code,
)

/** 数量单位：固定三选（客户端 chips 单选，服务端存字符串） */
export const EXPENSE_UNITS = ['包', '片', '罐'] as const
export type ExpenseUnit = (typeof EXPENSE_UNITS)[number]

export function isExpenseCategoryCode(value: string): value is ExpenseCategoryCode {
  return EXPENSE_CATEGORY_CODES.includes(value as ExpenseCategoryCode)
}

/** 未知 code 回退「其他」，保证旧数据/脏数据不会让页面崩 */
export function expenseCategoryLabel(code: string): string {
  return isExpenseCategoryCode(code) ? EXPENSE_CATEGORY_MAP[code].label : EXPENSE_CATEGORY_MAP.other.label
}

export interface Expense {
  id: string
  babyId: string
  actorUserId: string | null
  amount: number
  category: ExpenseCategoryCode
  itemName: string | null
  note: string | null
  /** 数量/规格，选填（如 60） */
  quantity: number | null
  /** 单位，选填（如 片、罐、包） */
  unit: string | null
  /** 记录人昵称：列表接口填充，用于家庭共享时显示「谁记的」 */
  actorName?: string | null
  /** 花费日期 YYYY-MM-DD（本地日历日） */
  expenseDate: string
  createdAt: string
  updatedAt: string
}

export interface ExpenseCategorySummary {
  category: ExpenseCategoryCode
  label: string
  amount: number
  count: number
  /** 占本月总额百分比，保留 1 位小数 */
  percent: number
}

export interface ExpenseMonthPoint {
  month: string
  total: number
}

export interface ExpenseTopExpense {
  amount: number
  category: ExpenseCategoryCode
  itemName: string | null
  expenseDate: string
}

export interface ExpenseBudgetInfo {
  /** 每月预算金额 */
  amount: number
  /** 已用百分比，可能超过 100 */
  usedPercent: number
  /** 剩余金额；超支时为负数 */
  remaining: number
  /** 是否超支 */
  isOver: boolean
}

export interface ExpenseMonthSummary {
  month: string
  total: number
  count: number
  dailyAvg: number
  prevTotal: number
  /** 上月为 0 时为 null，前端显示「上月无记录」 */
  deltaPercent: number | null
  byCategory: ExpenseCategorySummary[]
  topExpense: ExpenseTopExpense | null
  recentMonths: ExpenseMonthPoint[]
  /** 选中月份所在年份的累计支出（含之后月份，按当前库实际数据） */
  yearTotal: number
  yearCount: number
  /** 未设置预算时为 null */
  budget: ExpenseBudgetInfo | null
}

export interface ExpenseListResult {
  items: Expense[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}