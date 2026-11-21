import { View, Text, Image, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
	EXPENSE_CATEGORIES,
	EXPENSE_UNITS,
	isExpenseCategoryCode,
	type ExpenseCategoryCode,
} from '@baby-time/shared'
import { useBabyStore } from '../../stores/babyStore'
import { expenseApi, trackEvent } from '../../utils/request'
import { getSystemConfig } from '../../utils/systemConfig'
import { EXPENSE_CATEGORY_ICONS } from './categoryIcons'
import calendarIcon from '../../assets/icons/calendar-pink.svg'
import pencilIcon from '../../assets/icons/pencil-coral.svg'
import scaleIcon from '../../assets/icons/scale-gray.svg'
import noteIcon from '../../assets/icons/note-edit-dark.svg'
import saveIcon from '../../assets/icons/save-white.svg'
import trashIcon from '../../assets/icons/trash-coral.svg'
import './edit.scss'

function localDateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate(),
	).padStart(2, '0')}`
}

function defaultCategory(): ExpenseCategoryCode {
	const cached = Taro.getStorageSync('expense:lastCategory')
	return typeof cached === 'string' && isExpenseCategoryCode(cached) ? cached : 'diaper'
}

export default function ExpenseEditPage() {
	const router = useRouter()
	const id = router.params.id
	const isEdit = Boolean(id)
	const { currentBaby, fetchBabies } = useBabyStore()

	const [amount, setAmount] = useState('')
	const [category, setCategory] = useState<ExpenseCategoryCode>(defaultCategory)
	const [expenseDate, setExpenseDate] = useState(localDateStr(new Date()))
	const [itemName, setItemName] = useState('')
	const [quantity, setQuantity] = useState('')
	const [unit, setUnit] = useState('')
	const [note, setNote] = useState('')
	const [saving, setSaving] = useState(false)
	const [loading, setLoading] = useState(isEdit)
	const [loadError, setLoadError] = useState(false)

	const today = localDateStr(new Date())
	const amountValue = Number(amount)
	const canSave =
		Number.isFinite(amountValue) &&
		amountValue >= 0.01 &&
		amountValue <= 999999.99 &&
		!saving
	// 单位固定三选；历史数据里不在三选中的旧值，编辑保存后会被清掉
	const unitOptions: string[] = [...EXPENSE_UNITS]

	useEffect(() => {
		void Taro.setNavigationBarTitle({ title: isEdit ? '编辑花费' : '记一笔' })
	}, [isEdit])

	// 深链兜底：后台总闸关闭时（配置强刷）直接回首页，与账本首页同一套兜底
	useDidShow(() => {
		void checkEnabledThenShow()
	})

	const checkEnabledThenShow = async () => {
		const config = await getSystemConfig(true)
		if (!config.expenseEnabled) {
			Taro.switchTab({ url: '/pages/index/index' })
		}
	}

	useEffect(() => {
		if (!currentBaby) void fetchBabies()
	}, [])

	useEffect(() => {
		if (!id) return
		const load = async () => {
			setLoading(true)
			try {
				const res = await expenseApi.get(id)
				const expense = res.data
				setAmount(
					expense.amount != null ? Number(expense.amount).toFixed(2) : '',
				)
				setCategory(expense.category)
				setExpenseDate(expense.expenseDate)
				setItemName(expense.itemName || '')
				setQuantity(expense.quantity != null ? String(expense.quantity) : '')
				setUnit(
					expense.unit && unitOptions.includes(expense.unit) ? expense.unit : '',
				)
				setNote(expense.note || '')
				setLoadError(false)
			} catch (err) {
				setLoadError(true)
			} finally {
				setLoading(false)
			}
		}
		void load()
	}, [id])

	const handleAmountInput = (value: string) => {
		const raw = value.replace(/[^\d.]/g, '')
		const [integer, ...rest] = raw.split('.')
		let next = rest.length
			? `${integer.slice(0, 6)}.${rest.join('').slice(0, 2)}`
			: integer.slice(0, 6)
		if (next.startsWith('.')) next = `0${next}`
		setAmount(next)
	}

	const handleQuantityInput = (value: string) => {
		const raw = value.replace(/[^\d.]/g, '')
		const [integer, ...rest] = raw.split('.')
		let next = rest.length
			? `${integer.slice(0, 6)}.${rest.join('').slice(0, 2)}`
			: integer.slice(0, 6)
		if (next.startsWith('.')) next = `0${next}`
		setQuantity(next)
	}

	/** 单位 chips 单选，再点一次取消 */
	const toggleUnit = (option: string) => {
		setUnit(previous => (previous === option ? '' : option))
	}

	const goBack = () => {
		const pages = Taro.getCurrentPages()
		if (pages.length > 1) {
			Taro.navigateBack()
		} else {
			Taro.redirectTo({ url: '/pages/expense/index' })
		}
	}

	const handleSave = async () => {
		if (saving) return
		if (!currentBaby) {
			Taro.showToast({ title: '请先创建宝宝档案', icon: 'none' })
			return
		}
		if (!canSave) {
			Taro.showToast({ title: '请输入 0.01 ~ 999999.99 之间的金额', icon: 'none' })
			return
		}
		const quantityValue = quantity.trim() ? Number(quantity) : null
		if (
			quantityValue != null &&
			(!Number.isFinite(quantityValue) ||
				quantityValue < 0.01 ||
				quantityValue > 999999)
		) {
			Taro.showToast({ title: '数量需在 0.01 ~ 999999 之间', icon: 'none' })
			return
		}
		setSaving(true)
		try {
			const payload = {
				amount: Math.round(amountValue * 100) / 100,
				category,
				expenseDate,
				// 编辑态清空项目名/备注时也要把空串发给服务端（undefined 会被 JSON 丢弃，
				// 服务端会当成「没改」），服务端 trimToNull 后落 NULL
				itemName: itemName.trim(),
				note: note.trim(),
				quantity:
					quantityValue == null
						? null
						: Math.round(quantityValue * 100) / 100,
				unit: unit.trim() || null,
			}
			if (isEdit && id) {
				await expenseApi.update(id, payload)
			} else {
				await expenseApi.create({ babyId: currentBaby.id, ...payload })
				void trackEvent('expense_add', { category })
			}
			Taro.setStorageSync('expense:lastCategory', category)
			Taro.setStorageSync('expense:focusMonth', expenseDate.slice(0, 7))
			Taro.showToast({
				title: isEdit ? '已保存' : '记好了',
				icon: 'success',
				duration: 900,
			})
			setTimeout(goBack, 500)
		} catch (err) {
			// 错误提示由全局拦截器统一 toast
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!id || saving) return
		const res = await Taro.showModal({
			title: '删除这笔花费？',
			content: '删除后无法恢复',
			confirmText: '删除',
			confirmColor: '#F0607E',
		})
		if (!res.confirm) return
		try {
			await expenseApi.remove(id)
			Taro.setStorageSync('expense:focusMonth', expenseDate.slice(0, 7))
			Taro.showToast({ title: '已删除', icon: 'success', duration: 900 })
			setTimeout(goBack, 500)
		} catch (err) {
			// 错误提示由全局拦截器统一 toast
		}
	}

	if (loading) {
		return (
			<View className='expense-edit-page'>
				<View className='edit-skeleton'>
					<View className='es-hero' />
					<View className='es-card' />
					<View className='es-card es-card-tall' />
				</View>
			</View>
		)
	}

	if (loadError) {
		return (
			<View className='expense-edit-page'>
				<View className='edit-state'>
					<Text className='edit-state-title'>没找到这笔花费</Text>
					<Text className='edit-state-desc'>可能已经被删除了</Text>
					<View className='edit-state-btn' onClick={goBack}>
						<Text className='edit-state-btn-text'>返回账本</Text>
					</View>
				</View>
			</View>
		)
	}

	return (
		<View className='expense-edit-page'>
			<View className='edit-hero'>
				<View className='edit-amount-capsule'>
					<Text className='edit-currency'>¥</Text>
					<Input
						className='edit-amount-input'
						type='digit'
						value={amount}
						maxlength={9}
						placeholder='0.00'
						placeholderClass='edit-amount-placeholder'
						focus={!isEdit}
						onInput={event => handleAmountInput(event.detail.value)}
					/>
				</View>
				<Text className='edit-amount-hint'>
					纸尿裤、奶粉、衣服，都能记 · 支持两位小数
				</Text>
			</View>

			<View className='edit-card'>
				<View className='edit-card-head'>
					<Text className='edit-card-title'>花在哪了</Text>
					<Text className='edit-card-sub'>选一个分类</Text>
				</View>
				<View className='edit-category-grid'>
					{EXPENSE_CATEGORIES.map(item => {
						const active = category === item.code
						return (
							<View
								className={`edit-category-cell ${active ? 'is-active' : ''}`}
								key={item.code}
								onClick={() => setCategory(item.code)}
							>
								<View className={`edit-category-icon tint-${item.tint}`}>
									<Image
										className='edit-category-img'
										src={EXPENSE_CATEGORY_ICONS[item.code]}
									/>
								</View>
								<Text className={`edit-category-label ${active ? 'is-active' : ''}`}>
									{item.label}
								</Text>
								{active && <View className='edit-category-check'>✓</View>}
							</View>
						)
					})}
				</View>
			</View>

			<View className='edit-card edit-form-card'>
				<View className='edit-row'>
					<View className='edit-row-label-wrap'>
						<Image className='edit-row-icon' src={calendarIcon} />
						<Text className='edit-row-label'>日期</Text>
					</View>
					<Picker
						mode='date'
						value={expenseDate}
						end={today}
						onChange={event => setExpenseDate(event.detail.value)}
					>
						<View className='edit-row-value'>
							<Text className='edit-row-value-text'>{expenseDate}</Text>
							<Text className='edit-row-arrow'>›</Text>
						</View>
					</Picker>
				</View>

				{/* 选了具体分类就不需要「买了什么」；只有「其他」才让用户补充说明 */}
				{category === 'other' && (
					<View className='edit-row edit-row-column'>
						<View className='edit-row-label-wrap'>
							<Image className='edit-row-icon' src={pencilIcon} />
							<Text className='edit-row-label'>买了什么</Text>
							<Text className='edit-row-optional'>选填</Text>
						</View>
						<Input
							className='edit-input'
							value={itemName}
							maxlength={30}
							placeholder='如：婴儿车、绘本套装'
							placeholderClass='edit-input-placeholder'
							onInput={event => setItemName(event.detail.value)}
						/>
					</View>
				)}

				<View className='edit-row edit-row-column'>
					<View className='edit-row-label-wrap'>
						<Image className='edit-row-icon' src={scaleIcon} />
						<Text className='edit-row-label'>数量 / 单位</Text>
						<Text className='edit-row-optional'>选填，用来算单价</Text>
					</View>
					<Input
						className='edit-input'
						type='digit'
						value={quantity}
						maxlength={9}
						placeholder='如 60'
						placeholderClass='edit-input-placeholder'
						onInput={event => handleQuantityInput(event.detail.value)}
					/>
					<View className='edit-unit-chips'>
						{unitOptions.map(option => {
							const active = unit === option
							return (
								<View
									className={`edit-unit-chip ${active ? 'is-active' : ''}`}
									key={option}
									onClick={() => toggleUnit(option)}
								>
									<Text
										className={`edit-unit-chip-text ${active ? 'is-active' : ''}`}
									>
										{option}
									</Text>
								</View>
							)
						})}
					</View>
				</View>

				<View className='edit-row edit-row-column'>
					<View className='edit-row-label-wrap'>
						<Image className='edit-row-icon edit-row-icon-note' src={noteIcon} />
						<Text className='edit-row-label'>备注</Text>
						<Text className='edit-row-optional'>选填</Text>
					</View>
					<Textarea
						className='edit-textarea'
						value={note}
						maxlength={100}
						placeholder='记点细节，比如在哪买的'
						placeholderClass='edit-input-placeholder'
						onInput={event => setNote(event.detail.value)}
					/>
					<Text className='edit-counter'>{note.length}/100</Text>
				</View>
			</View>

			<View className={`edit-save ${canSave ? '' : 'is-disabled'}`} onClick={handleSave}>
				<Image className='edit-save-icon' src={saveIcon} />
				<Text className='edit-save-text'>
					{saving ? '保存中…' : isEdit ? '保存修改' : '保存'}
				</Text>
			</View>

			{isEdit && (
				<View className='edit-delete' onClick={handleDelete}>
					<Image className='edit-delete-icon' src={trashIcon} />
					<Text className='edit-delete-text'>删除这笔</Text>
				</View>
			)}
		</View>
	)
}