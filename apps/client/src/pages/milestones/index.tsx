import { View, Text, Image, Input, Textarea, Picker, Canvas, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { milestoneApi, trackEvent, type Milestone } from '../../utils/request'
import {
	MILESTONE_CATALOG,
	MILESTONE_CATEGORIES,
	findMilestone,
	type MilestoneItem,
} from '@baby-time/shared'
import { calculateAgeAt, formatDate } from '../../utils/date'
import { chooseAndUploadImage } from '../../utils/upload'
import { thumbUrl, THUMB_W } from '../../utils/imageThumb'
import { deliverMilestonePoster } from '../../utils/chartExport'
import {
	MILESTONE_CANVAS_ID,
	MILESTONE_POSTER_W,
	MILESTONE_POSTER_H,
	MAX_PHOTO_RATIO,
} from '../../utils/milestonePoster'
import { fetchPosterQrCode } from '../../utils/posterQr'
import { needLogin } from '../../utils/needLogin'
import './index.scss'

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
	MILESTONE_CATEGORIES.map(category => [category.key, category.label]),
)

/** 打卡当天的月龄文案：1 岁内按月，之后按岁（时间轴上「什么时候会的」要一眼看出来） */
function ageTextAt(birthday: string, date: string | Date) {
	const { months, days } = calculateAgeAt(birthday, date)
	if (months < 12) return months === 0 ? `${days} 天` : `${months} 个月 ${days} 天`
	const years = Math.floor(months / 12)
	const rest = months % 12
	return rest ? `${years} 岁 ${rest} 个月` : `${years} 岁`
}

function dateText(date: string) {
	const [year, month, day] = date.split('-').map(Number)
	return `${year}年${month}月${day}日`
}

/** 预置项取清单 emoji；自定义项统一用星星 */
function emojiOf(item: Pick<Milestone, 'code' | 'isCustom'>) {
	return findMilestone(item.code)?.emoji || '⭐'
}

/**
 * 竖图判定：照片按原图比例铺满会拉得一屏半高，竖图收窄显示宽度居中。
 * 宽高比来自 Image 的 onLoad（网络图不用 getImageInfo，省掉下载域名白名单这一层依赖）
 */
function isPortraitUrl(url: string, ratios: Record<string, { w: number; h: number }>) {
	const ratio = ratios[url]
	return !!ratio && ratio.h > ratio.w * 1.15
}

/** 超过海报上限的长图（基本是长截图）：先说清会被裁，别让用户以为海报出了 bug */
function isTooLongUrl(url: string, ratios: Record<string, { w: number; h: number }>) {
	const ratio = ratios[url]
	return !!ratio && ratio.h > ratio.w * MAX_PHOTO_RATIO
}

/** 海报入口的一次性引导，看过就不再弹（与首页「添加到我的小程序」同一套做法） */
const POSTER_GUIDE_KEY = 'guide:milestonePoster:done'

interface SheetState {
	code?: string
	custom?: boolean
}

