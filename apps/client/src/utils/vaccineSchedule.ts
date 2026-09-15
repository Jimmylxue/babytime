export interface VaccineScheduleItem {
  id: string
  ageMonths: number
  ageLabel: string
  vaccineCode: string
  vaccineName: string
  dose: number
  displayName: string
  note?: string
  /** 仅作参考展示，不进宝宝时间轴与提醒（如 13 周岁的 HPV） */
  referenceOnly?: boolean
}

// 依据《国家免疫规划疫苗儿童免疫程序及说明（2026年版）》
// （国疾控卫免发〔2026〕16号，2026-06-17 印发；百白破新程序自 2025-01-01 起实施）
export const VACCINE_SCHEDULE_VERSION = 'cn-nip-2026'

// 国家免疫规划常规接种时间参考。各地品种、联合疫苗替代和补种安排可能不同，实际以接种门诊安排为准。
//
// ⚠️ 节点 id 是历史延续的稳定标识：vaccine_plans.schedule_item_id 与
// records.vaccine_schedule_item_id 都引用它，改名会让用户已设的计划和已记的接种「失联」。
// 所以 2026 版调整只改 月龄/剂次/名称，不改 id：
//   - dtap-1 由 3 月龄提前到 2 月龄，dtap-3 由 5 月龄改到 6 月龄（剂次含义不变）
//   - mr-1（8 月龄）名称由「麻疹风疹联合疫苗」更正为「麻腮风疫苗 第1剂」，id 保留沿用
//   - 6 周岁白破疫苗（dt-1）已从程序表移除，节点删除（白破仅用于 7–11 周岁补种）
export const VACCINE_SCHEDULE: VaccineScheduleItem[] = [
  { id: 'hepb-1', ageMonths: 0, ageLabel: '出生时', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 1, displayName: '乙肝疫苗 第1剂', note: '出生后 12 小时内尽早接种' },
  { id: 'bcg-1', ageMonths: 0, ageLabel: '出生时', vaccineCode: 'bcg', vaccineName: '卡介苗', dose: 1, displayName: '卡介苗' },
  { id: 'hepb-2', ageMonths: 1, ageLabel: '1月龄', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 2, displayName: '乙肝疫苗 第2剂' },
  { id: 'ipv-1', ageMonths: 2, ageLabel: '2月龄', vaccineCode: 'ipv', vaccineName: '脊灰灭活疫苗', dose: 1, displayName: '脊灰灭活疫苗 第1剂' },
  { id: 'dtap-1', ageMonths: 2, ageLabel: '2月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 1, displayName: '百白破疫苗 第1剂', note: '2025 年起起始接种月龄由 3 月龄提前到 2 月龄' },
  { id: 'ipv-2', ageMonths: 3, ageLabel: '3月龄', vaccineCode: 'ipv', vaccineName: '脊灰灭活疫苗', dose: 2, displayName: '脊灰灭活疫苗 第2剂' },
  { id: 'bopv-1', ageMonths: 4, ageLabel: '4月龄', vaccineCode: 'bopv', vaccineName: '脊灰减毒活疫苗', dose: 3, displayName: '脊灰减毒活疫苗 第3剂', note: '已按程序完成 4 剂含 IPV 成分疫苗（如五联）可不接种' },
  { id: 'dtap-2', ageMonths: 4, ageLabel: '4月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 2, displayName: '百白破疫苗 第2剂' },
  { id: 'hepb-3', ageMonths: 6, ageLabel: '6月龄', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 3, displayName: '乙肝疫苗 第3剂' },
  { id: 'dtap-3', ageMonths: 6, ageLabel: '6月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 3, displayName: '百白破疫苗 第3剂' },
  { id: 'men-a-1', ageMonths: 6, ageLabel: '6月龄', vaccineCode: 'men-a', vaccineName: 'A群流脑多糖疫苗', dose: 1, displayName: 'A群流脑多糖疫苗 第1剂' },
  { id: 'mr-1', ageMonths: 8, ageLabel: '8月龄', vaccineCode: 'mmr', vaccineName: '麻腮风疫苗', dose: 1, displayName: '麻腮风疫苗 第1剂', note: '麻腮风疫苗共 2 剂（8 月龄、18 月龄）' },
  { id: 'je-1', ageMonths: 8, ageLabel: '8月龄', vaccineCode: 'je', vaccineName: '乙脑疫苗', dose: 1, displayName: '乙脑疫苗 第1剂', note: '减毒活疫苗共 2 剂（8月龄、2周岁）；灭活疫苗共 4 剂（8月龄2剂间隔7-10天、2周岁、6周岁）' },
  { id: 'men-a-2', ageMonths: 9, ageLabel: '9月龄', vaccineCode: 'men-a', vaccineName: 'A群流脑多糖疫苗', dose: 2, displayName: 'A群流脑多糖疫苗 第2剂' },
  { id: 'dtap-4', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 4, displayName: '百白破疫苗 第4剂' },
  { id: 'mmr-1', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'mmr', vaccineName: '麻腮风疫苗', dose: 2, displayName: '麻腮风疫苗 第2剂' },
  { id: 'hepa-1', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'hepa', vaccineName: '甲肝疫苗', dose: 1, displayName: '甲肝疫苗 第1剂', note: '减毒活疫苗 1 剂（18月龄）；灭活疫苗 2 剂（18月龄、24月龄）' },
  { id: 'je-2', ageMonths: 24, ageLabel: '2周岁', vaccineCode: 'je', vaccineName: '乙脑疫苗', dose: 2, displayName: '乙脑疫苗 第2剂', note: '选择灭活疫苗时，本剂为第 3 剂，另有 6 周岁第 4 剂' },
  { id: 'men-ac-1', ageMonths: 36, ageLabel: '3周岁', vaccineCode: 'men-ac', vaccineName: 'A+C群流脑多糖疫苗', dose: 1, displayName: 'A+C群流脑多糖疫苗 第1剂' },
  { id: 'bopv-2', ageMonths: 48, ageLabel: '4周岁', vaccineCode: 'bopv', vaccineName: '脊灰减毒活疫苗', dose: 4, displayName: '脊灰减毒活疫苗 第4剂' },
  { id: 'dtap-5', ageMonths: 72, ageLabel: '6周岁', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 5, displayName: '百白破疫苗 第5剂', note: '2025 年起 6 周岁由接种白破疫苗改为百白破疫苗' },
  { id: 'men-ac-2', ageMonths: 72, ageLabel: '6周岁', vaccineCode: 'men-ac', vaccineName: 'A+C群流脑多糖疫苗', dose: 2, displayName: 'A+C群流脑多糖疫苗 第2剂' },
  // 13 周岁女孩的 HPV 属于国家免疫规划，但超出本工具 0–6 岁的时间轴范围，仅作参考展示
  { id: 'hpv-1', ageMonths: 156, ageLabel: '13周岁', vaccineCode: 'hpv', vaccineName: '双价HPV疫苗', dose: 1, displayName: '双价HPV疫苗 第1剂', note: '仅女孩；第1、2剂间隔 6 个月', referenceOnly: true },
  { id: 'hpv-2', ageMonths: 156, ageLabel: '13周岁', vaccineCode: 'hpv', vaccineName: '双价HPV疫苗', dose: 2, displayName: '双价HPV疫苗 第2剂', referenceOnly: true },
]

// 宝宝时间轴与接种提醒只覆盖 0–6 岁（referenceOnly 的 HPV 只在疫苗表里展示）
export const TIMELINE_VACCINE_SCHEDULE = VACCINE_SCHEDULE.filter((item) => !item.referenceOnly)

export const COMMON_VACCINE_SCHEDULE_IDS = ['hepb-1', 'bcg-1', 'ipv-1', 'dtap-1', 'mmr-1', 'hepa-1']

export function findVaccineScheduleItem(id?: string): VaccineScheduleItem | undefined {
  return VACCINE_SCHEDULE.find((item) => item.id === id)
}

export function getCurrentVaccineStage(months: number): VaccineScheduleItem[] {
  const currentAge = TIMELINE_VACCINE_SCHEDULE.reduce((latest, item) => (
    item.ageMonths <= months && item.ageMonths >= latest ? item.ageMonths : latest
  ), 0)
  return TIMELINE_VACCINE_SCHEDULE.filter((item) => item.ageMonths === currentAge)
}

export function getVaccineReferenceDate(birthday: string, ageMonths: number): string {
  const [year, month, day] = birthday.split('-').map(Number)
  const targetMonth = month - 1 + ageMonths
  const targetYear = year + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate()
  const targetDay = Math.min(day, lastDay)
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
}
