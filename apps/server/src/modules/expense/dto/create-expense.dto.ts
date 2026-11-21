import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { EXPENSE_CATEGORY_CODES, ExpenseCategoryCode } from '@baby-time/shared'

export class CreateExpenseDto {
  @IsUUID()
  babyId: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  amount: number

  @IsIn(EXPENSE_CATEGORY_CODES)
  category: ExpenseCategoryCode

  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  quantity?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unit?: string | null

  /** YYYY-MM-DD；不传默认今天，不能晚于今天 */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate?: string
}