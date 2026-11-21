import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import {
  expenseCategoryLabel,
  isExpenseCategoryCode,
  type ExpenseCategoryCode,
} from '@baby-time/shared'
import { BabyService } from '../baby/baby.service'
import { ContentSecurityService } from '../content-security/content-security.service'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { buildXlsx } from '../../common/xlsx'
import { Expense } from './entities/expense.entity'
import { ExpenseBudget } from './entities/expense-budget.entity'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'
import { QueryExpenseDto } from './dto/query-expense.dto'
import { SetBudgetDto } from './dto/set-budget.dto'

const MAX_AMOUNT = 999999.99
const MAX_EXPORT_DAYS = 366
const MAX_EXPORT_ROWS = 5000
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const ENABLED_SETTING_KEY = 'expense.enabled'

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseBudget)
    private readonly budgetRepository: Repository<ExpenseBudget>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly babyService: BabyService,
    private readonly contentSecurity: ContentSecurityService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  /** 后台「开启养娃账本」总闸：关闭时所有账本接口统一 403，数据保留不删 */
  private async assertEnabled() {
    if (!(await this.systemSettings.isEnabled(ENABLED_SETTING_KEY))) {
      throw new ForbiddenException('养娃账本暂未开启')
    }
  }

  /**
   * 新增一笔。
   *
   * 权限与记录不同：只要是通过家人邀请加入的成员（owner/editor/viewer）都能记。
   * 长辈代买衣服、纸尿裤是常见场景，账本按家庭共享；不调用 assertCanWrite。
   */
  async create(userId: string, dto: CreateExpenseDto) {
    await this.assertEnabled()
    await this.babyService.findOne(dto.babyId, userId)

    const itemName = this.trimToNull(dto.itemName)
    const note = this.trimToNull(dto.note)
    await this.contentSecurity.checkUserTexts(userId, [itemName, note])

    const expense = this.expenseRepository.create({
      babyId: dto.babyId,
      actorUserId: userId,
      amount: this.normalizeAmount(dto.amount),
      category: this.normalizeCategory(dto.category),
      itemName,
      note,
      quantity: this.normalizeQuantity(dto.quantity),
      unit: this.normalizeUnit(dto.unit),
      expenseDate: this.normalizeDate(dto.expenseDate),
    })
    return this.expenseRepository.save(expense)
  }

  async findList(userId: string, babyId: string, query: QueryExpenseDto) {
    await this.assertEnabled()
    await this.babyService.findOne(babyId, userId)

    const { start, end } = this.resolveMonth(query.month)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    )

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .where('expense.babyId = :babyId', { babyId })
      .andWhere('expense.expenseDate >= :start AND expense.expenseDate < :end', {
        start,
        end,
      })

    if (query.category) {
      qb.andWhere('expense.category = :category', { category: query.category })
    }

    const [expenses, total] = await qb
      .orderBy('expense.expenseDate', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const items = await this.withActorNames(expenses)

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  /**
   * 列表补记录人昵称：家庭共享时前端显示「奶奶记的」。
   * 一页最多 50 条，按 actorUserId 去重后一次查 users，不逐条 N+1。
   */
  private async withActorNames(items: Expense[]) {
    const actorIds = Array.from(
      new Set(
        items
          .map(item => item.actorUserId)
          .filter((id): id is string => !!id),
      ),
    )
    if (actorIds.length === 0) {
      return items.map(item => ({ ...item, actorName: null as string | null }))
    }

    const actors: { id: string; nickname: string }[] = await this.dataSource.query(
      `SELECT id, nickname FROM users WHERE id IN (${actorIds
        .map(() => '?')
        .join(',')})`,
      actorIds,
    )
    const nameMap = new Map(actors.map(actor => [actor.id, actor.nickname]))
    return items.map(item => ({
      ...item,
      actorName: item.actorUserId ? nameMap.get(item.actorUserId) ?? null : null,
    }))
  }

  async getSummary(userId: string, babyId: string, month?: string) {
    await this.assertEnabled()
    await this.babyService.findOne(babyId, userId)

    const { month: selectedMonth, start, end } = this.resolveMonth(month)
    const prevMonth = this.shiftMonth(selectedMonth, -1)
    const prevRange = this.resolveMonth(prevMonth)
    const recent = this.lastMonths(selectedMonth, 6)
    const recentStart = `${recent[0]}-01`
    const yearKey = selectedMonth.slice(0, 4)
    const yearStart = `${yearKey}-01-01`
    const yearEnd = `${Number(yearKey) + 1}-01-01`

    const [categoryRows, totalRows, yearRows, prevRows, monthRows, topRows, budgetRow] =
      await Promise.all([
      this.dataSource.query(
        `SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?
         GROUP BY category`,
        [babyId, start, end],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?`,
        [babyId, start, end],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?`,
        [babyId, yearStart, yearEnd],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?`,
        [babyId, prevRange.start, prevRange.end],
      ),
      this.dataSource.query(
        `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
                COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')`,
        [babyId, recentStart, end],
      ),
      this.dataSource.query(
        `SELECT amount, category, item_name AS itemName,
                DATE_FORMAT(expense_date, '%Y-%m-%d') AS expenseDate
         FROM expenses
         WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?
         ORDER BY amount DESC, created_at DESC
         LIMIT 1`,
        [babyId, start, end],
      ),
      this.budgetRepository.findOne({ where: { babyId } }),
    ])

    const totalRow = totalRows[0] || { count: 0, total: 0 }
    const total = this.round2(Number(totalRow.total) || 0)
    const count = Number(totalRow.count) || 0
    const prevTotal = this.round2(Number(prevRows[0]?.total) || 0)
    const yearTotal = this.round2(Number(yearRows[0]?.total) || 0)
    const yearCount = Number(yearRows[0]?.count) || 0

    const byCategory = categoryRows
      .map((row: any) => {
        const amount = this.round2(Number(row.amount) || 0)
        return {
          category: row.category as ExpenseCategoryCode,
          label: expenseCategoryLabel(row.category),
          amount,
          count: Number(row.count) || 0,
          percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
        }
      })
      .filter((row: any) => row.amount > 0)
      .sort((a: any, b: any) => b.amount - a.amount)

    const monthMap = new Map<string, number>(
      monthRows.map((row: any): [string, number] => [
        row.month,
        this.round2(Number(row.total) || 0),
      ]),
    )
    const recentMonths = recent.map((item) => ({
      month: item,
      total: monthMap.get(item) ?? 0,
    }))

    const topRow = topRows[0]
    const topExpense = topRow
      ? {
          amount: this.round2(Number(topRow.amount) || 0),
          category: topRow.category as ExpenseCategoryCode,
          itemName: topRow.itemName ?? null,
          expenseDate: this.formatDateOnly(topRow.expenseDate),
        }
      : null

    const [year, monthNumber] = selectedMonth.split('-').map(Number)
    const isCurrentMonth = selectedMonth === this.currentMonth()
    const days = isCurrentMonth
      ? new Date().getDate()
      : new Date(year, monthNumber, 0).getDate()

    const budgetAmount = budgetRow ? Number(budgetRow.amount) : null
    const budget =
      budgetAmount && budgetAmount > 0
        ? {
            amount: this.round2(budgetAmount),
            usedPercent: Math.round((total / budgetAmount) * 1000) / 10,
            remaining: this.round2(budgetAmount - total),
            isOver: total > budgetAmount,
          }
        : null

    return {
      month: selectedMonth,
      total,
      count,
      dailyAvg: days > 0 ? this.round2(total / days) : 0,
      prevTotal,
      deltaPercent:
        prevTotal > 0
          ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10
          : null,
      byCategory,
      topExpense,
      recentMonths,
      yearTotal,
      yearCount,
      budget,
    }
  }

  async findOne(userId: string, id: string) {
    await this.assertEnabled()
    const expense = await this.expenseRepository.findOne({ where: { id } })
    if (!expense) {
      throw new NotFoundException('花费记录不存在')
    }
    await this.babyService.findOne(expense.babyId, userId)
    return expense
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    await this.assertEnabled()
    const expense = await this.findOne(userId, id)
    const patch: Partial<Expense> = {}

    if (dto.amount !== undefined) patch.amount = this.normalizeAmount(dto.amount)
    if (dto.category !== undefined) patch.category = this.normalizeCategory(dto.category)
    if (dto.itemName !== undefined) patch.itemName = this.trimToNull(dto.itemName)
    if (dto.note !== undefined) patch.note = this.trimToNull(dto.note)
    if (dto.quantity !== undefined) patch.quantity = this.normalizeQuantity(dto.quantity)
    if (dto.unit !== undefined) patch.unit = this.normalizeUnit(dto.unit)
    if (dto.expenseDate !== undefined) {
      patch.expenseDate = this.normalizeDate(dto.expenseDate)
    }

    if (dto.itemName !== undefined || dto.note !== undefined) {
      await this.contentSecurity.checkUserTexts(userId, [dto.itemName, dto.note])
    }

    return this.expenseRepository.save({ ...expense, ...patch })
  }

  async remove(userId: string, id: string) {
    await this.assertEnabled()
    const expense = await this.findOne(userId, id)
    await this.expenseRepository.delete(expense.id)
    return { success: true }
  }

  /** 设置/清除每月预算；amount 为 null 表示清除 */
  async setBudget(userId: string, babyId: string, dto: SetBudgetDto) {
    await this.assertEnabled()
    await this.babyService.findOne(babyId, userId)

    if (dto.amount == null) {
      await this.budgetRepository.delete({ babyId })
      return { amount: null }
    }

    const amount = this.normalizeBudget(dto.amount)
    const existing = await this.budgetRepository.findOne({ where: { babyId } })
    if (existing) {
      existing.amount = amount
      await this.budgetRepository.save(existing)
    } else {
      await this.budgetRepository.save(
        this.budgetRepository.create({ babyId, amount }),
      )
    }
    return { amount }
  }

  async export(userId: string, babyId: string, startDate?: string, endDate?: string) {
    await this.assertEnabled()
    await this.babyService.findOne(babyId, userId)
    const { start, end } = this.parseExportRange(startDate, endDate)

    const rows: Array<{
      expenseDate: string | Date
      category: string
      itemName: string | null
      note: string | null
      amount: string | number
      quantity: string | number | null
      unit: string | null
      actorName: string | null
      createdAt: string | Date
    }> = await this.dataSource.query(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expenseDate,
              e.category,
              e.item_name AS itemName,
              e.note,
              e.amount,
              e.quantity,
              e.unit,
              DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i') AS createdAt,
              u.nickname AS actorName
       FROM expenses e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.baby_id = ? AND e.expense_date >= ? AND e.expense_date <= ?
       ORDER BY e.expense_date ASC, e.created_at ASC
       LIMIT ${MAX_EXPORT_ROWS}`,
      [babyId, start, end],
    )

    const header = [
      '日期',
      '分类',
      '项目',
      '金额(元)',
      '数量',
      '单位',
      '单价(元)',
      '备注',
      '记录人',
      '创建时间',
    ]
    const sheetRows = rows.map((row) => {
      const amount = Number(row.amount)
      const quantity = row.quantity == null ? null : Number(row.quantity)
      const unitPrice =
        quantity && quantity > 0 ? (amount / quantity).toFixed(2) : ''
      return [
        this.formatDateOnly(row.expenseDate),
        expenseCategoryLabel(row.category),
        row.itemName || '',
        amount.toFixed(2),
        quantity == null ? '' : String(quantity),
        row.unit || '',
        unitPrice,
        row.note || '',
        row.actorName || '',
        this.formatDateTime(row.createdAt),
      ]
    })

    const truncated = rows.length >= MAX_EXPORT_ROWS
    const buffer = buildXlsx([header, ...sheetRows], { sheetName: '养娃账本' })

    return {
      filename: `养娃账本_${start}_${end}.xlsx`,
      content: buffer.toString('base64'),
      encoding: 'base64' as const,
      total: rows.length,
      truncated,
      note: truncated
        ? `记录较多，仅导出最近 ${MAX_EXPORT_ROWS} 条，可缩小时间范围重试`
        : `导出区间 ${start} ~ ${end}`,
    }
  }

  private normalizeQuantity(value?: number | null): number | null {
    if (value == null) return null
    const quantity = Number(value)
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 999999) {
      throw new BadRequestException('数量需在 0.01 ~ 999999 之间')
    }
    return this.round2(quantity)
  }

  private normalizeUnit(value?: string | null): string | null {
    const unit = value?.trim()
    return unit ? unit.slice(0, 10) : null
  }

  private normalizeBudget(value: number): number {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 9999999.99) {
      throw new BadRequestException('预算需在 0.01 ~ 9999999.99 元之间')
    }
    return this.round2(amount)
  }

  private normalizeAmount(value: number): number {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0.01 || amount > MAX_AMOUNT) {
      throw new BadRequestException(
        `金额需在 0.01 ~ ${MAX_AMOUNT.toFixed(2)} 元之间`,
      )
    }
    return this.round2(amount)
  }

  private normalizeCategory(value: string): ExpenseCategoryCode {
    if (!isExpenseCategoryCode(value)) {
      throw new BadRequestException('花费分类不正确')
    }
    return value
  }

  private normalizeDate(value?: string): string {
    const date = value?.trim() || this.todayStr()
    if (!this.isDateString(date)) {
      throw new BadRequestException('花费日期格式应为 YYYY-MM-DD')
    }
    if (date > this.todayStr()) {
      throw new BadRequestException('花费日期不能晚于今天')
    }
    return date
  }

  private trimToNull(value?: string): string | null {
    const text = value?.trim()
    return text ? text : null
  }

  private resolveMonth(month?: string) {
    const current = this.currentMonth()
    const value = month?.trim() || current
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      throw new BadRequestException('月份格式应为 YYYY-MM')
    }
    if (value > current) {
      throw new BadRequestException('不能查询未来月份')
    }

    const [year, monthNumber] = value.split('-').map(Number)
    const start = `${value}-01`
    const end =
      monthNumber === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`
    return { month: value, start, end }
  }

  private shiftMonth(month: string, delta: number): string {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(year, monthNumber - 1 + delta, 1, 12)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  private lastMonths(endMonth: string, count: number): string[] {
    const result: string[] = []
    for (let i = count - 1; i >= 0; i--) {
      result.push(this.shiftMonth(endMonth, -i))
    }
    return result
  }

  private parseExportRange(startDate?: string, endDate?: string) {
    const today = this.todayStr()
    const end = this.isDateString(endDate) ? endDate! : today
    if (end > today) {
      throw new BadRequestException('结束日期不能晚于今天')
    }
    const start = this.isDateString(startDate)
      ? startDate!
      : `${end.slice(0, 7)}-01`

    if (start > end) {
      throw new BadRequestException('开始日期不能晚于结束日期')
    }

    const spanDays =
      Math.round(
        (new Date(`${end}T12:00:00`).getTime() -
          new Date(`${start}T12:00:00`).getTime()) /
          86400000,
      ) + 1
    if (spanDays > MAX_EXPORT_DAYS) {
      throw new BadRequestException(
        `导出范围最多 ${MAX_EXPORT_DAYS} 天，当前选择了 ${spanDays} 天，请缩小范围`,
      )
    }
    return { start, end }
  }

  private isDateString(value?: string): boolean {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12)
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    )
  }

  private todayStr(): string {
    return this.formatDate(new Date())
  }

  private currentMonth(): string {
    return this.todayStr().slice(0, 7)
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(date.getDate()).padStart(2, '0')}`
  }

  private formatDateOnly(value: string | Date): string {
    if (value instanceof Date) return this.formatDate(value)
    return String(value).slice(0, 10)
  }

  private formatDateTime(value: string | Date): string {
    if (value instanceof Date) {
      return `${this.formatDate(value)} ${String(value.getHours()).padStart(
        2,
        '0',
      )}:${String(value.getMinutes()).padStart(2, '0')}`
    }
    return String(value).replace('T', ' ').slice(0, 16)
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100
  }
}