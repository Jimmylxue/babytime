import { View, Text, Image, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	EXPENSE_CATEGORY_MAP,
	expenseCategoryLabel,
	type Expense,
	type ExpenseCategoryCode,
	type ExpenseMonthSummary,
} from '@baby-time/shared'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { needLogin } from '../../utils/needLogin'
import { expenseApi, trackEvent } from '../../utils/request'
import { EXPENSE_CATEGORY_ICONS } from './categoryIcons'
import walletIcon from '../../assets/expense-icons/wallet.svg'
import emptyWalletIcon from '../../assets/expense-icons/empty-wallet.svg'
import downloadIcon from '../../assets/icons/download.svg'
import plusWhiteIcon from '../../assets/icons/plus-white.svg'
import './index.scss'

const PAGE_SIZE = 50

function localDateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate(),
	).padStart(2, '0')}`
}

function currentMonth(): string {
	return localDateStr(new Date()).slice(0, 7)
}

function shiftMonth(month: string, delta: number): string {
	const [year, monthNumber] = month.split('-').map(Number)
	const date = new Date(year, monthNumber - 1 + delta, 1, 12)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOfMonth(month: string): string {
	const [year, monthNumber] = month.split('-').map(Number)
	const day = new Date(year, monthNumber, 0).getDate()
	return `${month}-${String(day).padStart(2, '0')}`
}

function monthLabel(month: string): string {
	const [year, monthNumber] = month.split('-').map(Number)
	return `${year}年${monthNumber}月`
}

function monthShort(month: string): string {
	const monthNumber = Number(month.split('-')[1])
	return `${monthNumber}月`
}

function formatAmount(value: number): string {
	const fixed = (Math.round(value * 100) / 100).toFixed(2)
	const [integer, decimal] = fixed.split('.')
	return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimal}`
}

function formatCompact(value: number): string {
	if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
	if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
	return String(Math.round(value))
}

function formatDayLabel(date: string): string {
	const today = localDateStr(new Date())
	if (date === today) return '今天'
	const yesterday = new Date()
	yesterday.setDate(yesterday.getDate() - 1)
	if (date === localDateStr(yesterday)) return '昨天'
	const parsed = new Date(`${date}T12:00:00`)
	const weekdays = '日一二三四五六'
	return `${parsed.getMonth() + 1}月${parsed.getDate()}日 周${weekdays[parsed.getDay()]}`
}

interface DayGroup {
	date: string
	total: number
	items: Expense[]
}

function groupByDay(items: Expense[]): DayGroup[] {
	const groups: DayGroup[] = []
	const map = new Map<string, DayGroup>()
	for (const item of items) {
		let group = map.get(item.expenseDate)
		if (!group) {
			group = { date: item.expenseDate, total: 0, items: [] }
			map.set(item.expenseDate, group)
			groups.push(group)
		}
		group.items.push(item)
		group.total = Math.round((group.total + Number(item.amount)) * 100) / 100
	}
	return groups
}

function mergeItems(previous: Expense[], next: Expense[]): Expense[] {
	const map = new Map<string, Expense>()
	for (const item of [...previous, ...next]) {
		map.set(item.id, item)
	}
	return Array.from(map.values()).sort((a, b) => {
		if (a.expenseDate !== b.expenseDate) return b.expenseDate.localeCompare(a.expenseDate)
		return String(b.createdAt).localeCompare(String(a.createdAt))
	})
}

