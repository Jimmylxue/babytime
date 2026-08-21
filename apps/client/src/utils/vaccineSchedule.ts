export interface VaccineScheduleItem {
  id: string
  ageMonths: number
  ageLabel: string
  vaccineCode: string
  vaccineName: string
  dose: number
  displayName: string
  note?: string
}

export const VACCINE_SCHEDULE_VERSION = 'cn-nip-2021-reference'

// 国家免疫规划常规接种时间参考。各地品种、联合疫苗替代和补种安排可能不同，实际以接种门诊安排为准。
export const VACCINE_SCHEDULE: VaccineScheduleItem[] = [
  { id: 'hepb-1', ageMonths: 0, ageLabel: '出生时', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 1, displayName: '乙肝疫苗 第1剂' },
  { id: 'bcg-1', ageMonths: 0, ageLabel: '出生时', vaccineCode: 'bcg', vaccineName: '卡介苗', dose: 1, displayName: '卡介苗' },
  { id: 'hepb-2', ageMonths: 1, ageLabel: '1月龄', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 2, displayName: '乙肝疫苗 第2剂' },
  { id: 'ipv-1', ageMonths: 2, ageLabel: '2月龄', vaccineCode: 'ipv', vaccineName: '脊灰疫苗', dose: 1, displayName: '脊灰疫苗 第1剂' },
  { id: 'ipv-2', ageMonths: 3, ageLabel: '3月龄', vaccineCode: 'ipv', vaccineName: '脊灰疫苗', dose: 2, displayName: '脊灰疫苗 第2剂' },
  { id: 'dtap-1', ageMonths: 3, ageLabel: '3月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 1, displayName: '百白破疫苗 第1剂' },
  { id: 'bopv-1', ageMonths: 4, ageLabel: '4月龄', vaccineCode: 'bopv', vaccineName: '脊灰疫苗', dose: 3, displayName: '脊灰疫苗 第3剂', note: '品种以接种门诊安排为准' },
  { id: 'dtap-2', ageMonths: 4, ageLabel: '4月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 2, displayName: '百白破疫苗 第2剂' },
  { id: 'dtap-3', ageMonths: 5, ageLabel: '5月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 3, displayName: '百白破疫苗 第3剂' },
  { id: 'hepb-3', ageMonths: 6, ageLabel: '6月龄', vaccineCode: 'hepb', vaccineName: '乙肝疫苗', dose: 3, displayName: '乙肝疫苗 第3剂' },
  { id: 'men-a-1', ageMonths: 6, ageLabel: '6月龄', vaccineCode: 'men-a', vaccineName: 'A群流脑疫苗', dose: 1, displayName: 'A群流脑疫苗 第1剂' },
  { id: 'mr-1', ageMonths: 8, ageLabel: '8月龄', vaccineCode: 'mr', vaccineName: '麻腮风相关疫苗', dose: 1, displayName: '麻疹风疹联合疫苗 第1剂' },
  { id: 'je-1', ageMonths: 8, ageLabel: '8月龄', vaccineCode: 'je', vaccineName: '乙脑疫苗', dose: 1, displayName: '乙脑疫苗 第1剂', note: '制剂与剂次以接种门诊安排为准' },
  { id: 'men-a-2', ageMonths: 9, ageLabel: '9月龄', vaccineCode: 'men-a', vaccineName: 'A群流脑疫苗', dose: 2, displayName: 'A群流脑疫苗 第2剂' },
  { id: 'dtap-4', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'dtap', vaccineName: '百白破疫苗', dose: 4, displayName: '百白破疫苗 第4剂' },
  { id: 'mmr-1', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'mmr', vaccineName: '麻腮风疫苗', dose: 1, displayName: '麻腮风疫苗 第1剂' },
  { id: 'hepa-1', ageMonths: 18, ageLabel: '18月龄', vaccineCode: 'hepa', vaccineName: '甲肝疫苗', dose: 1, displayName: '甲肝疫苗', note: '制剂与剂次以接种门诊安排为准' },
  { id: 'je-2', ageMonths: 24, ageLabel: '2周岁', vaccineCode: 'je', vaccineName: '乙脑疫苗', dose: 2, displayName: '乙脑疫苗 后续剂次', note: '制剂与剂次以接种门诊安排为准' },
  { id: 'men-ac-1', ageMonths: 36, ageLabel: '3周岁', vaccineCode: 'men-ac', vaccineName: 'A+C群流脑疫苗', dose: 1, displayName: 'A+C群流脑疫苗 第1剂' },
  { id: 'bopv-2', ageMonths: 48, ageLabel: '4周岁', vaccineCode: 'bopv', vaccineName: '脊灰疫苗', dose: 4, displayName: '脊灰疫苗 第4剂', note: '品种以接种门诊安排为准' },
  { id: 'dt-1', ageMonths: 72, ageLabel: '6周岁', vaccineCode: 'dt', vaccineName: '白破疫苗', dose: 1, displayName: '白破疫苗' },
  { id: 'men-ac-2', ageMonths: 72, ageLabel: '6周岁', vaccineCode: 'men-ac', vaccineName: 'A+C群流脑疫苗', dose: 2, displayName: 'A+C群流脑疫苗 第2剂' },
]

export const COMMON_VACCINE_SCHEDULE_IDS = ['hepb-1', 'bcg-1', 'ipv-1', 'dtap-1', 'mmr-1', 'hepa-1']

export function findVaccineScheduleItem(id?: string): VaccineScheduleItem | undefined {
  return VACCINE_SCHEDULE.find((item) => item.id === id)
}

export function getCurrentVaccineStage(months: number): VaccineScheduleItem[] {
  const currentAge = VACCINE_SCHEDULE.reduce((latest, item) => (
    item.ageMonths <= months && item.ageMonths >= latest ? item.ageMonths : latest
  ), 0)
  return VACCINE_SCHEDULE.filter((item) => item.ageMonths === currentAge)
}
