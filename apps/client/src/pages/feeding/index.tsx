import { View, Text, Image, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState, useRef, useEffect } from 'react'
import { useRecordStore } from '../../stores/recordStore'
import { recordApi, trackEvent } from '../../utils/request'
import { formatDate, formatHM } from '../../utils/date'
import heroIllustration from '../../assets/feeding-baby.png'
import breastIcon from '../../assets/icons/feed-breast.svg'
import formulaIcon from '../../assets/icons/feed-formula.svg'
import mixedIcon from '../../assets/icons/feed-mixed.svg'
import calendarSolidIcon from '../../assets/icons/feed-calendar-solid.svg'
import clockSolidIcon from '../../assets/icons/feed-clock-solid.svg'
import saveWhiteIcon from '../../assets/icons/feed-save-white.svg'
import statsCoralIcon from '../../assets/icons/feed-stats-coral.svg'
import chevronGrayIcon from '../../assets/icons/chevron-gray.svg'
import './index.scss'

const METHOD_OPTIONS = [
	{ value: 'breast', label: '母乳', icon: breastIcon },
	{ value: 'formula', label: '奶粉', icon: formulaIcon },
	{ value: 'mixed', label: '混合', icon: mixedIcon },
]

const METHOD_LABELS: Record<string, string> = {
	breast: '母乳',
	formula: '奶粉',
	mixed: '混合',
}

// 刻度尺：0-300ml，每 5ml 一格，每 30ml 一个标注大刻度
const RULER_MIN = 0
const RULER_MAX = 300
const RULER_STEP = 5
const RULER_TICK_COUNT = (RULER_MAX - RULER_MIN) / RULER_STEP + 1
// 量取设计稿：标注大刻度间距为屏宽的 109/750，即每 5ml 约 18rpx；
// 两侧留白 = 容器半宽（622/2 rpx），保证首末刻度也能滚动到屏幕中央
const { windowWidth } = Taro.getSystemInfoSync()
const RULER_GAP_PX = (windowWidth * 18) / 750
const RULER_HALF_PX = (windowWidth * 311) / 750

const clampAmount = (v: number) =>
	Math.min(RULER_MAX, Math.max(RULER_MIN, Math.round(v / RULER_STEP) * RULER_STEP))

const valueToOffset = (v: number) => ((v - RULER_MIN) / RULER_STEP) * RULER_GAP_PX

// 根据入睡/起床以外场景拼接时间戳（与通用记录页保持一致的归档口径）
const buildRecordDate = (date: string) => {
	const [year, month, day] = date.split('-').map(Number)
	return new Date(year, month - 1, day, 12, 0, 0, 0)
}

const buildTimeOnDate = (baseDate: Date, time: string) => {
	const [hours, minutes] = time.split(':')
	const d = new Date(baseDate)
	d.setHours(parseInt(hours), parseInt(minutes), 0, 0)
	return d
}

/* 步进器 + 吸附刻度尺。
 * 刻度尺不用 ScrollView：微信 scroll-left 属性初始设置不可靠且重复同值不生效，
 * 改用 touch 手势 + transform 位移驱动，初始位置首帧渲染、程序化定位恒生效。 */
