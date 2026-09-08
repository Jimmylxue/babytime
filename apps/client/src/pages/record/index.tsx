import { View, Text, Picker, Image, Textarea } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { useRecordStore } from '../../stores/recordStore'
import { recordApi, trackEvent } from '../../utils/request'
import { formatDate, formatHM } from '../../utils/date'
import calendarCoralIcon from '../../assets/icons/calendar-coral.svg'
import clockCoralIcon from '../../assets/icons/clock-coral.svg'
import noteEditDarkIcon from '../../assets/icons/note-edit-dark.svg'
import saveWhiteIcon from '../../assets/icons/save-white.svg'
import sparkleGoldIcon from '../../assets/icons/sparkle-gold.svg'
import diaperBabyIllu from '../../assets/diaper-baby.jpg'
import { buildRecordDate, buildTimeOnDate } from './components/timeUtils'
import type { RecordFormComponent, RecordFormHandle } from './components/types'
import FeedingForm, {
	buildLastHint as buildFeedingHint,
} from './components/FeedingForm'
import DiaperForm, {
	buildLastHint as buildDiaperHint,
} from './components/DiaperForm'
import SleepForm from './components/SleepForm'
import FoodForm, {
	buildLastHint as buildFoodHint,
} from './components/FoodForm'
import WaterForm, {
	buildLastHint as buildWaterHint,
} from './components/WaterForm'
import TemperatureForm, {
	buildLastHint as buildTemperatureHint,
} from './components/TemperatureForm'
import HeightWeightForm from './components/HeightWeightForm'
import MedicineForm, {
	buildLastHint as buildMedicineHint,
} from './components/MedicineForm'
import VaccineForm from './components/VaccineForm'
import OutdoorForm from './components/OutdoorForm'
import './index.scss'

const recordTypes = {
	feeding: { title: '喂奶记录', icon: '🍼' },
	diaper: { title: '尿布记录', icon: '💩' },
	sleep: { title: '睡眠记录', icon: '😴' },
	food: { title: '辅食记录', icon: '🍚' },
	water: { title: '饮水记录', icon: '💧' },
	temperature: { title: '体温记录', icon: '🌡️' },
	height_weight: { title: '身高体重', icon: '📏' },
	medicine: { title: '用药记录', icon: '💊' },
	vaccine: { title: '疫苗记录', icon: '💉' },
	bath: { title: '洗澡记录', icon: '🛁' },
	outdoor: { title: '户外活动', icon: '🌳' },
}

// 类型专属表单注册表：页面按 type 渲染对应组件。
// sleep 的起床时间/时长嵌在下方日期/时间卡里（SleepForm），不在此列。
const TYPE_FORMS: Record<string, RecordFormComponent> = {
	feeding: FeedingForm,
	diaper: DiaperForm,
	food: FoodForm,
	water: WaterForm,
	temperature: TemperatureForm,
	height_weight: HeightWeightForm,
	medicine: MedicineForm,
	vaccine: VaccineForm,
	outdoor: OutdoorForm,
}

// 「按上次来」提示条摘要（无预填内容的类型不在此列）
const LAST_HINTS: Record<string, (last: any) => string> = {
	feeding: buildFeedingHint,
	diaper: buildDiaperHint,
	food: buildFoodHint,
	water: buildWaterHint,
	temperature: buildTemperatureHint,
	medicine: buildMedicineHint,
}

// 记录页 hero 副标题（按类型）
const typeSubtitles: Record<string, string> = {
	feeding: '记录宝宝每一餐的成长能量',
	diaper: '记录宝宝每一次舒适的小时刻',
	sleep: '记录宝宝每一场安稳的睡眠',
	food: '记录宝宝每一口美味辅食',
	water: '记录宝宝每一口健康饮水',
	temperature: '记录宝宝每一次体温变化',
	height_weight: '记录宝宝每一步成长足迹',
	medicine: '记录宝宝每一次用药情况',
	vaccine: '记录宝宝每一针健康保护',
	bath: '记录宝宝每一次洗浴时光',
	outdoor: '记录宝宝每一次户外时光',
}

