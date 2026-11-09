/**
 * 儿保体检计划（国家基本公共卫生服务 · 0–6 岁儿童健康管理）。
 *
 * 依据《国家基本公共卫生服务规范》儿童健康管理部分的检查月龄节点，
 * 与疫苗时间轴一样是「参考日期」，各地执行细节（项目、频次）可能不同，
 * 实际以当地社区卫生服务中心安排为准。
 *
 * 与疫苗表的分工：疫苗那张管「打什么针」，这张管「什么时候体检」。
 * 两者都遵循同一套「节点 id 稳定、月龄可调」的约定 ——
 * id 一旦发布就不能改，因为 checkup_plans.schedule_item_id 会引用它。
 */

export interface CheckupScheduleItem {
  id: string
  /** 参考月龄（到该月龄前后去做） */
  ageMonths: number
  /** 展示用月龄文案 */
  ageLabel: string
  /** 检查名称 */
  title: string
  /** 该次检查的重点，供家长心里有数 */
  focus: string
  /** 是否在 0–6 岁主时间轴内（false = 仅参考展示） */
  referenceOnly?: boolean
}

export const CHECKUP_SCHEDULE_VERSION = 'cn-child-health-2026'

/**
 * 0–6 岁儿童健康管理检查节点。
 *
 * 说明：规范里 0–3 岁是「8 次」随访（满月、3、6、8、12、18、24、30、36 月龄），
 * 3–6 岁每年一次。这里按月龄升序排列，方便直接当时间轴用。
 */
export const CHECKUP_SCHEDULE: CheckupScheduleItem[] = [
  {
    id: 'newborn',
    ageMonths: 0,
    ageLabel: '出生后',
    title: '新生儿家庭访视',
    focus: '体重、黄疸、喂养与睡眠情况，脐带护理',
  },
  {
    id: 'm1',
    ageMonths: 1,
    ageLabel: '1月龄',
    title: '满月健康检查',
    focus: '体重增长、黄疸是否消退、听力和视物反应',
  },
  {
    id: 'm3',
    ageMonths: 3,
    ageLabel: '3月龄',
    title: '3月龄体检',
    focus: '体格测量、抬头与追视、髋关节检查',
  },
  {
    id: 'm6',
    ageMonths: 6,
    ageLabel: '6月龄',
    title: '6月龄体检',
    focus: '贫血筛查（血常规）、辅食添加指导、出牙情况',
  },
  {
    id: 'm8',
    ageMonths: 8,
    ageLabel: '8月龄',
    title: '8月龄体检',
    focus: '体格测量、坐与爬、辅食质地进阶',
  },
  {
    id: 'm12',
    ageMonths: 12,
    ageLabel: '12月龄',
    title: '1岁体检',
    focus: '体格与运动发育、语言萌发、饮食过渡到家庭餐',
  },
  {
    id: 'm18',
    ageMonths: 18,
    ageLabel: '18月龄',
    title: '1岁半体检',
    focus: '走路稳定性、词汇量、自闭症早期筛查',
  },
  {
    id: 'm24',
    ageMonths: 24,
    ageLabel: '24月龄',
    title: '2岁体检',
    focus: '身高体重与生长曲线、语言句子、牙齿与口腔',
  },
  {
    id: 'm30',
    ageMonths: 30,
    ageLabel: '30月龄',
    title: '2岁半体检',
    focus: '运动协调、社交互动、如厕训练准备',
  },
  {
    id: 'm36',
    ageMonths: 36,
    ageLabel: '36月龄',
    title: '3岁体检',
    focus: '视力筛查、身高体重、入园前健康评估',
  },
  {
    id: 'm48',
    ageMonths: 48,
    ageLabel: '4岁',
    title: '4岁体检',
    focus: '视力与听力、生长发育、行为与情绪',
  },
  {
    id: 'm60',
    ageMonths: 60,
    ageLabel: '5岁',
    title: '5岁体检',
    focus: '视力、龋齿检查、入学前准备',
  },
  {
    id: 'm72',
    ageMonths: 72,
    ageLabel: '6岁',
    title: '6岁体检',
    focus: '入学体检、视力与脊柱、疫苗查漏补种',
  },
]

/** 主时间轴（0–6 岁） */
export const TIMELINE_CHECKUP_SCHEDULE = CHECKUP_SCHEDULE.filter(
  (item) => !item.referenceOnly,
)

export function findCheckupItem(
  id?: string,
): CheckupScheduleItem | undefined {
  return CHECKUP_SCHEDULE.find((item) => item.id === id)
}

/** 出生日 + 月龄 → 参考体检日（YYYY-MM-DD，本地日历，与疫苗表同一算法） */
export function getCheckupReferenceDate(
  birthday: string,
  ageMonths: number,
): string {
  const [year, month, day] = birthday.split('-').map(Number)
  const targetMonth = month - 1 + ageMonths
  const targetYear = year + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate()
  const targetDay = Math.min(day, lastDay)
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(
    targetDay,
  ).padStart(2, '0')}`
}