export default function MilestonesPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby } = useBabyStore()
	const [items, setItems] = useState<Milestone[]>([])
	const [loaded, setLoaded] = useState(false)
	const [expanded, setExpanded] = useState(false)
	const [sheet, setSheet] = useState<SheetState | null>(null)
	const [editingId, setEditingId] = useState('')
	const [form, setForm] = useState({ title: '', date: '', note: '', photoUrl: '' })
	const [saving, setSaving] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [posterBusy, setPosterBusy] = useState(false)
	// 照片原始宽高（按 URL 记）：用来判断竖图该收窄显示宽度，不做任何裁切
	const [photoRatios, setPhotoRatios] = useState<Record<string, { w: number; h: number }>>({})
	const previewingRef = useRef(false)
	// 刚打卡完的那条：用来弹「要不要做成海报」，只在新增时出现
	const [justChecked, setJustChecked] = useState<Milestone | null>(null)
	const [showPosterGuide, setShowPosterGuide] = useState(false)
	// 打卡选择器：记录多了以后不必滚到页面底部才能挑预置项
	const [pickerOpen, setPickerOpen] = useState(false)
	const [pickerKeyword, setPickerKeyword] = useState('')

	const baby = currentBaby || useBabyStore.getState().currentBaby

	const loadData = async () => {
		try {
			if (!isLoggedIn) return
			await useBabyStore.getState().fetchBabies()
			const active = useBabyStore.getState().currentBaby
			if (!active) return
			const res = await milestoneApi.getByBaby(active.id)
			const list = res.data || []
			setItems(list)
			// 有内容才提「点卡片能出海报」——空列表没什么可点的
			if (list.length > 0 && !Taro.getStorageSync(POSTER_GUIDE_KEY)) {
				setShowPosterGuide(true)
			}
		} catch {
			// 失败提示由 request 全局拦截器统一 toast
		} finally {
			// 冷启动时 babyStore 还没水合，必须先 loading 再判空，否则会闪一下「还没有宝宝档案」
			setLoaded(true)
		}
	}

	useDidShow(() => {
		// previewImage 关闭时也会触发 onShow，这一次不必重新拉列表
		if (previewingRef.current) {
			previewingRef.current = false
			return
		}
		loadData()
		void trackEvent('milestone_view')
	})

	const rememberRatio = (
		url: string,
		detail: { width?: number | string; height?: number | string },
	) => {
		const w = Number(detail?.width) || 0
		const h = Number(detail?.height) || 0
		if (!w || !h) return
		setPhotoRatios(prev => (prev[url]?.w === w ? prev : { ...prev, [url]: { w, h } }))
	}

	const previewPhoto = (url: string) => {
		if (!url) return
		previewingRef.current = true
		Taro.previewImage({
			current: url,
			urls: [url],
			fail: () => {
				previewingRef.current = false
			},
		})
	}

	const checkedCodes = new Set(
		items.map(item => item.code).filter((code): code is string => !!code),
	)
	const nowMonths = baby
		? calculateAgeAt(baby.birthday, new Date()).months
		: 0
	// 参考窗口已经过期的项不再催：过了区间没做到，提示出来只会被读成「发育慢了」
	const pending = MILESTONE_CATALOG.filter(
		item => !checkedCodes.has(item.code) && item.refMaxMonths >= nowMonths,
	).sort((a, b) => a.refMinMonths - b.refMinMonths)
	const visiblePending = expanded ? pending : pending.slice(0, 3)
	// 选择器里给全量清单（含已记的，标成「已记」），否则用户搜不到会以为功能缺了
	const pickerItems = useMemo(() => {
		const kw = pickerKeyword.trim()
		return MILESTONE_CATALOG.filter(
			item => !kw || item.title.includes(kw) || item.hint.includes(kw),
		).sort((a, b) => a.refMinMonths - b.refMinMonths)
	}, [pickerKeyword])

	const openCheckIn = (preset?: MilestoneItem) => {
		if (!isLoggedIn) {
			void needLogin()
			return
		}
		if (!baby) {
			Taro.showToast({ title: '请先添加宝宝档案', icon: 'none' })
			return
		}
		setEditingId('')
		setSheet(preset ? { code: preset.code } : { custom: true })
		setForm({
			title: preset?.title || '',
			date: formatDate(new Date()),
			note: '',
			photoUrl: '',
		})
	}

	const openPicker = () => {
		if (!isLoggedIn) {
			void needLogin()
			return
		}
		if (!baby) {
			Taro.showToast({ title: '请先添加宝宝档案', icon: 'none' })
			return
		}
		setPickerKeyword('')
		setPickerOpen(true)
	}

	const choosePreset = (preset: MilestoneItem) => {
		if (checkedCodes.has(preset.code)) {
			Taro.showToast({ title: '这条已经记过了', icon: 'none' })
			return
		}
		setPickerOpen(false)
		openCheckIn(preset)
	}

	const openEdit = (item: Milestone) => {
		setEditingId(item.id)
		setSheet(item.isCustom ? { custom: true } : { code: item.code || undefined })
		setForm({
			title: item.title,
			date: item.date,
			note: item.note || '',
			photoUrl: item.photoUrl || '',
		})
	}

	const closeSheet = () => {
		setSheet(null)
		setEditingId('')
	}

	const pickPhoto = async () => {
		if (uploading) return
		setUploading(true)
		try {
			const url = await chooseAndUploadImage()
			if (url) setForm(prev => ({ ...prev, photoUrl: url }))
		} finally {
			setUploading(false)
		}
	}

	const submit = async () => {
		if (!baby || saving || !sheet) return
		const title = form.title.trim()
		if (!title) {
			Taro.showToast({ title: '请填写里程碑名称', icon: 'none' })
			return
		}
		setSaving(true)
		try {
			const payload = {
				date: form.date,
				note: form.note.trim(),
				photoUrl: form.photoUrl,
			}
			let created: Milestone | null = null
			if (editingId) {
				await milestoneApi.update(
					editingId,
					sheet.custom ? { ...payload, title } : payload,
				)
			} else {
				const res = await milestoneApi.create({
					babyId: baby.id,
					...(sheet.code ? { code: sheet.code } : { title }),
					...payload,
				})
				created = res.data || null
			}
			void trackEvent('milestone_check_in', {
				code: sheet.code || 'custom',
				withPhoto: !!form.photoUrl,
			})
			closeSheet()
			await loadData()
			if (created) {
				// 打卡成功的这一刻提海报，比在每张卡片上常驻按钮更有效，也不会吵到回看的人
				setJustChecked(created)
			} else {
				Taro.showToast({ title: '已保存', icon: 'success' })
			}
		} catch {
			// 失败原因（如内容安全拦截、重复打卡）由 request 全局拦截器统一 toast
		} finally {
			setSaving(false)
		}
	}

	const makePoster = async (item: Milestone) => {
		if (!baby || posterBusy) return
		setPosterBusy(true)
		try {
			// 带场景值的码：扫码进来可归因「里程碑海报带来的新用户」；失败自动回退静态码
			const miniProgramCode = await fetchPosterQrCode('milestone')
			await deliverMilestonePoster(
				{
					babyName: baby.name,
					avatarUrl: baby.avatar,
					title: item.title,
					emoji: emojiOf(item),
					dateText: dateText(item.date),
					ageText: ageTextAt(baby.birthday, item.date),
					note: item.note || undefined,
					photoUrl: item.photoUrl || undefined,
					miniProgramCodeUrl: miniProgramCode,
				},
				'share',
			)
			void trackEvent('milestone_poster_share', { code: item.code || 'custom' })
		} catch (error) {
			console.error('milestone poster failed', error)
			Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
		} finally {
			setPosterBusy(false)
		}
	}

	const removeItem = async (item: Milestone) => {
		const confirm = await Taro.showModal({
			title: '删除这条里程碑',
			content: `「${item.title}」删除后不能恢复。`,
			confirmText: '删除',
			confirmColor: '#E5546E',
		})
		if (!confirm.confirm) return
		try {
			await milestoneApi.delete(item.id)
			setItems(prev => prev.filter(row => row.id !== item.id))
			void trackEvent('milestone_deleted', { code: item.code || 'custom' })
		} catch {
			// 提示由全局拦截器统一 toast
		}
	}

	const dismissPosterGuide = () => {
		setShowPosterGuide(false)
		try {
			Taro.setStorageSync(POSTER_GUIDE_KEY, '1')
		} catch {
			// 写失败只是下次再弹一次，不影响任何功能
		}
	}

	const handleItemTap = async (item: Milestone) => {
		if (showPosterGuide) dismissPosterGuide()
		const res = await Taro.showActionSheet({
			itemList: ['生成纪念海报', '修改日期/备注', '删除'],
		}).catch(() => null)
		if (!res) return
		if (res.tapIndex === 0) void makePoster(item)
		if (res.tapIndex === 1) openEdit(item)
		if (res.tapIndex === 2) void removeItem(item)
	}

	if (!loaded) {
		return (
			<View className="milestone-page">
				<View className="ms-loading">
					<Text className="ms-loading-text">加载中…</Text>
				</View>
			</View>
		)
	}

	if (!baby) {
		return (
			<View className="milestone-page">
				<View className="ms-empty-page">
					<Text className="ms-empty-emoji">🌟</Text>
					<Text className="ms-empty-title">还没有宝宝档案</Text>
					<Text className="ms-empty-desc">
						先建一份档案，里程碑才知道该按几岁算
					</Text>
					<View
						className="ms-empty-btn"
						onClick={() => Taro.navigateTo({ url: '/pages/baby/index' })}
					>
						<Text className="ms-empty-btn-text">去创建宝宝档案</Text>
					</View>
				</View>
			</View>
		)
	}

	const sheetPreset = sheet?.code ? findMilestone(sheet.code) : undefined

	return (
		<View className="milestone-page">
			<View className="ms-hero">
				<Text className="ms-hero-title">{baby.name} 的第一次</Text>
				<Text className="ms-hero-sub">
					已记录 {items.length} 个 · 现在 {ageTextAt(baby.birthday, new Date())}
				</Text>
				<View className="ms-hero-btn" onClick={() => openCheckIn()}>
					<Text className="ms-hero-btn-text">＋ 记一个自己的</Text>
				</View>
			</View>

			{items.length > 0 && (
				<View className="ms-section">
					<Text className="ms-section-title">成长时间轴</Text>
					{showPosterGuide && (
						<View className="ms-guide" onClick={dismissPosterGuide}>
							<Text className="ms-guide-text">
								点任意一条，可以生成纪念海报、修改或删除
							</Text>
							<Text className="ms-guide-btn">知道了</Text>
						</View>
					)}
					<View className="ms-timeline">
						{items.map(item => (
							<View key={item.id} className="ms-row" onClick={() => handleItemTap(item)}>
								<View className="ms-row-dot">
									<Text className="ms-row-dot-emoji">{emojiOf(item)}</Text>
								</View>
								<View className="ms-row-card">
									<View className="ms-row-head">
										<Text className="ms-row-title">{item.title}</Text>
										<Text className="ms-row-tag">
											{item.isCustom
												? '自定义'
												: CATEGORY_LABELS[item.category] || '里程碑'}
										</Text>
									</View>
									<Text className="ms-row-meta">
										{dateText(item.date)} · {ageTextAt(baby.birthday, item.date)}
									</Text>
									{!!item.note && (
										<Text className="ms-row-note">{item.note}</Text>
									)}
									{!!item.photoUrl && (
										<Image
											className={`ms-row-photo ${
												isPortraitUrl(item.photoUrl, photoRatios)
													? 'ms-row-photo--portrait'
													: ''
											}`}
											src={thumbUrl(item.photoUrl, THUMB_W.wide)}
											mode="widthFix"
											lazyLoad
											onLoad={e => rememberRatio(item.photoUrl || '', e.detail)}
											onClick={e => {
												e.stopPropagation()
												previewPhoto(item.photoUrl || '')
											}}
										/>
									)}
								</View>
							</View>
						))}
					</View>
				</View>
			)}

			<View className="ms-section">
				<View className="ms-section-head">
					<Text className="ms-section-title">还没记的「第一次」</Text>
					<Text className="ms-section-count">{pending.length}</Text>
				</View>
				{visiblePending.length === 0 ? (
					<View className="ms-all-done">
						<Text className="ms-all-done-text">
							清单里这个月龄之前的都记完了 🎉 想起来什么随时「记一个自己的」
						</Text>
					</View>
				) : (
					<View className="ms-suggest">
						{visiblePending.map(preset => (
							<View
								key={preset.code}
								className="ms-suggest-item"
								onClick={() => openCheckIn(preset)}
							>
								<Text className="ms-suggest-emoji">{preset.emoji}</Text>
								<View className="ms-suggest-copy">
									<Text className="ms-suggest-title">{preset.title}</Text>
									<Text className="ms-suggest-ref">
										{preset.ageLabel} · {preset.hint}
									</Text>
								</View>
								<Text className="ms-suggest-btn">打卡</Text>
							</View>
						))}
						{pending.length > 3 && (
							<View className="ms-expand" onClick={() => setExpanded(!expanded)}>
								<Text className="ms-expand-text">
									{expanded ? '收起' : `展开全部 ${pending.length} 项`}
								</Text>
							</View>
						)}
					</View>
				)}
			</View>

			<View className="ms-disclaimer">
				<Text className="ms-disclaimer-text">
					参考月龄是多数孩子做到的时间区间，不是标准线——每个宝宝节奏不同，
					早两个月晚两个月都很常见。真有发育方面的担心，请以儿童保健科评估为准。
				</Text>
			</View>

			{sheet && (
				<View className="ms-sheet-mask" onClick={closeSheet}>
					<View className="ms-sheet" onClick={e => e.stopPropagation()}>
						<View className="ms-sheet-head">
							<Text className="ms-sheet-title">
								{editingId ? '修改这条里程碑' : sheetPreset ? sheetPreset.title : '记一个自己的里程碑'}
							</Text>
							<Text className="ms-sheet-close" onClick={closeSheet}>
								×
							</Text>
						</View>

						{sheetPreset ? (
							<Text className="ms-sheet-hint">{sheetPreset.hint}</Text>
						) : (
							<View className="ms-field">
								<Text className="ms-field-label">名称</Text>
								<Input
									className="ms-input"
									value={form.title}
									maxlength={20}
									placeholder="例如：第一次自己穿上鞋子"
									onInput={e =>
										setForm(prev => ({ ...prev, title: e.detail.value }))
									}
								/>
							</View>
						)}

						<View className="ms-field">
							<Text className="ms-field-label">哪天发生的</Text>
							<Picker
								mode="date"
								value={form.date}
								end={formatDate(new Date())}
								onChange={e =>
									setForm(prev => ({ ...prev, date: e.detail.value }))
								}
							>
								<View className="ms-picker">
									<Text className="ms-picker-text">{form.date}</Text>
									<Text className="ms-picker-arrow">›</Text>
								</View>
							</Picker>
						</View>

						<View className="ms-field">
							<Text className="ms-field-label">说一句话（选填）</Text>
							<Textarea
								className="ms-textarea"
								value={form.note}
								maxlength={60}
								placeholder="当时的场景、你第一反应是什么"
								onInput={e =>
									setForm(prev => ({ ...prev, note: e.detail.value }))
								}
							/>
						</View>

						<View className="ms-field">
							<Text className="ms-field-label">配一张图（选填）</Text>
							<View className="ms-photo-row">
								{form.photoUrl ? (
									<Image
										className="ms-photo-preview"
										src={form.photoUrl}
										mode="widthFix"
										onClick={pickPhoto}
										onLoad={e => rememberRatio(form.photoUrl, e.detail)}
									/>
								) : (
									<View className="ms-photo-add" onClick={pickPhoto}>
										<Text className="ms-photo-add-text">
											{uploading ? '上传中…' : '＋ 选照片'}
										</Text>
									</View>
								)}
								{!!form.photoUrl && (
									<Text className="ms-photo-remove" onClick={() => setForm(prev => ({ ...prev, photoUrl: '' }))}>
										移除
									</Text>
								)}
							</View>
							{isTooLongUrl(form.photoUrl, photoRatios) && (
								<Text className="ms-photo-warn">
									这张图比较长，做成海报时会裁掉上下两端
								</Text>
							)}
						</View>

						<View className={`ms-sheet-submit ${saving ? 'is-disabled' : ''}`} onClick={submit}>
							<Text className="ms-sheet-submit-text">
								{saving ? '保存中…' : editingId ? '保存修改' : '就记这个'}
							</Text>
						</View>
					</View>
				</View>
			)}

			{pickerOpen && (
				<View className="ms-pick-mask" onClick={() => setPickerOpen(false)}>
					<View className="ms-pick-sheet" onClick={e => e.stopPropagation()}>
						<View className="ms-pick-head">
							<Text className="ms-pick-title">记哪一个第一次？</Text>
							<Text className="ms-pick-close" onClick={() => setPickerOpen(false)}>
								×
							</Text>
						</View>
						<Input
							className="ms-pick-search"
							value={pickerKeyword}
							placeholder="搜一下，例如 翻身 / 走路 / 长牙"
							onInput={e => setPickerKeyword(e.detail.value)}
						/>
						<ScrollView className="ms-pick-list" scrollY>
							{pickerItems.map(preset => {
								const done = checkedCodes.has(preset.code)
								return (
									<View
										key={preset.code}
										className={`ms-pick-row ${done ? 'is-done' : ''}`}
										onClick={() => choosePreset(preset)}
									>
										<Text className="ms-pick-emoji">{preset.emoji}</Text>
										<View className="ms-pick-copy">
											<Text className="ms-pick-name">{preset.title}</Text>
											<Text className="ms-pick-ref">
												{preset.ageLabel} ·{' '}
												{CATEGORY_LABELS[preset.category] || '里程碑'}
											</Text>
										</View>
										<Text className="ms-pick-state">{done ? '已记' : '打卡'}</Text>
									</View>
								)
							})}
							{pickerItems.length === 0 && (
								<Text className="ms-pick-empty">
									没搜到相关的，直接记一个自己的
								</Text>
							)}
							<View
								className="ms-pick-custom"
								onClick={() => {
									setPickerOpen(false)
									openCheckIn()
								}}
							>
								<Text className="ms-pick-custom-text">＋ 都不是，记一个自己的</Text>
							</View>
						</ScrollView>
					</View>
				</View>
			)}

			{/* 悬浮打卡按钮：打开清单选择器，记录多了也不必滚到页面底部才能挑 */}
			<View className="ms-fab" onClick={openPicker}>
				<Text className="ms-fab-text">＋ 打卡</Text>
			</View>

			{justChecked && (
				<View className="ms-done-mask" onClick={() => setJustChecked(null)}>
					<View className="ms-done-card" onClick={e => e.stopPropagation()}>
						<Text className="ms-done-emoji">{emojiOf(justChecked)}</Text>
						<Text className="ms-done-title">记好了</Text>
						<Text className="ms-done-sub">
							{justChecked.title} · 要不要做成纪念海报发出去？
						</Text>
						<View
							className="ms-done-primary"
							onClick={() => {
								const item = justChecked
								setJustChecked(null)
								void makePoster(item)
							}}
						>
							<Text className="ms-done-primary-text">现在就做</Text>
						</View>
						<Text className="ms-done-ghost" onClick={() => setJustChecked(null)}>
							先不用
						</Text>
					</View>
				</View>
			)}

			{/* 里程碑纪念海报的离屏画布：移出屏幕，绘制与 CSS 完全解耦 */}
			<View
				className="poster-canvas-wrap"
				style={{ width: `${MILESTONE_POSTER_W}px`, height: `${MILESTONE_POSTER_H}px` }}
			>
				<Canvas
					type="2d"
					id={MILESTONE_CANVAS_ID}
					style={{ width: `${MILESTONE_POSTER_W}px`, height: `${MILESTONE_POSTER_H}px` }}
				/>
			</View>
		</View>
	)
}
