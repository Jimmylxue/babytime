import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BabyModule } from '../baby/baby.module'
import { ContentSecurityModule } from '../content-security/content-security.module'
import { SystemSettingsModule } from '../system-settings/system-settings.module'
import { Expense } from './entities/expense.entity'
import { ExpenseBudget } from './entities/expense-budget.entity'
import { ExpenseController } from './expense.controller'
import { ExpenseService } from './expense.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, ExpenseBudget]),
    BabyModule,
    ContentSecurityModule,
    SystemSettingsModule,
  ],
  controllers: [ExpenseController],
  providers: [ExpenseService],
})
export class ExpenseModule {}