export default function ExpensePage() {
	const { isLoggedIn, userInfo } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [month, setMonth] = useState(currentMonth())
	const [category, setCategory] = useState<ExpenseCategoryCode | null>(null)
	const [summary, setSummary] = useState<ExpenseMonthSummary | null>(null)
	const [items, setItems] = useState<Expense[]>([])
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(false)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [exporting, setExporting] = useState(false)
	const [error, setError] = useState(false)
	const [forbidden, setForbidden] = useState(false)
	const [refreshKey, setRefreshKey] = useState(0)
	const [budgetOpen, setBudgetOpen] = useState(false)
	const [budgetInput, setBudgetInput] = useState('')
	const [budgetSaving, setBudgetSaving] = useState(false)

	const firstShowRef = useRef(true)
	const trackedViewRef = useRef(false)
	const loadSeqRef = useRef(0)
	const monthRef = useRef(month)
	useEffect(() => {
		monthRef.current = month
	}, [month])

	useEffect(() => {
		if (!isLoggedIn || trackedViewRef.current) return
		trackedViewRef.current = true
		void trackEvent('tool_view', { name: 'expense' })
	}, [isLoggedIn])

	const isCurrentMonth = month === currentMonth()
	const selectedYear = Number(month.slice(0, 4))
	const yearLabel =
		selectedYear === new Date().getFullYear() ? '今年' : `${selectedYear}年`
	const groups = useMemo(() => groupByDay(items), [items])
	const activeCategoryLabel = category ? expenseCategoryLabel(category) : ''

	const load = async (nextPage: number, append: boolean) => {
		if (!currentBaby) return
		// 切月/切分类时旧请求可能晚到；用序号丢弃过期响应，避免把上个月的明细拼进本月
		const seq = ++loadSeqRef.current
		if (append) setLoadingMore(true)
		else setLoading(true)

		try {
			const listRes = await expenseApi.list(currentBaby.id, {
				month,
				category: category || undefined,
				page: nextPage,
				pageSize: PAGE_SIZE,
			})
			if (seq !== loadSeqRef.current) return
			const list = listRes.data
			setItems(previous =>
				append ? mergeItems(previous, list.items) : list.items,
			)
			setPage(list.page)
			setHasMore(list.hasMore)

			if (!append) {
				const summaryRes = await expenseApi.summary(currentBaby.id, month)
				if (seq !== loadSeqRef.current) return
				setSummary(summaryRes.data)
			}
			setError(false)
			setForbidden(false)
		} catch (err: any) {
			if (seq !== loadSeqRef.current) return
			const message = String(err?.message || '')
			if (message.includes('无权')) {
				setForbidden(true)
			} else if (append) {
				Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
			} else {
				setError(true)
			}
		} finally {
			if (seq === loadSeqRef.current) {
				setLoading(false)
				setLoadingMore(false)
			}
		}
	}

	useEffect(() => {
		if (!isLoggedIn || !currentBaby) return
		void load(1, false)
		// load 依赖 month/category/currentBaby，故意只在这些值变化时重跑
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [month, category, currentBaby?.id, refreshKey, isLoggedIn])

	useDidShow(() => {
		if (!isLoggedIn) {
			void needLogin()
			return
		}
		void fetchBabies()

		// 编辑页保存后写入 focusMonth：先消费它，再判断是不是首次展示。
		// 这样即使编辑页是深链打开、账本页不在栈里，回来后也能落到正确的月份。
		const focusMonth = Taro.getStorageSync('expense:focusMonth')
		if (focusMonth) {
			Taro.removeStorageSync('expense:focusMonth')
			if (focusMonth !== monthRef.current) {
				setMonth(focusMonth)
				setCategory(null)
				setSummary(null)
				setItems([])
				setHasMore(false)
				firstShowRef.current = false
				return
			}
		}

		if (firstShowRef.current) {
			firstShowRef.current = false
			return
		}

		setRefreshKey(key => key + 1)
	})

	useReachBottom(() => {
		if (!currentBaby || !hasMore || loading || loadingMore) return
		void load(page + 1, true)
	})

	const changeMonth = (nextMonth: string) => {
		if (nextMonth > currentMonth()) return
		setMonth(nextMonth)
		setCategory(null)
		setSummary(null)
		setItems([])
		setHasMore(false)
	}

	const toggleCategory = (code: ExpenseCategoryCode) => {
		setCategory(previous => (previous === code ? null : code))
		setItems([])
		setHasMore(false)
	}

	const goCreate = () => {
		if (!currentBaby) {
			Taro.navigateTo({ url: '/pages/baby-edit/index' })
			return
		}
		Taro.navigateTo({ url: '/pages/expense/edit' })
	}

	const goEdit = (id: string) => {
		Taro.navigateTo({ url: `/pages/expense/edit?id=${id}` })
	}

	const openBudget = () => {
		setBudgetInput(summary?.budget ? String(summary.budget.amount) : '')
		setBudgetOpen(true)
	}

	const handleBudgetInput = (value: string) => {
		const raw = value.replace(/[^\d.]/g, '')
		const [integer, ...rest] = raw.split('.')
		let next = rest.length
			? `${integer.slice(0, 7)}.${rest.join('').slice(0, 2)}`
			: integer.slice(0, 7)
		if (next.startsWith('.')) next = `0${next}`
		setBudgetInput(next)
	}

	const saveBudget = async () => {
		if (!currentBaby || budgetSaving) return
		const value = Number(budgetInput)
		if (!Number.isFinite(value) || value < 0.01 || value > 9999999.99) {
			Taro.showToast({ title: '请输入有效预算金额', icon: 'none' })
			return
		}
		setBudgetSaving(true)
		try {
			await expenseApi.setBudget(currentBaby.id, Math.round(value * 100) / 100)
			setBudgetOpen(false)
			setRefreshKey(key => key + 1)
			Taro.showToast({ title: '预算已设置', icon: 'success' })
		} catch (err) {
			// 错误提示由全局拦截器统一 toast
		} finally {
			setBudgetSaving(false)
		}
	}

	const clearBudget = async () => {
		if (!currentBaby || budgetSaving) return
		setBudgetSaving(true)
		try {
			await expenseApi.setBudget(currentBaby.id, null)
			setBudgetOpen(false)
			setRefreshKey(key => key + 1)
			Taro.showToast({ title: '已清除预算', icon: 'success' })
		} catch (err) {
			// 错误提示由全局拦截器统一 toast
		} finally {
			setBudgetSaving(false)
		}
	}

	const handleExport = async () => {
		if (!currentBaby || exporting) return
		if (!summary || summary.count === 0) {
			Taro.showToast({ title: '这个月还没有花费记录', icon: 'none' })
			return
		}
		setExporting(true)
		Taro.showLoading({ title: '正在导出…', mask: true })
		try {
			const startDate = `${month}-01`
			const endDate = isCurrentMonth ? localDateStr(new Date()) : lastDayOfMonth(month)
			const res = await expenseApi.exportExcel(currentBaby.id, { startDate, endDate })
			const data = res.data
			if (!data?.content) {
				Taro.hideLoading()
				Taro.showToast({ title: '这个月还没有花费记录', icon: 'none' })
				return
			}
			const filePath = `${Taro.env.USER_DATA_PATH}/${data.filename}`
			Taro.getFileSystemManager().writeFileSync(
				filePath,
				data.content,
				data.encoding || 'base64',
			)
			Taro.hideLoading()
			void trackEvent('expense_export', { month })
			if (data.truncated) {
				Taro.showToast({
					title: '记录过多，已导出前 5000 笔',
					icon: 'none',
					duration: 2500,
				})
			}
			await Taro.openDocument({
				filePath,
				fileType: 'xlsx',
				showMenu: true,
				fail: () => {
					Taro.showModal({
						title: '已导出',
						content: `共 ${data.total} 笔花费，文件已保存。当前微信版本无法直接预览，可点右上角「···」转发到微信后用 Excel 打开。`,
						showCancel: false,
					})
				},
			})
		} catch (err) {
			Taro.hideLoading()
			// 错误提示由全局拦截器统一 toast
		} finally {
			setExporting(false)
		}
	}

	return (
		<View className='expense-page'>
			<View className='expense-topbar'>
				<View className='month-switch'>
					<View
						className='month-arrow'
						onClick={() => changeMonth(shiftMonth(month, -1))}
					>
						<Text>‹</Text>
					</View>
					{/* 点中间的年月直接弹原生年月滚轮（Picker fields=month），
					    左右箭头保留用于前后快速翻月 */}
					<Picker
						mode='date'
						fields='month'
						value={month}
						end={currentMonth()}
						onChange={event => changeMonth(event.detail.value)}
					>
						<View className='month-copy'>
							<Text className='month-title'>{monthLabel(month)}</Text>
							<Text className='month-caret'>▾</Text>
						</View>
					</Picker>
					<View
						className={`month-arrow ${isCurrentMonth ? 'is-disabled' : ''}`}
						onClick={() => changeMonth(shiftMonth(month, 1))}
					>
						<Text>›</Text>
					</View>
				</View>
				<View
					className={`export-btn ${exporting ? 'is-busy' : ''}`}
					onClick={handleExport}
				>
					<Image className='export-icon' src={downloadIcon} />
					<Text className='export-text'>{exporting ? '导出中' : '导出'}</Text>
				</View>
			</View>

			{!isLoggedIn ? (
				<View className='expense-state-card'>
					<Image className='state-illustration' src={emptyWalletIcon} />
					<Text className='state-title'>登录后开始记录</Text>
					<Text className='state-desc'>登录后，纸尿裤、奶粉的每一笔都能记下来</Text>
				</View>
			) : !currentBaby ? (
				<View className='expense-state-card'>
					<Image className='state-illustration' src={emptyWalletIcon} />
					<Text className='state-title'>先给宝宝建个档案</Text>
					<Text className='state-desc'>有了宝宝档案，才能把花费记到 TA 的账本里</Text>
					<View className='state-btn' onClick={() => Taro.navigateTo({ url: '/pages/baby-edit/index' })}>
						<Text className='state-btn-text'>去创建宝宝</Text>
					</View>
				</View>
			) : forbidden ? (
				<View className='expense-state-card'>
					<Image className='state-illustration' src={emptyWalletIcon} />
					<Text className='state-title'>账本仅对家庭成员开放</Text>
					<Text className='state-desc'>让宝宝档案的家人邀请你加入，就能一起看和记</Text>
				</View>
			) : error ? (
				<View className='expense-state-card'>
					<Image className='state-illustration' src={emptyWalletIcon} />
					<Text className='state-title'>账本加载失败</Text>
					<Text className='state-desc'>检查网络后试一次</Text>
					<View className='state-btn' onClick={() => setRefreshKey(key => key + 1)}>
						<Text className='state-btn-text'>重新加载</Text>
					</View>
				</View>
			) : !summary ? (
				<View className='expense-skeleton'>
					<View className='sk-summary' />
					<View className='sk-card' />
					<View className='sk-card sk-card-tall' />
				</View>
			) : summary ? (
				<>
					<View className='summary-card'>
						<View className='summary-glow summary-glow-a' />
						<View className='summary-glow summary-glow-b' />
						<View className='summary-top'>
							<View className='summary-label-row'>
								<Text className='summary-label'>{isCurrentMonth ? '本月支出' : '当月支出'}</Text>
								{!isCurrentMonth && (
									<Text className='summary-badge'>{monthShort(month)}</Text>
								)}
							</View>
							<View className='summary-wallet'>
								<Image className='summary-wallet-icon' src={walletIcon} />
							</View>
						</View>
						<View className='summary-amount-row'>
							<Text className='summary-currency'>¥</Text>
							<Text className='summary-amount'>{formatAmount(summary.total)}</Text>
						</View>
						<View className='summary-meta'>
							<Text className='summary-meta-text'>共 {summary.count} 笔</Text>
							<Text className='summary-meta-dot'>·</Text>
							<Text className='summary-meta-text'>日均 ¥{formatAmount(summary.dailyAvg)}</Text>
						</View>
						<View className='summary-foot'>
							{summary.deltaPercent == null ? (
								<Text className='summary-delta is-flat'>上月无记录</Text>
							) : (
								<Text
									className={`summary-delta ${
										summary.deltaPercent > 0
											? 'is-up'
											: summary.deltaPercent < 0
												? 'is-down'
												: 'is-flat'
									}`}
								>
									{summary.deltaPercent > 0 ? '↑' : summary.deltaPercent < 0 ? '↓' : '—'}{' '}
									较上月 {Math.abs(summary.deltaPercent)}%
								</Text>
							)}
							{summary.topExpense && (
								<Text className='summary-max'>
									最大一笔 ¥{formatAmount(summary.topExpense.amount)}
								</Text>
							)}
						</View>

						{summary.budget ? (
							<View className='budget-block'>
								<View className='budget-head'>
									<Text className='budget-label'>
										每月预算 ¥{formatAmount(summary.budget.amount)}
									</Text>
									<Text className='budget-edit' onClick={openBudget}>
										修改
									</Text>
								</View>
								<View className='budget-bar'>
									<View
										className={`budget-bar-fill ${
											summary.budget.isOver ? 'is-over' : ''
										}`}
										style={{
											width: `${Math.min(
												Math.max(summary.budget.usedPercent, 0),
												100,
											)}%`,
										}}
									/>
								</View>
								<View className='budget-foot'>
									<Text
										className={`budget-status ${
											summary.budget.isOver ? 'is-over' : ''
										}`}
									>
										{summary.budget.isOver
											? `超支 ¥${formatAmount(
													Math.abs(summary.budget.remaining),
												)}`
											: `剩余 ¥${formatAmount(summary.budget.remaining)}`}
									</Text>
									<Text className='budget-percent'>
										已用 {summary.budget.usedPercent}%
									</Text>
								</View>
							</View>
						) : (
							<View className='budget-empty' onClick={openBudget}>
								<Text className='budget-empty-text'>
									设置每月预算，心里更有数
								</Text>
								<Text className='budget-empty-arrow'>›</Text>
							</View>
						)}
					</View>

					{summary.byCategory.length > 0 && (
						<View className='expense-card category-card'>
							<View className='card-head'>
								<View>
									<Text className='card-title'>花在哪了</Text>
									<Text className='card-sub'>点分类可以只看这一类</Text>
								</View>
							</View>
							<View className='category-list'>
								{summary.byCategory.map(item => {
									const meta = EXPENSE_CATEGORY_MAP[item.category] || EXPENSE_CATEGORY_MAP.other
									const isActive = category === item.category
									return (
										<View
											key={item.category}
											className={`category-row ${isActive ? 'is-active' : ''}`}
											onClick={() => toggleCategory(item.category)}
										>
											<View className={`category-icon tint-${meta.tint}`}>
												<Image
													className='category-icon-img'
													src={EXPENSE_CATEGORY_ICONS[item.category] || EXPENSE_CATEGORY_ICONS.other}
												/>
											</View>
											<View className='category-main'>
												<View className='category-row-top'>
													<Text className='category-name'>{item.label}</Text>
													<Text className='category-amount'>¥{formatAmount(item.amount)}</Text>
												</View>
												<View className='category-bar'>
													<View
														className={`category-bar-fill tint-${meta.tint}`}
														style={{ width: `${Math.max(item.percent, 2)}%` }}
													/>
												</View>
											</View>
											<Text className='category-percent'>{item.percent}%</Text>
										</View>
									)
								})}
							</View>
						</View>
					)}

					<View className='expense-card list-card'>
						<View className='card-head card-head-list'>
							<View>
								<Text className='card-title'>{monthShort(month)}明细</Text>
								<Text className='card-sub'>
									{items.length > 0 ? `已显示 ${items.length} 笔` : '还没有记录'}
								</Text>
							</View>
							{category && (
								<View className='filter-chip' onClick={() => toggleCategory(category)}>
									<Text className='filter-chip-text'>{activeCategoryLabel} ×</Text>
								</View>
							)}
						</View>

						{groups.length === 0 ? (
							<View className='list-empty'>
								<Image className='list-empty-icon' src={emptyWalletIcon} />
								<Text className='list-empty-title'>
									{category ? '这个分类还没有记录' : '这个月还没有花费记录'}
								</Text>
								<Text className='list-empty-desc'>
									{category
										? '换一个分类看看，或者看看本月全部'
										: '从第一包纸尿裤开始，记下来心里有数'}
								</Text>
								{/* 分类筛选的空态给「看看全部」；本月空态不再放「记一笔」，
								    底部悬浮按钮就是记一笔入口，避免重复 */}
								{category && (
									<View
										className='list-empty-btn'
										onClick={() => {
											if (category) toggleCategory(category)
											else goCreate()
										}}
									>
										<Text className='list-empty-btn-text'>看看全部</Text>
									</View>
								)}
							</View>
						) : (
							<View className='day-list'>
								{groups.map(group => (
									<View className='day-group' key={group.date}>
										<View className='day-head'>
											<Text className='day-label'>{formatDayLabel(group.date)}</Text>
											<Text className='day-total'>¥{formatAmount(group.total)}</Text>
										</View>
										{group.items.map(item => {
											const meta = EXPENSE_CATEGORY_MAP[item.category] || EXPENSE_CATEGORY_MAP.other
											const actor =
												item.actorName && item.actorUserId !== userInfo?.id
													? `${item.actorName}记的`
													: ''
											const unitPrice =
												item.quantity && item.unit
													? `¥${formatAmount(item.amount / item.quantity)}/${item.unit}`
													: ''
											const subParts = [item.note, unitPrice, actor].filter(Boolean)
											return (
												<View
													className='expense-row'
													key={item.id}
													onClick={() => goEdit(item.id)}
												>
													<View className={`row-icon tint-${meta.tint}`}>
														<Image
															className='row-icon-img'
															src={EXPENSE_CATEGORY_ICONS[item.category] || EXPENSE_CATEGORY_ICONS.other}
														/>
													</View>
													<View className='row-main'>
														<Text className='row-title'>
															{item.itemName || meta.label}
														</Text>
														{subParts.length > 0 && (
															<Text className='row-note'>
																{subParts.join(' · ')}
															</Text>
														)}
													</View>
													<View className='row-right'>
														<Text className='row-amount'>¥{formatAmount(item.amount)}</Text>
														<Text className='row-arrow'>›</Text>
													</View>
												</View>
											)
										})}
									</View>
								))}
								{loadingMore && <Text className='list-more'>加载中…</Text>}
								{!hasMore && items.length > 0 && (
									<Text className='list-end'>— 本月到底啦 —</Text>
								)}
							</View>
						)}
					</View>

					{summary.recentMonths.some(point => point.total > 0) ||
					summary.yearTotal > 0 ? (
						<View className='expense-card trend-card'>
							<View className='card-head'>
								<View>
									<Text className='card-title'>近 6 个月</Text>
									<Text className='card-sub'>点柱子可以切到那个月</Text>
								</View>
							</View>
							<View className='trend-bars'>
								{summary.recentMonths.map(point => {
									const maxTotal = Math.max(
										...summary.recentMonths.map(item => item.total),
										1,
									)
									const height = Math.max(
										10,
										Math.round((point.total / maxTotal) * 118),
									)
									const isActive = point.month === month
									const isPartial = point.month === currentMonth()
									return (
										<View
											className='trend-col'
											key={point.month}
											onClick={() => changeMonth(point.month)}
										>
											<Text className={`trend-value ${isActive ? 'is-active' : ''}`}>
												{point.total > 0 ? formatCompact(point.total) : ''}
											</Text>
											<View className='trend-bar-wrap'>
												<View
													className={`trend-bar ${isActive ? 'is-active' : ''} ${
														isPartial ? 'is-partial' : ''
													}`}
													style={{ height: `${height}rpx` }}
												/>
											</View>
											<Text className={`trend-label ${isActive ? 'is-active' : ''}`}>
												{isPartial ? '本月' : monthShort(point.month)}
											</Text>
										</View>
									)
								})}
							</View>
							<View className='trend-year'>
								<Text className='trend-year-label'>{yearLabel}累计</Text>
								<Text className='trend-year-value'>
									¥{formatAmount(summary.yearTotal)} · {summary.yearCount} 笔
								</Text>
							</View>
						</View>
					) : null}
				</>
			) : null}

			{budgetOpen && (
				<View className='budget-mask' onClick={() => setBudgetOpen(false)}>
					<View className='budget-dialog' onClick={event => event.stopPropagation()}>
						<Text className='budget-dialog-title'>设置每月预算</Text>
						<Text className='budget-dialog-desc'>
							每个月都按这个金额算，随时可以改
						</Text>
						<View className='budget-input-row'>
							<Text className='budget-input-currency'>¥</Text>
							<Input
								className='budget-input'
								type='digit'
								value={budgetInput}
								onInput={event => handleBudgetInput(event.detail.value)}
								placeholder='如 3000'
								placeholderClass='budget-input-placeholder'
								focus
							/>
						</View>
						<View className='budget-actions'>
							{summary?.budget && (
								<View
									className={`budget-action budget-action-clear ${
										budgetSaving ? 'is-busy' : ''
									}`}
									onClick={clearBudget}
								>
									清除
								</View>
							)}
							<View
								className='budget-action budget-action-cancel'
								onClick={() => setBudgetOpen(false)}
							>
								取消
							</View>
							<View
								className={`budget-action budget-action-save ${
									budgetSaving ? 'is-busy' : ''
								}`}
								onClick={saveBudget}
							>
								{budgetSaving ? '保存中…' : '保存'}
							</View>
						</View>
					</View>
				</View>
			)}

			{isLoggedIn && currentBaby && !forbidden && (
				<View className='expense-fab' onClick={goCreate}>
					<Image className='fab-plus' src={plusWhiteIcon} />
					<Text className='fab-text'>记一笔</Text>
				</View>
			)}
		</View>
	)
}