function AmountRuler({
	value,
	onChange,
}: {
	value: number
	onChange: (v: number) => void
}) {
	// offset = 0ml 刻度到容器中心的位移（px），transform = translateX(-offset)
	const [offset, setOffset] = useState(() => valueToOffset(value))
	// 状态镜像：手势里不读渲染闭包，杜绝 Taro setData 异步时序下的状态漂移
	const offsetRef = useRef(offset)
	const applyOffset = (next: number) => {
		offsetRef.current = next
		setOffset(next)
	}
	// 手指按下时去掉过渡跟手拖动，松手/程序化定位时带吸附动画
	const [snapping, setSnapping] = useState(true)
	const dragRef = useRef<{
		lastX: number
		lastT: number
		v: number
		moved: boolean
		// 拖动中的浮点数值（ml）：起点恒为按下时的显示值，拖动只做增量累加
		valFloat: number
	} | null>(null)

	// 外部值变更（预填回显 / ± 步进）时刻度尺动画跟到对应位置；拖动中由手势接管
	useEffect(() => {
		if (dragRef.current) return
		setSnapping(true)
		applyOffset(valueToOffset(value))
	}, [value])

	const handleTouchStart = e => {
		const t = e.touches && e.touches[0]
		// 不用 touchstart 坐标做拖动基准（首帧坐标参考系可能与 move 事件不一致）；
		// 数值基准在首个 move 事件里以当前显示值重新锚定
		dragRef.current = {
			lastX: t ? t.clientX : 0,
			lastT: Date.now(),
			v: 0,
			moved: false,
			valFloat: value,
		}
		setSnapping(false)
	}

	const handleTouchMove = e => {
		const d = dragRef.current
		if (!d || !e.touches || e.touches.length > 1) return
		const t = e.touches[0]
		const now = Date.now()
		const dx = d.lastX - t.clientX
		d.lastX = t.clientX
		if (!d.moved) {
			// 首个移动事件只采样：数值基准锚定当前显示值，丢弃该帧位移
			d.moved = true
			d.valFloat = value
			if (Math.abs(offsetRef.current - valueToOffset(value)) > 0.5)
				applyOffset(valueToOffset(value))
			return
		}
		// 单帧位移超过人手物理速度＝坐标跳变，丢弃该帧防基准被击穿
		if (Math.abs(dx) > 80) return
		const dt = now - d.lastT
		d.lastT = now
		if (dt > 0) {
			// 松手惯性预估：速度取近期移动的加权平均（px/ms，手指左移为正），
			// 封顶防开发者工具/低端机事件时间戳过粗导致的速度尖峰
			const v = Math.max(-1.5, Math.min(1.5, dx / dt))
			d.v = 0.7 * d.v + 0.3 * v
		}
		// 数值以 ml 直接累加：起点恒为按下时的显示值（如 140），
		// 不从像素位置反推，刻度尺位置反过来跟着数值走
		d.valFloat = Math.min(
			RULER_MAX,
			Math.max(RULER_MIN, d.valFloat + dx / RULER_GAP_PX),
		)
		applyOffset(valueToOffset(d.valFloat))
		const v = clampAmount(d.valFloat)
		if (v !== value) onChange(v)
	}

	const handleTouchEnd = () => {
		const d = dragRef.current
		dragRef.current = null
		if (!d || !d.moved) {
			// 未产生有效移动（点按）：恢复吸附态即可
			setSnapping(true)
			return
		}
		// 简单惯性：按松手速度把数值外推一小段，再就近吸附到 5ml 刻度
		let fromVal = d.valFloat
		if (Math.abs(d.v) > 0.05) {
			fromVal = fromVal + (d.v * 140) / RULER_GAP_PX
		}
		const snapped = clampAmount(fromVal)
		setSnapping(true)
		applyOffset(valueToOffset(snapped))
		if (snapped !== value) onChange(snapped)
	}

	const adjust = (delta: number) => {
		onChange(Math.min(RULER_MAX, Math.max(RULER_MIN, value + delta)))
	}

	return (
		<>
			<View className='stepper'>
				<View
					className={`step-btn${value <= RULER_MIN ? ' disabled' : ''}`}
					onClick={() => adjust(-5)}
				>
					<Text className='step-glyph'>−</Text>
				</View>
				<View className='stepper-center'>
					<Text className='stepper-value'>{value}</Text>
					<Text className='stepper-unit'>ml</Text>
				</View>
				<View
					className={`step-btn${value >= RULER_MAX ? ' disabled' : ''}`}
					onClick={() => adjust(5)}
				>
					<Text className='step-glyph'>+</Text>
				</View>
			</View>
			<View
				className='ruler'
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				onTouchCancel={handleTouchEnd}
			>
				<View
					className={`ruler-track${snapping ? ' snapping' : ''}`}
					style={{
						width: `${
							RULER_HALF_PX * 2 + (RULER_TICK_COUNT - 1) * RULER_GAP_PX
						}px`,
						transform: `translateX(${-offset}px)`,
					}}
				>
					{Array.from({ length: RULER_TICK_COUNT }, (_, i) => {
						const v = RULER_MIN + i * RULER_STEP
						const isMajor = v % 30 === 0
						return (
							<View
								key={v}
								className='ruler-tick-wrap'
								style={{ left: `${RULER_HALF_PX + i * RULER_GAP_PX}px` }}
							>
								<View className={`ruler-tick${isMajor ? ' major' : ''}`} />
								{isMajor && <Text className='ruler-label'>{v}</Text>}
							</View>
						)
					})}
				</View>
				<View className='ruler-indicator' />
			</View>
		</>
	)
}

