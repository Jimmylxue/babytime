import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { decimalTransformer } from '../../../common/decimal.transformer'

/**
 * 养娃账本的每月预算（一个宝宝一条）。
 *
 * 不做按月单独设预算：那是记账 App 的复杂度，这里只需要「每月大致花多少」。
 * 历史月份也用同一个预算口径，客户端在汇总卡里显示已用/剩余/超支。
 */
@Entity('expense_budgets')
@Index('uk_expense_budgets_baby', ['babyId'], { unique: true })
export class ExpenseBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'baby_id', type: 'varchar' })
  babyId: string

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '每月预算（元）',
  })
  amount: number

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}