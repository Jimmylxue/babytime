import { formatDuration, formatDurationLong } from './date'

// 支持"明细+间隔"展示的记录类型
export const detailTypeTabs = [
  { type: 'feeding', label: '喂奶', icon: '🍼' },
  { type: 'diaper', label: '换尿布', icon: '💩' },
  { type: 'sleep', label: '睡觉', icon: '😴' },
  { type: 'height_weight', label: '身高体重', icon: '📏' },
  { type: 'temperature', label: '体温', icon: '🌡️' },
]

export const feedingMethodLabel: Record<string, string> = { breast: '母乳', formula: '奶粉', mixed: '混合' }
export const diaperStatusLabel: Record<string, string> = { wet: '尿了', dirty: '拉了', both: '都有' }

/** 某条明细记录的主要展示文案，如 "母乳 150ml" / "混合 · 母乳80ml + 奶粉60ml" / "尿了" / "睡了 1小时30分" */
export function getRecordMainText(type: string, item: any): string {
  if (type === 'feeding') {
    if (item.feedingMethod === 'mixed') {
      return `混合 · 母乳${item.breastAmount || 0}ml + 奶粉${item.formulaAmount || 0}ml`
    }
    const method = feedingMethodLabel[item.feedingMethod] || item.feedingMethod
    return `${method}${item.amount ? ` ${item.amount}ml` : ''}`
  }
  if (type === 'diaper') {
    return diaperStatusLabel[item.diaperStatus] || item.diaperStatus
  }
  if (type === 'sleep') {
    return `睡了 ${formatDurationLong(item.duration || 0)}`
  }
  if (type === 'height_weight') {
    const parts: string[] = []
    if (item.height != null) parts.push(`${item.height}cm`)
    if (item.weight != null) parts.push(`${item.weight}kg`)
    return parts.join(' / ') || '-'
  }
  if (type === 'temperature') {
    return item.temperature != null ? `${item.temperature}°C` : '-'
  }
  return ''
}

/** 间隔展示文案，睡眠类型展示的是"清醒"时长，其余是"距上次" */
export function getIntervalText(type: string, intervalMinutes: number | null): string {
  if (intervalMinutes == null) return '首次记录'
  const labelMap: Record<string, string> = { sleep: '清醒', height_weight: '距上次', temperature: '距上次' }
  const label = labelMap[type] || '距上次'
  return `${label} ${formatDuration(intervalMinutes)}`
}

/** 表格等紧凑场景下的间隔展示文案，无"首次记录"时返回 "-" */
export function getIntervalShortText(intervalMinutes: number | null): string {
  return intervalMinutes == null ? '-' : formatDuration(intervalMinutes)
}