export default function RecordPage() {
	const router = useRouter()
	const { type = 'feeding', babyId, id, metric, scheduleItemId } = router.params
	const isEdit = !!id
	const { addRecord, updateRecord } = useRecordStore()

	const [loading, setLoading] = useState(false)
	// 同步锁，避免 state 异步更新导致连点漏拦截
	const submittingRef = useRef(false)
	// 「按上次来」预填只做一次
	const prefillRef = useRef(false)
	const [note, setNote] = useState('')
	const [startTime, setStartTime] = useState(formatHM(new Date()))
	const [recordDate, setRecordDate] = useState(formatDate(new Date()))
	const today = formatDate(new Date())
	// 编辑态原始记录（类型表单组件据此回填专属字段）
	const [initialRecord, setInitialRecord] = useState<any>(null)
	// 新增态本类型最近一条记录（类型表单组件据此「按上次来」预填）
	const [lastRecord, setLastRecord] = useState<any>(null)
	// 「按上次来」提示条：本类型最近一条记录的摘要文案
	const [lastRecordHint, setLastRecordHint] = useState('')
	const formRef = useRef<RecordFormHandle>(null)

	const typeInfo = { ...(recordTypes[type] || recordTypes.feeding) }
	// 身高体重拆分为独立入口：metric 为 height/weight 时只记录对应一项
	const growthMetric =
		type === 'height_weight' && (metric === 'height' || metric === 'weight')
			? metric
			: null
	if (growthMetric === 'height') {
		typeInfo.title = '身高记录'
		typeInfo.icon = '📏'
	} else if (growthMetric === 'weight') {
		typeInfo.title = '体重记录'
		typeInfo.icon = '⚖️'
	}

	const ActiveForm = TYPE_FORMS[type]

	// 编辑态：进入页面时拉取原始记录（公共字段在此回填，类型字段由表单组件回填）
	useDidShow(() => {
		if (isEdit && id) {
			fetchRecord()
			return
		}
		// 「按上次来」：新增时用本类型最近一条记录预填高频字段（时间/照片/备注不预填）
		if (!prefillRef.current && babyId) {
			prefillRef.current = true
			recordApi
				.getDetail(babyId, type, { days: 60, page: 1, pageSize: 1 })
				.then(res => {
					const last = res.data?.items?.[res.data.items.length - 1]
					if (!last) return
					setLastRecord(last)
					const buildHint = LAST_HINTS[type]
					if (buildHint) setLastRecordHint(buildHint(last))
				})
				.catch(() => {})
		}
	})

	const fetchRecord = async () => {
		if (!id) return
		try {
			const res = await recordApi.getOne(id)
			const record = res.data
			if (!record) return
			setInitialRecord(record)
			setRecordDate(formatDate(record.startTime))
			if (type !== 'height_weight') setStartTime(formatHM(record.startTime))
			if (record.note) setNote(record.note)
		} catch (error) {
			// 错误提示由全局拦截器统一 toast
		}
	}

	const handleSubmit = async () => {
		if (submittingRef.current) return
		const formError = formRef.current?.validate()
		if (formError) {
			Taro.showToast({ title: formError, icon: 'none' })
			return
		}
		submittingRef.current = true
		setLoading(true)
		try {
			const data: any = {
				babyId,
				type,
				startTime: buildTimeOnDate(
					buildRecordDate(recordDate),
					startTime,
				).toISOString(),
			}
			if (type === 'height_weight') {
				data.startTime = buildRecordDate(recordDate).toISOString()
			}
			// 睡眠的 startTime/endTime 会覆盖上面的公共 startTime
			Object.assign(data, formRef.current?.buildPayload({ recordDate, startTime }))

			if (note) data.note = note

			if (isEdit) {
				// 更新接口由记录 ID 确定所属宝宝和记录类型，不能重复提交创建专用字段。
				const { babyId: _babyId, type: _type, ...updateData } = data
				await updateRecord(id, updateData)
				Taro.showToast({ title: '更新成功', icon: 'success' })
				setTimeout(() => Taro.navigateBack(), 1500)
			} else {
				await addRecord(data)
				void trackEvent('record_created', { type, babyId })
				// 累计记录数 +1，用于「添加到我的小程序」引导（记满 3 条弹一次）
				const cumulative =
					(Taro.getStorageSync('stats:cumulativeRecords') || 0) + 1
				Taro.setStorageSync('stats:cumulativeRecords', cumulative)

				// 保存成功后直接返回（与编辑态一致）：再次进入时「按上次来」会预填上次值
				Taro.showToast({ title: '已记录', icon: 'success' })
				setTimeout(() => Taro.navigateBack(), 1500)
			}
		} catch (error) {
			submittingRef.current = false
			setLoading(false)
			// 失败原因（如内容安全拦截）由 request 全局拦截器统一 toast，这里只复位状态
		}
	}

	return (
		<View className="record-page">
			{/* Hero 头部：插画/emoji + 标题 + 星光 + 副标题 + 历史入口 */}
			<View className="record-hero">
				{type === 'diaper' ? (
					<Image
						className="record-hero-illu"
						src={diaperBabyIllu}
						mode="aspectFit"
					/>
				) : (
					<View className="record-hero-emoji">
						<Text>{typeInfo.icon}</Text>
					</View>
				)}
				<View className="record-hero-copy">
					<View className="record-hero-title-row">
						<Text className="record-hero-title">{typeInfo.title}</Text>
						<Image className="record-hero-sparkle" src={sparkleGoldIcon} />
					</View>
					<Text className="record-hero-sub">
						{typeSubtitles[type] || '记录宝宝成长的每一天'}
					</Text>
				</View>
				{type === 'vaccine' && babyId ? (
					<View
						className="record-history-pill"
						onClick={() =>
							Taro.navigateTo({
								url: `/pages/vaccine-timeline/index?babyId=${babyId}`,
							})
						}
					>
						<Image className="record-pill-icon" src={clockCoralIcon} />
						<Text className="record-pill-text">查看时间轴</Text>
					</View>
				) : babyId ? (
					<View
						className="record-history-pill"
						onClick={() => {
							const metricParam =
								type === 'height_weight' && metric
									? `&metric=${metric}`
									: ''
							Taro.navigateTo({
								url: `/pages/record-detail/index?babyId=${babyId}&type=${type}${metricParam}`,
							})
						}}
					>
						<Image className="record-pill-icon" src={clockCoralIcon} />
						<Text className="record-pill-text">历史记录</Text>
					</View>
				) : null}
			</View>

			{!isEdit && lastRecordHint && (
				<View className="last-record-hint">
					<Text className="last-record-hint-label">上次</Text>
					<Text className="last-record-hint-text">{lastRecordHint}</Text>
					<Text className="last-record-hint-tip">已按上次预填，可直接保存</Text>
				</View>
			)}

			{/* 日期 / 时间卡（睡眠的起床时间/时长也在此卡） */}
			<View className="record-card">
				<Picker
					mode="date"
					value={recordDate}
					end={today}
					onChange={e => setRecordDate(e.detail.value)}
				>
					<View className="record-row">
						<View className="record-row-icon">
							<Image className="record-row-icon-img" src={calendarCoralIcon} />
						</View>
						<Text className="record-row-label">
							{type === 'height_weight' ? '测量日期' : '发生日期'}
						</Text>
						<Text className="record-row-value">{recordDate}</Text>
						<Text className="record-row-arrow">›</Text>
					</View>
				</Picker>

				{type !== 'height_weight' && (
					<Picker
						mode="time"
						value={startTime}
						onChange={e => setStartTime(e.detail.value)}
					>
						<View className="record-row">
							<View className="record-row-icon">
								<Image className="record-row-icon-img" src={clockCoralIcon} />
							</View>
							<Text className="record-row-label">
								{type === 'sleep' ? '入睡时间' : '发生时间'}
							</Text>
							<Text className="record-row-value">{startTime}</Text>
							<Text className="record-row-arrow">›</Text>
						</View>
					</Picker>
				)}

				{type === 'sleep' && (
					<SleepForm
						ref={formRef}
						recordDate={recordDate}
						startTime={startTime}
						initialRecord={initialRecord}
					/>
				)}
			</View>

			{/* 类型专属表单 */}
			{ActiveForm && (
				<ActiveForm
					ref={formRef}
					initialRecord={initialRecord}
					lastRecord={lastRecord}
					metric={growthMetric || undefined}
					babyId={babyId}
					scheduleItemId={scheduleItemId}
					isEdit={isEdit}
				/>
			)}

			{/* 备注卡（所有类型共用，UI 稿样式） */}
			<View className="record-card">
				<View className="record-card-label-row">
					<Image className="record-card-label-icon" src={noteEditDarkIcon} />
					<Text className="record-card-label">备注 (可选)</Text>
				</View>
				<View className="note-area">
					<Textarea
						className="note-area-input"
						placeholder="添加备注..."
						value={note}
						maxlength={200}
						onInput={e => setNote(e.detail.value)}
					/>
					<Text className="note-area-counter">{note.length}/200</Text>
				</View>
			</View>

			{/* 保存按钮：固定底部常驻 */}
			<View
				className={`submit-btn${loading ? ' disabled' : ''}`}
				onClick={loading ? undefined : handleSubmit}
			>
				<Image className="submit-btn-icon" src={saveWhiteIcon} />
				<Text className="submit-text">
					{loading
						? isEdit
							? '保存中...'
							: '提交中...'
						: isEdit
							? '保存修改'
							: '保存记录'}
				</Text>
			</View>
		</View>
	)
}
