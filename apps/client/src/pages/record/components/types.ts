import type { ForwardRefExoticComponent, RefAttributes } from 'react'

/** 提交时由页面注入的公共字段上下文（睡眠要用日期 + 入睡时间推算起止区间） */
export interface RecordFormContext {
	recordDate: string
	startTime: string
}

/** 类型表单对页面暴露的命令接口：提交前校验 + 组装类型专属字段 */
export interface RecordFormHandle {
	/** 校验失败返回 toast 文案，通过返回 null */
	validate: () => string | null
	buildPayload: (ctx: RecordFormContext) => Record<string, any>
}

export interface RecordFormProps {
	/** 编辑态：接口返回的原始记录，回填类型专属字段 */
	initialRecord?: any
	/** 新增态：本类型最近一条记录，「按上次来」预填 */
	lastRecord?: any
	/** height_weight 拆分入口：height / weight 时只记录对应一项 */
	metric?: string
	/** 疫苗深链：疫苗卡片带出的排程项 ID */
	scheduleItemId?: string
	/** height_weight 拉取上次测量用 */
	babyId?: string
	isEdit?: boolean
}

export type RecordFormComponent = ForwardRefExoticComponent<
	RecordFormProps & RefAttributes<RecordFormHandle>
>
