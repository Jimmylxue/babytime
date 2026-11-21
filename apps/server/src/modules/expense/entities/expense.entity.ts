import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ExpenseCategoryCode } from '@baby-time/shared'
import { decimalTransformer } from '../../../common/decimal.transformer'

/**
 * 养娃账本（育儿花费）。
 *
 * 为什么不复用 records：
 * - records 是宝宝照护流水，会进首页条数、连续记录天数、统计页 tab、周报；
 *   花费混进去会污染这些口径。
 * - records.amount 语义是奶量（ml），不能再表示金额。
 *
 * 这是家庭共享账本：只要是通过家人邀请加入的成员（owner/editor/viewer）都能看和记，
 * 不沿用「viewer 只读」的限制 —— 长辈代买衣服也要能记一笔。
 */
@Entity('expenses')
@Index('idx_expenses_baby_date', ['babyId', 'expenseDate'])
@Index('idx_expenses_baby_category_date', ['babyId', 'category', 'expenseDate'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'baby_id', type: 'varchar' })
  babyId: string

  @Column({
    name: 'actor_user_id',
    type: 'varchar',
    nullable: true,
    comment: '实际记账的用户（家人代记时与创建者不同）',
  })
  actorUserId: string | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '金额（元）',
  })
  amount: number

  @Column({ type: 'varchar', length: 32, comment: '分类 code' })
  category: ExpenseCategoryCode

  @Column({
    name: 'item_name',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '买了什么，选填',
  })
  itemName: string | null

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '备注，选填',
  })
  note: string | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '数量/规格，选填（如 60）',
  })
  quantity: number | null

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    comment: '单位，选填（如 片、罐、包）',
  })
  unit: string | null

  @Column({
    name: 'expense_date',
    type: 'date',
    comment: '花费日期（本地日历日）',
  })
  expenseDate: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}