export default function FeedingPage() {
	const router = useRouter()
	const { babyId, id } = router.params
	const isEdit = !!id
	const { addRecord, updateRecord } = useRecordStore()

	const [loading, setLoading] = useState(false)
	const submittingRef = useRef(false)
	const prefillRef = useRef(false)
	const [feedingMethod, setFeedingMethod] = useState('breast')
	const [amount, setAmount] = useState(140)
	const [breastAmount, setBreastAmount] = useState(140)
	const [formulaAmount, setFormulaAmount] = useState(100)
	const [duration, setDuration] = useState('')
	const [note, setNote] = useState('')
	const [recordDate, setRecordDate] = useState(formatDate(new Date()))
	const [startTime, setStartTime] = useState(formatHM(new Date()))
	const today = formatDate(new Date())
	// 「上次」提示条：本类型最近一条记录的摘要 + 时间
	const [lastFeed, setLastFeed] = useState<{
		summary: string
		time: string
	} | null>(null)

	// 生成「上次」摘要（如：奶粉 · 140ml / 混合 · 母60ml+奶80ml）
	const buildLastSummary = (last: any): string => {
		const label = METHOD_LABELS[last.feedingMethod] || last.feedingMethod || ''
		const parts: string[] = [label]
		if (last.feedingMethod === 'mixed') {
			const b = last.breastAmount ? `母${last.breastAmount}ml` : ''
			const f = last.formulaAmount ? `奶${last.formulaAmount}ml` : ''
			const bf = [b, f].filter(Boolean).join('+')
			if (bf) parts.push(bf)
		} else if (last.amount != null) {
			parts.push(`${last.amount}ml`)
		}
		return parts.filter(Boolean).join(' · ')
	}

	useDidShow(() => {
		if (isEdit && id) {
			fetchRecord()
			return
		}
		// 新增时用最近一条喂奶记录预填（时间/备注不预填），并生成「上次」提示。
		// days 传 1100 拉全量：窗口太短（如 60 天）会静默取不到上次记录，预填落空。
		// 明细接口按 startTime DESC 返回，pageSize=1 时 items[0] 即最近一条。
		if (!babyId || prefillRef.current) return
		prefillRef.current = true
		recordApi
			.getDetail(babyId, 'feeding', { days: 1100, page: 1, pageSize: 1 })
			.then(res => {
				const last = res.data?.items?.[0]
				if (!last) return
				setLastFeed({
					summary: buildLastSummary(last),
					time: `${formatDate(last.startTime)} ${formatHM(last.startTime)}`,
				})
				if (last.feedingMethod) setFeedingMethod(last.feedingMethod)
				if (last.feedingMethod === 'mixed') {
					if (last.breastAmount != null)
						setBreastAmount(clampAmount(last.breastAmount))
					if (last.formulaAmount != null)
						setFormulaAmount(clampAmount(last.formulaAmount))
				} else if (last.amount != null) {
					setAmount(clampAmount(last.amount))
				}
				if (last.duration != null) setDuration(String(last.duration))
			})
			.catch(() => {})
	})

	const fetchRecord = async () => {
		try {
			const res = await recordApi.getOne(id)
			const record = res.data
			if (!record) return
			setRecordDate(formatDate(record.startTime))
			setStartTime(formatHM(record.startTime))
			if (record.feedingMethod) setFeedingMethod(record.feedingMethod)
			if (record.feedingMethod === 'mixed') {
				if (record.breastAmount != null)
					setBreastAmount(clampAmount(record.breastAmount))
				if (record.formulaAmount != null)
					setFormulaAmount(clampAmount(record.formulaAmount))
			} else if (record.amount != null) {
				setAmount(clampAmount(record.amount))
			}
			if (record.duration != null) setDuration(String(record.duration))
			if (record.note) setNote(record.note)
		} catch (error) {
			// 错误提示由全局拦截器统一 toast
		}
	}

	const showAmountTip = () => {
		Taro.showModal({
			title: '估算奶量小贴士',
			content:
				'按体重估算：每日总奶量 ≈ 体重(kg) × 150ml；单次奶量 ≈ 每日总量 ÷ 每日顿数。仅供参考，请以宝宝的实际需求为准。',
			showCancel: false,
			confirmText: '知道了',
		})
	}

	const handleDateChange = e => setRecordDate(e.detail.value)
	const handleTimeChange = e => setStartTime(e.detail.value)
	const handleDurationInput = e => setDuration(e.detail.value.replace(/\D/g, ''))
	const handleNoteInput = e => setNote(e.detail.value)

	const handleSubmit = async () => {
		if (submittingRef.current) return
		if (!babyId) {
			Taro.showToast({ title: '请先选择宝宝', icon: 'none' })
			return
		}
		submittingRef.current = true
		setLoading(true)
		try {
			const data: any = {
				babyId,
				type: 'feeding',
				startTime: buildTimeOnDate(buildRecordDate(recordDate), startTime).toISOString(),
				feedingMethod,
			}
			if (feedingMethod === 'mixed') {
				if (breastAmount > 0) data.breastAmount = breastAmount
				if (formulaAmount > 0) data.formulaAmount = formulaAmount
			} else if (amount > 0) {
				data.amount = amount
			}
			if (duration) data.duration = parseInt(duration)
			if (note) data.note = note

			if (isEdit) {
				// 更新接口由记录 ID 确定所属宝宝和记录类型，不能重复提交创建专用字段。
				const { babyId: _babyId, type: _type, ...updateData } = data
				await updateRecord(id, updateData)
				Taro.showToast({ title: '更新成功', icon: 'success' })
			} else {
				await addRecord(data)
				void trackEvent('record_created', { type: 'feeding', babyId })
				// 累计记录数 +1，用于「添加到我的小程序」引导（记满 3 条弹一次）
				const cumulative = (Taro.getStorageSync('stats:cumulativeRecords') || 0) + 1
				Taro.setStorageSync('stats:cumulativeRecords', cumulative)
				Taro.showToast({ title: '已记录', icon: 'success' })
			}
			setTimeout(() => Taro.navigateBack(), 1500)
		} catch (error) {
			submittingRef.current = false
			setLoading(false)
			// 失败原因（如内容安全拦截）由 request 全局拦截器统一 toast，这里只复位状态
		}
	}

	return (
		<View className='feeding-page'>
			<View className='hero'>
				<View className='hero-title-row'>
					<Text className='hero-title'>喂奶记录</Text>
					<Text className='hero-emoji'>🍼</Text>
				</View>
				<Text className='hero-sub'>记录宝宝每一次营养时刻</Text>
				<Image className='hero-illus' src={heroIllustration} mode='widthFix' />
			</View>

			{!isEdit && lastFeed && (
				<View className='last-card'>
					<Text className='last-chip'>上次</Text>
					<Text className='last-summary'>{lastFeed.summary}</Text>
					<Text className='last-time'>{lastFeed.time}</Text>
				</View>
			)}

			<View className='form-card'>
				<View className='datetime-row'>
					<Picker
						className='datetime-picker'
						mode='date'
						value={recordDate}
						end={today}
						onChange={handleDateChange}
					>
						<View className='datetime-cell'>
							<View className='datetime-icon pink'>
								<Image className='datetime-icon-img' src={calendarSolidIcon} />
							</View>
							<View className='datetime-info'>
								<Text className='datetime-label'>发生日期</Text>
								<Text className='datetime-value'>{recordDate}</Text>
							</View>
							<Image className='datetime-chevron' src={chevronGrayIcon} />
						</View>
					</Picker>
					<Picker
						className='datetime-picker'
						mode='time'
						value={startTime}
						onChange={handleTimeChange}
					>
						<View className='datetime-cell'>
							<View className='datetime-icon amber'>
								<Image className='datetime-icon-img' src={clockSolidIcon} />
							</View>
							<View className='datetime-info'>
								<Text className='datetime-label'>发生时间</Text>
								<Text className='datetime-value'>{startTime}</Text>
							</View>
							<Image className='datetime-chevron' src={chevronGrayIcon} />
						</View>
					</Picker>
				</View>

				<View className='section-title method-title'>喂养方式</View>
				<View className='method-grid'>
					{METHOD_OPTIONS.map(m => (
						<View
							key={m.value}
							className={`method-card${feedingMethod === m.value ? ' active' : ''}`}
							onClick={() => setFeedingMethod(m.value)}
						>
							{feedingMethod === m.value && (
								<View className='method-badge'>
									<Text className='method-badge-check'>✓</Text>
								</View>
							)}
							<Image className='method-icon' src={m.icon} />
							<Text className='method-label'>{m.label}</Text>
						</View>
					))}
				</View>

				{feedingMethod !== 'mixed' ? (
					<>
						<View className='section-header'>
							<Text className='section-title'>奶量 (ml)</Text>
							<View className='amount-tip' onClick={showAmountTip}>
								<Text className='amount-tip-text'>估算奶量小贴士</Text>
								<Text className='amount-tip-arrow'>›</Text>
							</View>
						</View>
						<AmountRuler value={amount} onChange={setAmount} />
					</>
				) : (
					<>
						<View className='section-header'>
							<Text className='section-title'>母乳量 (ml)</Text>
							<View className='amount-tip' onClick={showAmountTip}>
								<Text className='amount-tip-text'>估算奶量小贴士</Text>
								<Text className='amount-tip-arrow'>›</Text>
							</View>
						</View>
						<AmountRuler value={breastAmount} onChange={setBreastAmount} />
						<View className='section-header'>
							<Text className='section-title'>奶粉量 (ml)</Text>
						</View>
						<AmountRuler value={formulaAmount} onChange={setFormulaAmount} />
					</>
				)}

				<View className='section-title duration-title'>时长 (分钟)</View>
				<View className='duration-input'>
					<Input
						className='duration-field'
						type='number'
						placeholder='请输入时长'
						placeholderStyle='color: #C4C3C7'
						value={duration}
						onInput={handleDurationInput}
					/>
					<Text className='duration-unit'>分钟</Text>
				</View>

				<View className='section-title note-title'>备注 (可选)</View>
				<View className='note-box'>
					<Textarea
						className='note-field'
						placeholder='添加备注...'
						placeholderStyle='color: #C4C3C7'
						maxLength={100}
						value={note}
						onInput={handleNoteInput}
					/>
					<Text className='note-counter'>{note.length}/100</Text>
				</View>
			</View>

			<View className='bottom-bar'>
				<View
					className={`save-btn${loading ? ' disabled' : ''}`}
					onClick={loading ? undefined : handleSubmit}
				>
					<Image className='save-icon' src={saveWhiteIcon} />
					<Text className='save-text'>
						{loading ? '保存中...' : isEdit ? '保存修改' : '保存记录'}
					</Text>
				</View>
				<View
					className='stats-btn'
					onClick={() => Taro.switchTab({ url: '/pages/stats/index' })}
				>
					<Image className='stats-icon' src={statsCoralIcon} />
					<Text className='stats-label'>喂养统计</Text>
				</View>
			</View>
		</View>
	)
}
